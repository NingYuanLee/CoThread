import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { query } from "./db.ts";
import { acquireNamedLock } from "./named-lock.ts";
import { assetPath } from "./assets.ts";
import { dedupeSessionLogs, hasSessionLog, restoreSessionCheckpoint } from "./agent-checkpoint.ts";
import { dshModelMaxTokens, dshModelPatch, modelConfig, redactSecrets } from "./model-config.js";
import { loadAgentCapabilityProfile } from "./agent-capabilities.ts";
import { laowengRuntimePatch, elderRuntimePatch } from "./dsh-runtime-config.ts";
import {
  LAOWENG_MAINTENANCE_TASKS,
  laowengTaskLabel,
  normalizeLaowengTask,
} from "../shared/agent-label.js";
import { contextBudget } from "../shared/context.js";
import { saveVisualArtifact } from "./visual-artifacts.ts";
import { buildMaintenanceTurn } from "../shared/prompt-blocks.js";
import { createUsageMeter } from "./agent-usage.ts";
import type { Pool } from "mysql2/promise";
import type { Db } from "./types.ts";
import type { DeepSeekHarness, RunResult } from "@deepseek-ai/dsh-sdk-client";

const LAOWENG_CONTEXT_BUDGET = contextBudget("knowledge");
/** 维护会话快照上限；超过即视为历史累积过量，重置会话而不是让运行反复失败。 */
const LAOWENG_CHECKPOINT_LIMIT_BYTES = 10 * 1024 * 1024;

export { LAOWENG_MAINTENANCE_TASKS, normalizeLaowengTask };

/** 维护会话的归属：按任务名与项目 ID 定位一份 DSH 会话。 */
type LaowengScope = { task: string; scopeId: string };

/** `agent_project_sessions` 里本文件读到的列。 */
type LaowengSessionRow = {
  id: string;
  session_id: string;
  checkpoint?: Buffer | string | null;
  context_stats?: unknown;
  [column: string]: unknown;
};

/** DSH SDK 运行时对象；测试会注入自己的替身。 */
type LaowengHarness = DeepSeekHarness;
type LaowengHarnessOptions = NonNullable<ConstructorParameters<typeof DeepSeekHarness>[0]>;
type CreateLaowengHarness = (
  options: LaowengHarnessOptions,
) => LaowengHarness | Promise<LaowengHarness>;

/** `cothread/context` 的采样结果：自定义方法不在协议类型里，只声明读到的字段。 */
type LaowengContextSample = {
  used?: number;
  autoCompactAt?: number;
  categories?: { discussion?: number; assistant?: number };
  [field: string]: unknown;
};

/** `cothread/compact` 的结果。 */
type LaowengCompactResult = {
  changed?: boolean;
  reason?: string;
  before?: number;
  after?: number;
  [field: string]: unknown;
};

/** 运行日志里的一条事件：只声明失败判定读到的字段。 */
type LaowengRunEvent = {
  type?: string;
  data?: { reason?: { kind?: string; message?: string; error?: { message?: string } } };
  [field: string]: unknown;
};

/** 模型返回的结构校验器；`parse` 的类型即调用方的结果类型。 */
type LaowengSchema<T> = { parse: (value: unknown) => T };

/**
 * 运行选项：键名固定，值多为未转换模块传来的 `Record<string, unknown>`，
 * 所以这里保持 `unknown`，由使用处各自收口。
 */
type LaowengRunOptions = {
  threadId?: unknown;
  trigger?: unknown;
  sessionLockHeld?: unknown;
  image?: unknown;
  readToolResult?: unknown;
  checkpointLimitBytes?: unknown;
  agentsRoot?: unknown;
  conversationToolEnv?: unknown;
  model?: unknown;
  createHarness?: unknown;
  automatic?: unknown;
};

/** 视觉复核附件的形状（`options.image`）。 */
type LaowengImageInput = { data: string; mimeType?: string };

export function laowengSessionScope(
  task: unknown,
  { projectId }: { projectId?: string } = {},
): LaowengScope {
  const normalized = normalizeLaowengTask(task as string | null | undefined);
  if (!projectId) throw new Error("老翁 会话缺少项目 ID");
  if (!LAOWENG_MAINTENANCE_TASKS.includes(normalized)) throw new Error("未知的维护任务");
  return { task: normalized, scopeId: projectId };
}

/** 维护任务的输入摘要：轨迹「准备上下文」那行要能看出本轮带进来多少东西。 */
function maintenanceInputSummary(input: unknown): string {
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

async function saveCheckpoint(
  db: Db,
  sessionRowId: string,
  home: string,
  modelMessages: unknown,
  limitBytes: unknown,
): Promise<void> {
  const files: Record<string, string> = {};
  async function walk(path: string, prefix = ""): Promise<void> {
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
  // Image blocks in the session log contain references, not the image bytes.
  // Keep the durable attachment store alongside the log when moving hosts.
  await walk(join(home, "attachments"), "_attachments/");
  if (modelMessages)
    files["_cothread_context.json"] = Buffer.from(JSON.stringify(modelMessages)).toString("base64");
  const checkpoint = gzipSync(JSON.stringify(files));
  const limit = Number(limitBytes) > 0 ? Number(limitBytes) : LAOWENG_CHECKPOINT_LIMIT_BYTES;
  const limitMb = Math.max(1, Math.round(limit / (1024 * 1024)));
  if (checkpoint.length > limit) throw new Error(`老翁 会话快照超过 ${limitMb} MiB`);
  await query(db, "UPDATE agent_project_sessions SET checkpoint=? WHERE id=?", [
    checkpoint,
    sessionRowId,
  ]);
}

/**
 * 会话历史累积到快照超过上限时，快照永远存不进去，每次运行都会在结尾失败，作业就此卡死。
 * 这不是本次结果的问题：换一个新的 DSH 会话（旧日志移走、检查点清空），本次已校验的结果
 * 照常返回，下一次运行从干净上下文继续。代价是维护会话的连续性，但好过整项作业无法处理。
 */
async function resetOversizedLaowengSession(
  db: Db,
  sessionRowId: string,
  home: string,
): Promise<void> {
  await rm(join(home, "sessions"), { recursive: true, force: true });
  await query(
    db,
    `UPDATE agent_project_sessions SET session_id=?,checkpoint=NULL,context_stats=NULL,
     status='idle',last_error=NULL,last_finished_at=UTC_TIMESTAMP(3) WHERE id=?`,
    [randomUUID(), sessionRowId],
  );
}

async function sampleHistory(
  harness: LaowengHarness,
  sessionId: string,
): Promise<unknown[] | null> {
  if (!harness?.client?.request) return null;
  try {
    const history = await harness.client.request("cothread/history", { sessionId });
    return Array.isArray(history) && history.length ? history : null;
  } catch {
    return null;
  }
}

function providerFailure(result: { events?: unknown[] } | null | undefined): string | null {
  const events = (Array.isArray(result?.events) ? result.events : []) as LaowengRunEvent[];
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event?.type !== "turn/end") continue;
    const reason = event.data?.reason;
    if (reason?.kind !== "error") return null;
    return String(reason.error?.message || reason.message || "模型没有返回结果").slice(0, 500);
  }
  return null;
}

function parseJsonResponse(text: unknown): unknown {
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
    throw new SyntaxError(`老翁 返回无法解析的 JSON: ${(error as Error).message}; preview=${hint}`);
  }
}

async function sampleContextStats(
  harness: LaowengHarness,
  sessionId: string,
): Promise<LaowengContextSample | null> {
  if (!harness?.client?.request) return null;
  try {
    return (await harness.client.request("cothread/context", {
      sessionId,
    })) as LaowengContextSample;
  } catch {
    return null;
  }
}

async function requestCompact(
  harness: LaowengHarness,
  sessionId: string,
  automatic: unknown,
): Promise<LaowengCompactResult | null> {
  if (!harness?.client?.request) return null;
  return (await harness.client.request(
    "cothread/compact",
    { sessionId, automatic: !!automatic },
    250000,
  )) as LaowengCompactResult | null;
}

async function openLaowengHarness(
  db: Db,
  projectId: string,
  session: LaowengSessionRow,
  scope: LaowengScope,
  options: LaowengRunOptions = {},
): Promise<{ harness: LaowengHarness; home: string }> {
  // `.local` 在每个 release 目录里都是指向 /opt/cothread/.local 的软链；resolve 不解析软链，
  // 直接用路径拼写会让 home 随每次发布变化，同一会话被记到新的项目目录下（重复 JSONL）。
  // agentsRoot 只给测试注入可写根目录，线上始终用 `.local/agents`。
  const root = options.agentsRoot
    ? resolve(options.agentsRoot as string)
    : await realpath(resolve(".local/agents")).catch(() => resolve(".local/agents"));
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
  // 同一 home 改名或搬迁后，会话 id 可能同时在旧、新两个项目目录下各留一份日志，
  // DSH 的 findLog 遇到重复会在 model_run 前直接抛错，之后每次维护都失败。
  // 开跑前收敛成一份，避免一条残留目录把整个任务卡死。
  for (const repaired of await dedupeSessionLogs(home)) {
    console.warn("老翁会话日志去重", {
      sessionId: repaired.id,
      kept: repaired.kept,
      movedTo: repaired.to,
    });
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
  await writeFile(
    runtimePatch,
    options.conversationToolEnv ? elderRuntimePatch() : laowengRuntimePatch(),
  );
  const configuredModel =
    (options.model as ReturnType<typeof modelConfig> | undefined) || modelConfig("knowledge");
  const capabilityProfile = await loadAgentCapabilityProfile(db, "laoweng");
  await writeFile(modelPatch, dshModelPatch(configuredModel, "knowledge", { imageInput: true }));
  const env: NodeJS.ProcessEnv = {};
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
    ...((options.conversationToolEnv || {}) as Record<string, string>),
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
  const createHarness: CreateLaowengHarness =
    (options.createHarness as CreateLaowengHarness | undefined) ||
    (async (harnessOptions: LaowengHarnessOptions) => {
      const { DeepSeekHarness } = await import("@deepseek-ai/dsh-sdk-client");
      return new DeepSeekHarness(harnessOptions);
    });
  const harness = await createHarness(harnessOptions);
  await harness.start();
  return { harness, home };
}

async function withLaowengLock<T>(
  db: Db,
  scope: LaowengScope,
  sessionLockHeld: unknown,
  work: () => Promise<T>,
): Promise<T> {
  const lockName = `cothread-laoweng:${scope.task}:${scope.scopeId}`.slice(0, 64);
  if (sessionLockHeld) return work();
  const lock = await acquireNamedLock(db as Pool, lockName);
  if (!lock) throw new Error("该维护 Agent 正在处理其他任务");
  try {
    return await work();
  } finally {
    await lock.release();
  }
}

async function loadLaowengSession(
  db: Db,
  projectId: string,
  scope: LaowengScope,
): Promise<LaowengSessionRow> {
  await query(
    db,
    `INSERT IGNORE INTO agent_project_sessions
    (id,project_id,task,thread_id,scope_id,session_id) VALUES(?,?,?,?,?,?)`,
    [randomUUID(), projectId, scope.task, null, scope.scopeId, randomUUID()],
  );
  const [session] = await query<LaowengSessionRow>(
    db,
    "SELECT * FROM agent_project_sessions WHERE project_id=? AND task=? AND scope_id=?",
    [projectId, scope.task, scope.scopeId],
  );
  return session;
}

export async function runLaowengTask<T>(
  db: Db,
  projectId: string,
  task: unknown,
  input: unknown,
  schema: LaowengSchema<T>,
  options: LaowengRunOptions = {},
): Promise<T> {
  const scope = laowengSessionScope(task, { projectId });
  const eventThreadId = options.threadId || null;
  // 这次运行是定时自动还是「立即整理」手动触发：轨迹的输入行据此标「定时任务 / 手动任务」。
  const triggerSource = options.trigger === "user" ? "user" : "schedule";
  let harness: LaowengHarness | null | undefined;
  let activeEventId: string | number | null = null;
  let projectSessionId: string | null = null;
  let sessionRowId: string | null = null;
  const beginPhase = async (phase: string, summary: unknown = null) => {
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
    activeEventId = (result as unknown as { insertId: string | number }).insertId;
  };
  // 阶段进行中补摘要：轨迹里每行都要能看出这步干了什么。
  const notePhase = async (summary: unknown) => {
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
      if (
        pressure?.used !== undefined &&
        pressure.used >= (pressure.autoCompactAt ?? LAOWENG_CONTEXT_BUDGET.autoCompactAt)
      ) {
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
            type: (error as { name?: unknown } | null)?.name || "Error",
            diagnostic: redactSecrets(
              (error as { message?: unknown } | null)?.message || error,
            ).slice(-1000),
          });
        }
      }
      await beginPhase("model_run");
      // 视觉复核附件与工具结果读法都由调用方注入，先收口成实际用到的形状。
      const imageInput = options.image as LaowengImageInput | null | undefined;
      const readToolResult = options.readToolResult as (() => Promise<unknown>) | undefined;
      if (imageInput?.data) {
        const image = Buffer.from(imageInput.data, "base64");
        await saveVisualArtifact(db, {
          projectId,
          // 事件 id 是 BIGINT 自增（运行期是数字），附件表的类型只写了字符串。
          agentProjectEventId: activeEventId as string | null,
          content: image,
          mime: imageInput.mimeType || "image/png",
          source: "l1_visual_verification",
        });
      }
      const prompt = buildMaintenanceTurn({
        projectId,
        workType: scope.task,
        iterationId: eventThreadId,
        resultMode: readToolResult ? "file_summary_tool" : "json",
        input,
        // JS 里 `iterationId` 的默认值 null 把入参类型推成了 null；运行期接受 threadId。
      } as Parameters<typeof buildMaintenanceTurn>[0]).prompt;
      const promptInput = imageInput
        ? [
            { type: "text", text: prompt },
            {
              type: "image",
              data: imageInput.data,
              mimeType: imageInput.mimeType || "image/png",
            },
          ]
        : prompt;
      const turnId = randomUUID();
      const meter = createUsageMeter();
      await query(
        db,
        `INSERT INTO agent_laoweng_session_turns
        (id,project_id,task,session_id,input_text,started_at) VALUES (?,?,?,?,?,UTC_TIMESTAMP(3))`,
        [turnId, projectId, scope.task, session.session_id, prompt.slice(0, 16000)],
      );
      const started = performance.now();
      // run() 抛错时这里不会继续往下走，但 finally 与后续语句都要读它。
      let result!: RunResult;
      try {
        result = await harness.run(promptInput as Parameters<LaowengHarness["run"]>[0], {
          sessionId: session.session_id,
          onNotification: (notification) => {
            if (
              notification.method === "session.event" &&
              notification.params?.sessionId === session.session_id
            )
              meter.notify(notification.params.event);
          },
        });
      } finally {
        if (!meter.result()) for (const event of result?.events || []) meter.notify(event);
        const measured = meter.result();
        const usage = {
          ...measured,
          executionDurationMs: Math.max(0, Math.round(performance.now() - started)),
        };
        await query(
          db,
          `UPDATE agent_laoweng_session_turns SET output_text=?,usage_stats=?,
          finished_at=UTC_TIMESTAMP(3) WHERE id=?`,
          [
            result?.finalResponse ? String(result.finalResponse).slice(0, 16000) : null,
            JSON.stringify(usage),
            turnId,
          ],
        );
      }
      const failure = providerFailure(result);
      if (failure) throw new Error(failure);
      const responseText = String(result.finalResponse || "").trim();
      await notePhase(
        responseText
          ? `结论：${responseText.replace(/\s+/g, " ").slice(0, 160)}`
          : "模型没有返回正文",
      );
      await beginPhase("validate_result");
      const parsed = schema.parse(
        readToolResult ? await readToolResult() : parseJsonResponse(result.finalResponse),
      );
      await notePhase(
        `校验通过 · ${
          Object.keys((parsed || {}) as Record<string, unknown>)
            .slice(0, 8)
            .join("、") || "无字段"
        }`,
      );
      const contextStats = await sampleContextStats(harness, session.session_id);
      const history = await sampleHistory(harness, session.session_id);
      await harness.close();
      harness = null;
      await beginPhase("save_checkpoint");
      let checkpointSaved = true;
      try {
        await saveCheckpoint(db, sessionRowId, opened.home, history, options.checkpointLimitBytes);
      } catch (error) {
        // 历史累积超过快照上限：本次结果已经过校验，不该因存不下快照而整次失败。
        // 换一个新会话继续维护，避免一份过大的历史把整个作业永久卡住。
        if (!/会话快照超过/.test(String((error as { message?: unknown } | null)?.message || "")))
          throw error;
        checkpointSaved = false;
        await resetOversizedLaowengSession(db, sessionRowId, opened.home);
        await notePhase("会话快照超过上限，已重置维护会话");
      }
      if (checkpointSaved) {
        await notePhase(
          `检查点已保存 · 上下文 ${Math.round((contextStats?.used || 0) / 100)} 词元 · 历史 ${Array.isArray(history) ? history.length : 0} 条`,
        );
        await query(
          db,
          `UPDATE agent_project_sessions SET status='idle',last_finished_at=UTC_TIMESTAMP(3),
          last_error=NULL,context_stats=COALESCE(?,context_stats) WHERE id=?`,
          [contextStats ? JSON.stringify(contextStats) : null, sessionRowId],
        );
      }
      await completePhase();
      return parsed;
    });
  } catch (error) {
    await harness?.close().catch(() => {});
    if (activeEventId) {
      const reason = redactSecrets((error as { message?: unknown } | null)?.message || error);
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
        [
          redactSecrets((error as { message?: unknown } | null)?.message || error).slice(0, 255),
          sessionRowId,
        ],
      ).catch(() => {});
    throw error;
  }
}

export async function compactLaowengSession(
  db: Db,
  projectId: string,
  task: unknown,
  options: LaowengRunOptions = {},
): Promise<LaowengCompactResult> {
  const scope = laowengSessionScope(task, { projectId });
  let harness: LaowengHarness | null | undefined;
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
      let checkpointSaved = true;
      try {
        await saveCheckpoint(db, session.id, opened.home, history, options.checkpointLimitBytes);
      } catch (error) {
        // 压缩后快照仍然超限：同样按历史累积过量处理，重置会话让后续运行能继续。
        if (!/会话快照超过/.test(String((error as { message?: unknown } | null)?.message || "")))
          throw error;
        checkpointSaved = false;
        await resetOversizedLaowengSession(db, session.id, opened.home);
      }
      if (checkpointSaved)
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
