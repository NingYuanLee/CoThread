import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { gzipSync, gunzipSync } from "node:zlib";
import { query } from "./db.js";
import { assetPath } from "./assets.js";
import { restoreSessionCheckpoint } from "./agent-checkpoint.js";
import { dshModelPatch, modelConfig, modelOutputLimit, redactSecrets } from "./model-config.js";
import { loadAgentCapabilityProfile } from "./agent-capabilities.js";
import { l1RuntimePatch } from "./dsh-runtime-config.js";

async function saveCheckpoint(db, projectId, home) {
  const files = {};
  async function walk(path, prefix = "") {
    for (const entry of await readdir(path, { withFileTypes: true }).catch(
      (error) => error.code === "ENOENT" ? [] : Promise.reject(error),
    )) {
      const relative = prefix + entry.name;
      if (entry.isDirectory()) await walk(join(path, entry.name), `${relative}/`);
      else if (entry.isFile()) files[relative] = (await readFile(join(path, entry.name))).toString("base64");
    }
  }
  await walk(join(home, "sessions"));
  const checkpoint = gzipSync(JSON.stringify(files));
  if (checkpoint.length > 10 * 1024 * 1024) throw new Error("L1 会话快照超过 10 MiB");
  await query(db, "UPDATE agent_project_sessions SET checkpoint=? WHERE project_id=?", [checkpoint, projectId]);
}

function parseJsonResponse(text) {
  const source = String(text || "").trim();
  const fenced = source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
  return JSON.parse(fenced || source);
}

export async function runL1Task(db, projectId, task, input, schema, options = {}) {
  const connection = await db.getConnection();
  const lockName = `cothread-l1:${projectId}`.slice(0, 64);
  let locked = false;
  let harness;
  let activeEventId = null;
  let projectSessionId = null;
  const beginPhase = async (phase) => {
    if (activeEventId) await query(db, `UPDATE agent_project_events SET status='completed',
      finished_at=UTC_TIMESTAMP(3) WHERE id=? AND status='running'`, [activeEventId]);
    const result = await query(db, `INSERT INTO agent_project_events
      (project_id,agent_session_id,task,phase,status) VALUES(?,?,?,?,'running')`,
    [projectId, projectSessionId, task, phase]);
    activeEventId = result.insertId;
  };
  const completePhase = async () => {
    if (!activeEventId) return;
    await query(db, `UPDATE agent_project_events SET status='completed',finished_at=UTC_TIMESTAMP(3)
      WHERE id=? AND status='running'`, [activeEventId]);
    activeEventId = null;
  };
  try {
    const [lock] = await query(connection, "SELECT GET_LOCK(?,0) acquired", [lockName]);
    if (Number(lock.acquired) !== 1) throw new Error("L1 正在处理该项目的其他维护任务");
    locked = true;
    await query(db, `INSERT IGNORE INTO agent_project_sessions(project_id,session_id)
      VALUES(?,?)`, [projectId, randomUUID()]);
    const [session] = await query(db, "SELECT * FROM agent_project_sessions WHERE project_id=?", [projectId]);
    projectSessionId = session.session_id;
    await beginPhase("prepare_context");
    await query(db, `UPDATE agent_project_sessions SET status='running',last_task=?,last_error=NULL,
      last_started_at=UTC_TIMESTAMP(3) WHERE project_id=?`, [task, projectId]);
    const root = process.env.COTHREAD_MAKERS === "true"
      ? resolve(tmpdir(), "cothread-agents") : resolve(".local/agents");
    const home = resolve(root, `l1-${projectId}`);
    await mkdir(home, { recursive: true });
    if (session.checkpoint) {
      const files = JSON.parse(gunzipSync(session.checkpoint, {
        maxOutputLength: 40 * 1024 * 1024,
      }).toString());
      await restoreSessionCheckpoint(files, home);
    }
    const runtimePatch = join(home, "l1-runtime.yml");
    const modelPatch = join(home, "l1-model.yml");
    await writeFile(runtimePatch,
      l1RuntimePatch());
    const configuredModel = options.model || modelConfig("knowledge");
    const capabilityProfile = await loadAgentCapabilityProfile(db, "l1");
    await writeFile(modelPatch, dshModelPatch(configuredModel));
    const env = {};
    for (const key of ["SystemRoot", "WINDIR", "PATH", "Path", "TEMP", "TMP", "COMSPEC", "PATHEXT", "LANG"])
      if (process.env[key]) env[key] = process.env[key];
    Object.assign(env, { MODEL_API_KEY: configuredModel.apiKey,
      COTHREAD_SKILLS_BY_LEVEL: JSON.stringify({ l1: capabilityProfile.instructions }),
      COTHREAD_SYSTEM_PROMPTS_BY_LEVEL: JSON.stringify({ l1: capabilityProfile.systemPrompt }),
      COTHREAD_PRIMARY_AGENT_LEVEL: "l1", COTHREAD_PRIMARY_AGENT_ID: session.session_id,
      HOME: home, USERPROFILE: home });
    const createHarness = options.createHarness || (async () => {
      const { DeepSeekHarness } = await import("@deepseek-ai/dsh-sdk-client");
      return new DeepSeekHarness({
        profile: "sdk-minimal", dshHome: home, processCwd: home, cwd: home,
        patches: [modelPatch, assetPath("runtime/l1-agent-patch.yml"), runtimePatch], env,
        provider: "cothread-compatible", model: configuredModel.model,
        initializeTimeoutMs: 30000, requestTimeoutMs: 600000,
        maxTokens: modelOutputLimit(configuredModel),
      });
    });
    await beginPhase("start_harness");
    harness = await createHarness();
    await harness.start();
    await beginPhase("model_run");
    const prompt = `维护任务类型：${task}\n项目 ID：${projectId}\n任务输入：${JSON.stringify(input)}\n严格返回任务要求的 JSON。`;
    const result = await harness.run(prompt, { sessionId: session.session_id });
    await beginPhase("validate_result");
    const parsed = schema.parse(parseJsonResponse(result.finalResponse));
    await harness.close();
    harness = null;
    await beginPhase("save_checkpoint");
    await saveCheckpoint(db, projectId, home);
    await query(db, `UPDATE agent_project_sessions SET status='idle',last_finished_at=UTC_TIMESTAMP(3),
      last_error=NULL WHERE project_id=?`, [projectId]);
    await completePhase();
    return parsed;
  } catch (error) {
    await harness?.close().catch(() => {});
    if (activeEventId) await query(db, `UPDATE agent_project_events SET status='failed',error=?,
      finished_at=UTC_TIMESTAMP(3) WHERE id=? AND status='running'`,
    [redactSecrets(error.message || error).slice(0, 1000), activeEventId]).catch(() => {});
    await query(db, `UPDATE agent_project_sessions SET status='failed',last_error=?,
      last_finished_at=UTC_TIMESTAMP(3) WHERE project_id=?`,
    [redactSecrets(error.message || error).slice(0, 255), projectId]).catch(() => {});
    throw error;
  } finally {
    try { if (locked) await query(connection, "SELECT RELEASE_LOCK(?)", [lockName]); }
    finally { connection.release(); }
  }
}
