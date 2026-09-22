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
import { L1_MAINTENANCE_TASKS, normalizeL1Task } from "../shared/agent-label.js";
import { contextBudget } from "../shared/context.js";
import { saveVisualArtifact } from "./visual-artifacts.js";

const L1_CONTEXT_BUDGET = contextBudget("knowledge");

export { L1_MAINTENANCE_TASKS, normalizeL1Task };

export function l1SessionScope(task, { projectId } = {}) {
  const normalized = normalizeL1Task(task);
  if (!projectId) throw new Error("L1 会话缺少项目 ID");
  if (!L1_MAINTENANCE_TASKS.includes(normalized)) throw new Error("未知的维护任务");
  return { task: normalized, scopeId: projectId };
}

async function saveCheckpoint(db, sessionRowId, home, modelMessages) {
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
  if (modelMessages) files["_cothread_context.json"] = Buffer.from(JSON.stringify(modelMessages)).toString("base64");
  const checkpoint = gzipSync(JSON.stringify(files));
  if (checkpoint.length > 10 * 1024 * 1024) throw new Error("L1 会话快照超过 10 MiB");
  await query(db, "UPDATE agent_project_sessions SET checkpoint=? WHERE id=?", [checkpoint, sessionRowId]);
}

async function sampleHistory(harness, sessionId) {
  if (!harness?.client?.request) return null;
  try {
    const history = await harness.client.request("cothread/history", { sessionId });
    return Array.isArray(history) && history.length ? history : null;
  } catch {
    return null;
  }
}

function parseJsonResponse(text) {
  const source = String(text || "").trim();
  const fenced = source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
  return JSON.parse(fenced || source);
}

async function sampleContextStats(harness, sessionId) {
  if (!harness?.client?.request) return null;
  try {
    return await harness.client.request("cothread/context", { sessionId });
  } catch {
    return null;
  }
}

async function requestCompact(harness, sessionId, automatic) {
  if (!harness?.client?.request) return null;
  return harness.client.request("cothread/compact", { sessionId, automatic: !!automatic }, 250000);
}

async function openL1Harness(db, projectId, session, scope, options = {}) {
  const root = process.env.COTHREAD_MAKERS === "true"
    ? resolve(tmpdir(), "cothread-agents") : resolve(".local/agents");
  const home = resolve(root, `l1-${scope.task}-${scope.scopeId}`);
  await mkdir(home, { recursive: true });
  if (session.checkpoint) {
    const files = JSON.parse(gunzipSync(session.checkpoint, {
      maxOutputLength: 40 * 1024 * 1024,
    }).toString());
    await restoreSessionCheckpoint(files, home);
  }
  const runtimePatch = join(home, "l1-runtime.yml");
  const modelPatch = join(home, "l1-model.yml");
  await writeFile(runtimePatch, l1RuntimePatch());
  const configuredModel = options.model || modelConfig("knowledge");
  const capabilityProfile = await loadAgentCapabilityProfile(db, "l1");
  await writeFile(modelPatch, dshModelPatch(configuredModel, "knowledge"));
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
  const harness = await createHarness();
  await harness.start();
  return { harness, home };
}

async function withL1Lock(db, scope, sessionLockHeld, work) {
  const lockName = `cothread-l1:${scope.task}:${scope.scopeId}`.slice(0, 64);
  if (sessionLockHeld) return work();
  const connection = await db.getConnection();
  let locked = false;
  try {
    const [lock] = await query(connection, "SELECT GET_LOCK(?,0) acquired", [lockName]);
    if (Number(lock.acquired) !== 1) throw new Error("该维护 Agent 正在处理其他任务");
    locked = true;
    return await work();
  } finally {
    try { if (locked) await query(connection, "SELECT RELEASE_LOCK(?)", [lockName]); }
    finally { connection.release(); }
  }
}

async function loadL1Session(db, projectId, scope) {
  await query(db, `INSERT IGNORE INTO agent_project_sessions
    (id,project_id,task,thread_id,scope_id,session_id) VALUES(?,?,?,?,?,?)`,
  [randomUUID(), projectId, scope.task, null, scope.scopeId, randomUUID()]);
  const [session] = await query(db,
    "SELECT * FROM agent_project_sessions WHERE project_id=? AND task=? AND scope_id=?",
    [projectId, scope.task, scope.scopeId]);
  return session;
}

export async function runL1Task(db, projectId, task, input, schema, options = {}) {
  const scope = l1SessionScope(task, { projectId });
  const eventThreadId = options.threadId || null;
  let harness;
  let activeEventId = null;
  let projectSessionId = null;
  let sessionRowId = null;
  const beginPhase = async (phase) => {
    if (activeEventId) await query(db, `UPDATE agent_project_events SET status='completed',
      finished_at=UTC_TIMESTAMP(3) WHERE id=? AND status='running'`, [activeEventId]);
    const result = await query(db, `INSERT INTO agent_project_events
      (project_id,agent_session_id,task,thread_id,phase,status) VALUES(?,?,?,?,?,'running')`,
    [projectId, projectSessionId, scope.task, eventThreadId, phase]);
    activeEventId = result.insertId;
  };
  const completePhase = async () => {
    if (!activeEventId) return;
    await query(db, `UPDATE agent_project_events SET status='completed',finished_at=UTC_TIMESTAMP(3)
      WHERE id=? AND status='running'`, [activeEventId]);
    activeEventId = null;
  };
  try {
    return await withL1Lock(db, scope, options.sessionLockHeld, async () => {
      const session = await loadL1Session(db, projectId, scope);
      sessionRowId = session.id;
      projectSessionId = session.session_id;
      await beginPhase("prepare_context");
      await query(db, `UPDATE agent_project_sessions SET status='running',last_error=NULL,
        last_started_at=UTC_TIMESTAMP(3) WHERE id=?`, [sessionRowId]);
      await beginPhase("start_harness");
      const opened = await openL1Harness(db, projectId, session, scope, options);
      harness = opened.harness;
      const pressure = await sampleContextStats(harness, session.session_id);
      if (pressure?.used >= (pressure.autoCompactAt ?? L1_CONTEXT_BUDGET.autoCompactAt)) {
        await beginPhase("compact_context");
        try { await requestCompact(harness, session.session_id, true); }
        catch (error) {
          console.error("Automatic L1 compaction skipped", {
            type: error?.name || "Error",
            diagnostic: redactSecrets(error?.message || error).slice(-1000),
          });
        }
      }
      await beginPhase("model_run");
      if (options.image?.data) {
        const image = Buffer.from(options.image.data, "base64");
        await saveVisualArtifact(db, {
          projectId,
          agentProjectEventId: activeEventId,
          content: image,
          mime: options.image.mimeType || "image/png",
          source: "l1_visual_verification",
        });
      }
      const prompt = `维护任务类型：${scope.task}\n项目 ID：${projectId}${eventThreadId ? `\n迭代 ID：${eventThreadId}` : ""}\n任务输入：${JSON.stringify(input)}\n严格返回任务要求的 JSON。`;
      const promptInput = options.image
        ? [{ type: "text", text: prompt }, { type: "image", data: options.image.data, mimeType: options.image.mimeType || "image/png" }]
        : prompt;
      const result = await harness.run(promptInput, { sessionId: session.session_id });
      await beginPhase("validate_result");
      const parsed = schema.parse(parseJsonResponse(result.finalResponse));
      const contextStats = await sampleContextStats(harness, session.session_id);
      const history = await sampleHistory(harness, session.session_id);
      await harness.close();
      harness = null;
      await beginPhase("save_checkpoint");
      await saveCheckpoint(db, sessionRowId, opened.home, history);
      await query(db, `UPDATE agent_project_sessions SET status='idle',last_finished_at=UTC_TIMESTAMP(3),
        last_error=NULL,context_stats=COALESCE(?,context_stats) WHERE id=?`,
      [contextStats ? JSON.stringify(contextStats) : null, sessionRowId]);
      await completePhase();
      return parsed;
    });
  } catch (error) {
    await harness?.close().catch(() => {});
    if (activeEventId) await query(db, `UPDATE agent_project_events SET status='failed',error=?,
      finished_at=UTC_TIMESTAMP(3) WHERE id=? AND status='running'`,
    [redactSecrets(error.message || error).slice(0, 1000), activeEventId]).catch(() => {});
    if (sessionRowId) await query(db, `UPDATE agent_project_sessions SET status='failed',last_error=?,
      last_finished_at=UTC_TIMESTAMP(3) WHERE id=?`,
    [redactSecrets(error.message || error).slice(0, 255), sessionRowId]).catch(() => {});
    throw error;
  }
}

export async function compactL1Session(db, projectId, task, options = {}) {
  const scope = l1SessionScope(task, { projectId });
  let harness;
  try {
    return await withL1Lock(db, scope, options.sessionLockHeld, async () => {
      const session = await loadL1Session(db, projectId, scope);
      const opened = await openL1Harness(db, projectId, session, scope, options);
      harness = opened.harness;
      const before = await sampleContextStats(harness, session.session_id);
      const used = before?.used || 0;
      if (!options.automatic && used < 4096) {
        await harness.close();
        harness = null;
        return { before: used, after: used, changed: false, reason: "already_small" };
      }
      const result = !options.automatic || used >= (before?.autoCompactAt ?? L1_CONTEXT_BUDGET.autoCompactAt)
        ? await requestCompact(harness, session.session_id, !!options.automatic)
        : { before: used, after: used, changed: false };
      const after = await sampleContextStats(harness, session.session_id);
      const history = await sampleHistory(harness, session.session_id);
      await saveCheckpoint(db, session.id, opened.home, history);
      await query(db, `UPDATE agent_project_sessions SET context_stats=COALESCE(?,context_stats) WHERE id=?`,
        [after ? JSON.stringify(after) : null, session.id]);
      await harness.close();
      harness = null;
      return result || { before: used, after: after?.used || used, changed: false };
    });
  } catch (error) {
    await harness?.close().catch(() => {});
    throw error;
  }
}
