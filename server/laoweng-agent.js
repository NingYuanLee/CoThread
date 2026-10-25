import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { query } from "./db.js";
import { acquireNamedLock } from "./named-lock.js";
import { assetPath } from "./assets.js";
import { hasSessionLog, restoreSessionCheckpoint } from "./agent-checkpoint.js";
import { dshModelMaxTokens, dshModelPatch, modelConfig, redactSecrets } from "./model-config.js";
import { loadAgentCapabilityProfile } from "./agent-capabilities.js";
import { laowengRuntimePatch } from "./dsh-runtime-config.js";
import {
  LAOWENG_MAINTENANCE_TASKS,
  laowengTaskLabel,
  normalizeLaowengTask,
} from "../shared/agent-label.js";
import { contextBudget } from "../shared/context.js";
import { saveVisualArtifact } from "./visual-artifacts.js";
import { buildMaintenanceTurn } from "../shared/prompt-blocks.js";

const LAOWENG_CONTEXT_BUDGET = contextBudget("knowledge");

export { LAOWENG_MAINTENANCE_TASKS, normalizeLaowengTask };

export function laowengSessionScope(task, { projectId } = {}) {
  const normalized = normalizeLaowengTask(task);
  if (!projectId) throw new Error("老翁 会话缺少项目 ID");
  if (!LAOWENG_MAINTENANCE_TASKS.includes(normalized)) throw new Error("未知的维护任务");
  return { task: normalized, scopeId: projectId };
}

/** 维护任务的输入摘要：轨迹「准备上下文」那行要能看出本轮带进来多少东西。 */
function maintenanceInputSummary(input) {
  if (!input || typeof input !== "object") return "输入：无";
  const parts = [];
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) parts.push(`${key} ${value.length} 条`);
    else if (typeof value === "string" && value.trim())
      parts.push(`${key} ${value.trim().length} 字`);
    else if (value && typeof value === "object") parts.push(`${key} 已就绪`);
  }
  return parts.length ? `输入：${parts.join(" · ")}` : "输入：无";
}

async function saveCheckpoint(db, sessionRowId, home, modelMessages) {
  const files = {};
  async function walk(path, prefix = "") {
    for (const entry of await readdir(path, { withFileTypes: true }).catch((error) =>
      error.code === "ENOENT" ? [] : Promise.reject(error),
    )) {
      const relative = prefix + entry.name;
      if (entry.isDirectory()) await walk(join(path, entry.name), `${relative}/`);
      else if (entry.isFile())
        files[relative] = (await readFile(join(path, entry.name))).toString("base64");
    }
  }
  await walk(join(home, "sessions"));
  if (modelMessages)
    files["_cothread_context.json"] = Buffer.from(JSON.stringify(modelMessages)).toString("base64");
  const checkpoint = gzipSync(JSON.stringify(files));
  if (checkpoint.length > 10 * 1024 * 1024) throw new Error("老翁 会话快照超过 10 MiB");
  await query(db, "UPDATE agent_project_sessions SET checkpoint=? WHERE id=?", [
    checkpoint,
    sessionRowId,
  ]);
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

function providerFailure(result) {
  const events = Array.isArray(result?.events) ? result.events : [];
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event?.type !== "turn/end") continue;
    const reason = event.data?.reason;
    if (reason?.kind !== "error") return null;
    return String(reason.error?.message || reason.message || "模型没有返回结果").slice(0, 500);
  }
  return null;
}

function parseJsonResponse(text) {
  const source = String(text || "").trim();
  if (!source) throw new SyntaxError("老翁 返回空内容，无法解析 JSON");
  const fenced = source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
  const candidate = fenced || source;
  try {
    return JSON.parse(candidate);
  } catch (error) {
    const embedded = candidate.match(/\{[\s\S]*\}|\[[\s\S]*\]/)?.[0];
    if (embedded && embedded !== candidate) {
      try {
        return JSON.parse(embedded);
      } catch {
        /* fall through */
      }
    }
    // 模型偶尔会多写一个右花括号（例如 conclusion 提前收尾后继续写 taskDecisions），
    // 使整份结果不可解析。逐个去掉「紧跟字符串值、后面仍是键值对」的多余 } 再试，
    // 解析成功与否由调用方 schema 继续把关。
    for (const match of candidate.matchAll(/"\}(?=\s*,")/g)) {
      const index = match.index + 1;
      try {
        return JSON.parse(candidate.slice(0, index) + candidate.slice(index + 1));
      } catch {
        /* 继续尝试下一个候选 */
      }
    }
    const hint = candidate.slice(0, 120).replace(/\s+/g, " ");
    throw new SyntaxError(`老翁 返回无法解析的 JSON: ${error.message}; preview=${hint}`);
  }
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

async function openLaowengHarness(db, projectId, session, scope, options = {}) {
  const root = resolve(".local/agents");
  const home = resolve(root, `laoweng-${scope.task}-${scope.scopeId}`);
  await mkdir(home, { recursive: true });
  if (session.checkpoint) {
    const files = JSON.parse(
      gunzipSync(session.checkpoint, {
        maxOutputLength: 40 * 1024 * 1024,
      }).toString(),
    );
    await restoreSessionCheckpoint(files, home);
  }
  // A run that created the session log but failed before saving a checkpoint still
  // owns that id on disk; re-creating it fails with 'session "<id>" already exists'
  // on every retry, so resume whenever the log is present.
  const resumeSessionId =
    Boolean(session.checkpoint) || (await hasSessionLog(home, session.session_id))
      ? session.session_id
      : "";
  const runtimePatch = join(home, "laoweng-runtime.yml");
  const modelPatch = join(home, "laoweng-model.yml");
  await writeFile(runtimePatch, laowengRuntimePatch());
  const configuredModel = options.model || modelConfig("knowledge");
  const capabilityProfile = await loadAgentCapabilityProfile(db, "laoweng");
  await writeFile(modelPatch, dshModelPatch(configuredModel, "knowledge"));
  const env = {};
  for (const key of [
    "SystemRoot",
    "WINDIR",
    "PATH",
    "Path",
    "TEMP",
    "TMP",
    "COMSPEC",
    "PATHEXT",
    "LANG",
  ])
    if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, {
    MODEL_API_KEY: configuredModel.apiKey,
    COTHREAD_SKILLS_BY_LEVEL: JSON.stringify({ laoweng: capabilityProfile.instructions }),
    COTHREAD_SYSTEM_PROMPTS_BY_LEVEL: JSON.stringify({ laoweng: capabilityProfile.systemPrompt }),
    COTHREAD_PRIMARY_AGENT_LEVEL: "laoweng",
    COTHREAD_PRIMARY_AGENT_ID: session.session_id,
    // sdk-resume only opens an existing log when this matches. A named prompt
    // otherwise creates, and the restored checkpoint then collides.
    COTHREAD_RESUME_SESSION: resumeSessionId,
    HOME: home,
    USERPROFILE: home,
  });
  const harnessOptions = {
    profile: "sdk-minimal",
    dshHome: home,
    processCwd: home,
    cwd: home,
    patches: [modelPatch, assetPath("dsh-layer/laoweng-agent-patch.yml"), runtimePatch],
    env,
    provider: "cothread-compatible",
    model: configuredModel.model,
    initializeTimeoutMs: 30000,
    requestTimeoutMs: 600000,
    maxTokens: dshModelMaxTokens(configuredModel, "knowledge"),
  };
  const createHarness =
    options.createHarness ||
    (async () => {
      const { DeepSeekHarness } = await import("@deepseek-ai/dsh-sdk-client");
      return new DeepSeekHarness(harnessOptions);
    });
  const harness = await createHarness(harnessOptions);
  await harness.start();
  return { harness, home };
}

async function withLaowengLock(db, scope, sessionLockHeld, work) {
  const lockName = `cothread-laoweng:${scope.task}:${scope.scopeId}`.slice(0, 64);
  if (sessionLockHeld) return work();
  const lock = await acquireNamedLock(db, lockName);
  if (!lock) throw new Error("该维护 Agent 正在处理其他任务");
  try {
    return await work();
  } finally {
    await lock.release();
  }
}

async function loadLaowengSession(db, projectId, scope) {
  await query(
    db,
    `INSERT IGNORE INTO agent_project_sessions
    (id,project_id,task,thread_id,scope_id,session_id) VALUES(?,?,?,?,?,?)`,
    [randomUUID(), projectId, scope.task, null, scope.scopeId, randomUUID()],
  );
  const [session] = await query(
    db,
    "SELECT * FROM agent_project_sessions WHERE project_id=? AND task=? AND scope_id=?",
    [projectId, scope.task, scope.scopeId],
  );
  return session;
}

export async function runLaowengTask(db, projectId, task, input, schema, options = {}) {
  const scope = laowengSessionScope(task, { projectId });
  const eventThreadId = options.threadId || null;
  // 这次运行是定时自动还是「立即整理」手动触发：轨迹的输入行据此标「定时任务 / 手动任务」。
  const triggerSource = options.trigger === "user" ? "user" : "schedule";
  let harness;
  let activeEventId = null;
  let projectSessionId = null;
  let sessionRowId = null;
  const beginPhase = async (phase, summary = null) => {
    if (activeEventId)
      await query(
        db,
        `UPDATE agent_project_events SET status='completed',
      finished_at=UTC_TIMESTAMP(3) WHERE id=? AND status='running'`,
        [activeEventId],
      );
    const result = await query(
      db,
      `INSERT INTO agent_project_events
      (project_id,agent_session_id,task,thread_id,phase,status,summary,trigger_source) VALUES(?,?,?,?,?,'running',?,?)`,
      [
        projectId,
        projectSessionId,
        scope.task,
        eventThreadId,
        phase,
        summary == null ? null : String(summary).slice(0, 2000),
        triggerSource,
      ],
    );
    activeEventId = result.insertId;
  };
  // 阶段进行中补摘要：轨迹里每行都要能看出这步干了什么。
  const notePhase = async (summary) => {
    if (!activeEventId || !summary) return;
    await query(db, "UPDATE agent_project_events SET summary=? WHERE id=?", [
      String(summary).slice(0, 2000),
      activeEventId,
    ]).catch(() => {});
  };
  const completePhase = async () => {
    if (!activeEventId) return;
    await query(
      db,
      `UPDATE agent_project_events SET status='completed',finished_at=UTC_TIMESTAMP(3)
      WHERE id=? AND status='running'`,
      [activeEventId],
    );
    activeEventId = null;
  };
  try {
    return await withLaowengLock(db, scope, options.sessionLockHeld, async () => {
      const session = await loadLaowengSession(db, projectId, scope);
      sessionRowId = session.id;
      projectSessionId = session.session_id;
      await beginPhase(
        "prepare_context",
        `范围：项目 · 任务：${laowengTaskLabel(scope.task)} · ${maintenanceInputSummary(input)}`,
      );
      await query(
        db,
        `UPDATE agent_project_sessions SET status='running',last_error=NULL,
        last_started_at=UTC_TIMESTAMP(3) WHERE id=?`,
        [sessionRowId],
      );
      await beginPhase("start_harness");
      const opened = await openLaowengHarness(db, projectId, session, scope, options);
      harness = opened.harness;
      const pressure = await sampleContextStats(harness, session.session_id);
      await notePhase(
        `会话 ${String(session.session_id || "").slice(0, 8)} · 上下文 ${Math.round((pressure?.used || 0) / 100)} 词元`,
      );
      if (pressure?.used >= (pressure?.autoCompactAt ?? LAOWENG_CONTEXT_BUDGET.autoCompactAt)) {
        await beginPhase("compact_context");
        try {
          const compacted = await requestCompact(harness, session.session_id, true);
          await notePhase(
            compacted?.changed
              ? `压缩 ${compacted.before ?? "?"} → ${compacted.after ?? "?"} 词元`
              : "上下文未超过阈值，没有压缩",
          );
        } catch (error) {
          console.error("Automatic 老翁 compaction skipped", {
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
      const prompt = buildMaintenanceTurn({
        projectId,
        workType: scope.task,
        iterationId: eventThreadId,
        input,
      }).prompt;
      const promptInput = options.image
        ? [
            { type: "text", text: prompt },
            {
              type: "image",
              data: options.image.data,
              mimeType: options.image.mimeType || "image/png",
            },
          ]
        : prompt;
      const result = await harness.run(promptInput, { sessionId: session.session_id });
      const failure = providerFailure(result);
      if (failure) throw new Error(failure);
      const responseText = String(result.finalResponse || "").trim();
      await notePhase(
        responseText
          ? `结论：${responseText.replace(/\s+/g, " ").slice(0, 160)}`
          : "模型没有返回正文",
      );
      await beginPhase("validate_result");
      const parsed = schema.parse(parseJsonResponse(result.finalResponse));
      await notePhase(
        `校验通过 · ${
          Object.keys(parsed || {})
            .slice(0, 8)
            .join("、") || "无字段"
        }`,
      );
      const contextStats = await sampleContextStats(harness, session.session_id);
      const history = await sampleHistory(harness, session.session_id);
      await harness.close();
      harness = null;
      await beginPhase("save_checkpoint");
      await saveCheckpoint(db, sessionRowId, opened.home, history);
      await notePhase(
        `检查点已保存 · 上下文 ${Math.round((contextStats?.used || 0) / 100)} 词元 · 历史 ${Array.isArray(history) ? history.length : 0} 条`,
      );
      await query(
        db,
        `UPDATE agent_project_sessions SET status='idle',last_finished_at=UTC_TIMESTAMP(3),
        last_error=NULL,context_stats=COALESCE(?,context_stats) WHERE id=?`,
        [contextStats ? JSON.stringify(contextStats) : null, sessionRowId],
      );
      await completePhase();
      return parsed;
    });
  } catch (error) {
    await harness?.close().catch(() => {});
    if (activeEventId) {
      const reason = redactSecrets(error.message || error);
      await query(
        db,
        `UPDATE agent_project_events SET status='failed',error=?,summary=COALESCE(summary,?),
      finished_at=UTC_TIMESTAMP(3) WHERE id=? AND status='running'`,
        [
          reason.slice(0, 1000),
          `失败：${reason.replace(/\s+/g, " ").slice(0, 160)}`,
          activeEventId,
        ],
      ).catch(() => {});
    }
    if (sessionRowId)
      await query(
        db,
        `UPDATE agent_project_sessions SET status='failed',last_error=?,
      last_finished_at=UTC_TIMESTAMP(3) WHERE id=?`,
        [redactSecrets(error.message || error).slice(0, 255), sessionRowId],
      ).catch(() => {});
    throw error;
  }
}

export async function compactLaowengSession(db, projectId, task, options = {}) {
  const scope = laowengSessionScope(task, { projectId });
  let harness;
  try {
    return await withLaowengLock(db, scope, options.sessionLockHeld, async () => {
      const session = await loadLaowengSession(db, projectId, scope);
      const opened = await openLaowengHarness(db, projectId, session, scope, options);
      harness = opened.harness;
      const before = await sampleContextStats(harness, session.session_id);
      const used = before?.used || 0;
      if (!options.automatic && used < 4096) {
        await harness.close();
        harness = null;
        return { before: used, after: used, changed: false, reason: "already_small" };
      }
      const result =
        !options.automatic ||
        used >= (before?.autoCompactAt ?? LAOWENG_CONTEXT_BUDGET.autoCompactAt)
          ? await requestCompact(harness, session.session_id, !!options.automatic)
          : { before: used, after: used, changed: false };
      const after = await sampleContextStats(harness, session.session_id);
      const history = await sampleHistory(harness, session.session_id);
      await saveCheckpoint(db, session.id, opened.home, history);
      await query(
        db,
        `UPDATE agent_project_sessions SET context_stats=COALESCE(?,context_stats) WHERE id=?`,
        [after ? JSON.stringify(after) : null, session.id],
      );
      await harness.close();
      harness = null;
      return result || { before: used, after: after?.used || used, changed: false };
    });
  } catch (error) {
    await harness?.close().catch(() => {});
    throw error;
  }
}
