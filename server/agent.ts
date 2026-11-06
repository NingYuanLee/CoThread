import { discussionText, pendingMessages, AUTO_COMPACT_AT } from "../shared/context.js";
import { trackThinking } from "./agent-thinking.ts";
import { createServer } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { resolve, join, dirname, sep } from "node:path";
import { assetPath } from "./assets.ts";
import { gzipSync, gunzipSync } from "node:zlib";
import { query } from "./db.ts";
import { contextInjectionFromEvent } from "../shared/context-injection.js";
import { Service, HttpError } from "./service.ts";
import { createAgentTools } from "./agent-tools.ts";
import { releaseSandbox } from "./agent-sandbox.ts";
import { agentSession } from "./agent-session.ts";
import { deliverTaskUpdates } from "./agent-updates.ts";
import { hasSessionLog, restoreSessionCheckpoint } from "./agent-checkpoint.ts";
import { createUsageMeter, saveReplyUsage } from "./agent-usage.ts";
import { publishWork } from "./work-events.ts";
import {
  capturedModelUsage,
  coordinatorReuseDecision,
  dshModelMaxTokens,
  dshModelPatch,
  modelForLaunch,
  redactSecrets,
} from "./model-config.ts";
import { loadAgentCapabilityProfile } from "./agent-capabilities.ts";
import { SYSTEM_PROMPTS } from "../dsh-layer/cothread-plugin-registry.mjs";
import { COTHREAD_SYSTEM_TEXT } from "../shared/prompt-blocks.js";
import { agentRuntimePatch } from "./dsh-runtime-config.ts";
import { persistChildContextStats } from "./child-agent-session.ts";
import { touchChildInferenceHeartbeat } from "./task-pool.ts";
import { acquireSessionLock } from "./session-lock.ts";
import { logAgentTiming } from "./agent-timing-log.ts";
import { insertUniqueAssistantMessage } from "./assistant-post.ts";
import { messageTurnIdForJob } from "./coordinator-turn.ts";
import type { AddressInfo } from "node:net";
import type { Pool } from "mysql2/promise";
import type { Db } from "./types.ts";
import type { AgentSessionScope } from "./agent-session.ts";
import type { NamedLock } from "./named-lock.ts";
import type { ThinkingTracker, TrackThinkingOptions } from "./agent-thinking.ts";
import type {
  DeepSeekHarness,
  DeepSeekHarnessOptions,
  HarnessNotification,
  NotificationSubscription,
} from "@deepseek-ai/dsh-sdk-client";

/** 一个 Agent 任务（协调者任务或子 Agent 任务）的标识字段。 */
type AgentJob = Extract<AgentSessionScope, object> & {
  /** 协调者任务的事件类型（`child_result` / `child_idle` 等）。 */
  kind?: string | null;
};

/** 发起这条 Agent 任务的成员 / 账号身份。 */
type AgentUser = {
  id: string;
  kind?: string | null;
  scope?: string | null;
  [field: string]: unknown;
};

/** 迭代上下文：`service.context()` 的返回值，压缩 / 同步链路传的是同形对象。
 *  有的调用方按 `Record<string, unknown>` 收窄过，所以这里只声明本文件用到的两项为
 *  unknown，真正的消息行形状在 `ingest` 处收窄。 */
type AgentContext = {
  project_id?: unknown;
  messages?: unknown;
  replies?: unknown;
  [field: string]: unknown;
};

/** 讨论消息行：只声明本文件读到的列。 */
type AgentMessage = {
  id: string;
  sequence: string | number | bigint;
  [column: string]: unknown;
};

/** 启动时捕获的模型路由（`modelForLaunch` 的返回值）。 */
type ModelCapture = ReturnType<typeof modelForLaunch>;

/** 能力视图：跟着 `loadAgentCapabilityProfile` 的实现走。 */
type CapabilityProfile = Awaited<ReturnType<typeof loadAgentCapabilityProfile>>;

/** 能力视图的层级键；executor 运行只载入 `child_agent`。 */
type CapabilityLevel = "xiaoxiang" | "child_agent";

/** 本次运行载入的能力视图。 */
type CapabilityProfiles = Partial<Record<CapabilityLevel, CapabilityProfile>>;

/** 构造 DSH 运行时的工厂；默认实现懒加载 SDK，测试可注入替身。 */
type CreateHarness = (options: DeepSeekHarnessOptions) => DeepSeekHarness;

/** 桥接 RPC：DSH 没有为这些自定义方法声明形状，调用点按用到的字段收窄。 */
type BridgeRequest = <T = unknown>(
  method: string,
  params?: Record<string, unknown>,
  timeoutMs?: number,
) => Promise<T>;

/** 上下文计量应答（`cothread/context` 与 `cothread/observe` 都回这个形状）。 */
type ContextStats = { used: number; autoCompactAt?: number; [field: string]: unknown };

/** 桥接工具调用的调用方信息（子会话 id 决定工具层级）。 */
type ToolCaller = { sessionId?: string | null; [field: string]: unknown };

/** `insertUniqueAssistantMessage` 收的结构化门面视图：Service 在运行期满足它，
 *  只是 `Service.insertMessage` 的元组入参与被调方声明的 `unknown[]` 不是同一形状。 */
type AssistantPoster = Parameters<typeof insertUniqueAssistantMessage>[0];

/** `agent_sessions` / `agent_child_sessions` 的一行，只声明本文件读到的列。 */
type AgentSessionRow = {
  session_id: string;
  checkpoint?: string | Buffer | null;
  seen_sequence?: string | number | bigint;
  [column: string]: unknown;
};

/** 一次 Agent 运行时的对外接口（`openAgentRuntime` 的返回值）。 */
type AgentRuntime = {
  harness: DeepSeekHarness;
  session: AgentSessionRow;
  request: BridgeRequest;
  sample: () => Promise<void>;
  close: (completed?: boolean) => Promise<void>;
  progress: (text: string) => Promise<unknown>;
  bindTurn: (next?: { job?: AgentJob; user?: AgentUser; context?: AgentContext }) => Promise<void>;
  park: (completed?: boolean) => Promise<void>;
  readonly thinking: ThinkingTracker;
  forgetSession: (sessionId: string | null | undefined) => void;
  capabilityProfile: CapabilityProfile | undefined;
  activeChildren: Set<string>;
  watchChildren: (
    onNotification: (notification: HarnessNotification) => void,
    after?: () => Promise<void>,
  ) => void;
  hasActiveChildren: () => boolean;
  modelCapture: ModelCapture;
  reused?: boolean;
};

/** 停在内存里的协调者运行时条目。 */
type CoordinatorEntry = {
  runtime: AgentRuntime;
  db: Db;
  idleTimer?: NodeJS.Timeout;
  closing?: Promise<void>;
};

/** `openAgentRuntime` 的选项。 */
type AgentRuntimeOptions = {
  db: Db;
  job: AgentJob;
  user: AgentUser;
  observe?: boolean;
  autoCompact?: boolean;
  createHarness?: CreateHarness;
  role?: string;
  sessionLockHeld?: boolean;
  keepalive?: boolean;
  sessionReset?: boolean;
};

/** `acquireCoordinatorRuntime` 的注入项。 */
type AcquireCoordinatorOptions = {
  db: Db;
  job: AgentJob;
  user: AgentUser;
  createHarness?: CreateHarness;
};

/** 带业务码的 Agent 错误：上层按 `code` / `agentStage` 判别。 */
type AgentError = Error & { code?: string; agentStage?: string };

const running = new Map<string | undefined, DeepSeekHarness>();
const coordinatorRuntimes = new Map<string, CoordinatorEntry>();
const COORDINATOR_IDLE_MS = 5 * 60 * 1000;

function agentRuntimeRoot() {
  return resolve(".local/agents");
}

export function isCorruptSessionLog(error: unknown): boolean {
  const message = String((error as { message?: unknown } | null)?.message || error || "");
  return (
    /corrupt session log/i.test(message) ||
    /stored log is corrupt/i.test(message) ||
    /无效会话快照/.test(message) ||
    // DSH 0.2 refuses historical session formats it cannot migrate (the artifact
    // itself stays intact but unusable), so the one-shot reset path applies too.
    /cannot acquire a system head/i.test(message) ||
    /protected first surface head/i.test(message) ||
    /source v0 artifact remains unchanged/i.test(message) ||
    /unsupported session format/i.test(message)
  );
}

async function discardCoordinatorRuntime(
  threadId: string,
  runtime: AgentRuntime | null | undefined,
): Promise<void> {
  const entry = coordinatorRuntimes.get(threadId);
  if (entry?.runtime === runtime) {
    clearTimeout(entry!.idleTimer);
    coordinatorRuntimes.delete(threadId);
  }
  if (runtime) await runtime.close(false).catch(() => {});
}

/** Drop any parked 小祥 runtime for this iteration. Session-id rotations must never leave a stale in-memory 小祥. */
export async function invalidateCoordinatorRuntime(
  threadId: string | null | undefined,
): Promise<void> {
  if (!threadId) return;
  const entry = coordinatorRuntimes.get(threadId);
  if (!entry?.runtime) return;
  clearTimeout(entry.idleTimer);
  coordinatorRuntimes.delete(threadId);
  await entry.runtime.close(false).catch(() => {});
}

export async function resetAgentSessionStore(db: Db, job: AgentJob): Promise<void> {
  const spec = agentSession(job);
  // Rotate the durable session id only after killing any parked coordinator that still
  // holds the old id; otherwise create_task stamps the new id while child_agent binds the old one.
  if (spec.kind === "xiaoxiang") await invalidateCoordinatorRuntime(spec.id);
  await query(
    db,
    `UPDATE ${spec.table} SET checkpoint=NULL,session_id=?,context_stats=NULL WHERE ${spec.key}=?`,
    [randomUUID(), spec.id],
  );
  await rm(join(agentRuntimeRoot(), spec.homeId, "sessions"), { recursive: true, force: true });
}

export async function acquireCoordinatorRuntime(
  context: AgentContext,
  { db, job, user, createHarness }: AcquireCoordinatorOptions = {} as AcquireCoordinatorOptions,
): Promise<AgentRuntime> {
  const key = job.thread_id;
  let existing = coordinatorRuntimes.get(key);
  if (existing?.closing) {
    await existing.closing;
    existing = coordinatorRuntimes.get(key);
  }
  const reuse = existing?.runtime
    ? coordinatorReuseDecision(existing.runtime.modelCapture, {
        activeChildren: !!existing.runtime.hasActiveChildren?.(),
      })
    : "keep";
  if (reuse === "wait") {
    const error: AgentError = new Error("模型配置已更新，等待此迭代正在运行的子任务结束后切换");
    error.code = "XIAOXIANG_SESSION_BUSY";
    throw error;
  }
  if (existing?.runtime && reuse === "replace") {
    await retireCoordinatorRuntime(key, existing);
  } else if (existing?.runtime) {
    clearTimeout(existing.idleTimer);
    existing.idleTimer = undefined;
    try {
      const [row] = await query<{ session_id?: string | null }>(
        db,
        "SELECT session_id FROM agent_sessions WHERE thread_id=?",
        [key],
      );
      if (!row?.session_id || row.session_id !== existing.runtime.session?.session_id) {
        const error: AgentError = new Error("小祥 session rotated");
        error.code = "XIAOXIANG_SESSION_ROTATED";
        throw error;
      }
      await existing.runtime.bindTurn({ job, user, context });
      existing.db = db;
      // 复用成功：会话里已经有历史，prompt 不必再发一遍。
      existing.runtime.reused = true;
      return existing.runtime;
    } catch (error) {
      coordinatorRuntimes.delete(key);
      await existing.runtime.close().catch(() => {});
      const failure = error as { name?: string; code?: string } | null;
      console.error("Coordinator runtime rebind failed", {
        type: failure?.name || "Error",
        code: failure?.code || null,
      });
    }
  }
  const runtime = await openAgentRuntime(context, {
    db,
    job,
    user,
    role: "coordinator",
    keepalive: true,
    createHarness,
  });
  // 新开会话：历史不在会话里，prompt 要带上最近一段。
  runtime.reused = false;
  coordinatorRuntimes.set(key, { runtime, db });
  return runtime;
}

export async function parkCoordinatorRuntime(
  threadId: string,
  runtime: AgentRuntime,
  completed = true,
): Promise<void> {
  const entry = coordinatorRuntimes.get(threadId);
  if (!entry || entry.runtime !== runtime) {
    await runtime.close(completed);
    return;
  }
  try {
    await runtime.park(completed);
  } catch (error) {
    coordinatorRuntimes.delete(threadId);
    clearTimeout(entry.idleTimer);
    await runtime.close(false).catch(() => {});
    throw error;
  }
  const scheduleIdleClose = () => {
    clearTimeout(entry.idleTimer);
    entry.idleTimer = setTimeout(() => {
      const parked = coordinatorRuntimes.get(threadId);
      if (parked?.runtime !== runtime) return;
      if (runtime.hasActiveChildren?.()) {
        scheduleIdleClose();
        return;
      }
      coordinatorRuntimes.delete(threadId);
      void runtime.close(true).catch(() => {});
    }, COORDINATOR_IDLE_MS);
    entry.idleTimer.unref?.();
  };
  scheduleIdleClose();
}

function retireCoordinatorRuntime(threadId: string, entry: CoordinatorEntry): Promise<void> {
  if (entry.closing) return entry.closing;
  clearTimeout(entry.idleTimer);
  entry.idleTimer = undefined;
  // Keep the entry until checkpointing and process shutdown finish. The next
  // acquisition must not restore the same session directory concurrently.
  entry.closing = entry.runtime
    .close(true)
    .catch(() => {})
    .finally(() => {
      if (coordinatorRuntimes.get(threadId) === entry) coordinatorRuntimes.delete(threadId);
    });
  return entry.closing;
}

export function releaseIdleStaleCoordinatorRuntimes(): void {
  for (const [threadId, entry] of coordinatorRuntimes) {
    if (!entry.idleTimer) continue;
    if (
      coordinatorReuseDecision(entry.runtime?.modelCapture, {
        activeChildren: !!entry.runtime?.hasActiveChildren?.(),
      }) !== "replace"
    )
      continue;
    void retireCoordinatorRuntime(threadId, entry);
  }
}

export { discardCoordinatorRuntime };

export async function stopAgent(db: Db, threadId: string, messageId: string): Promise<void> {
  const task = running.get(messageId);
  const [reply] = await query<{
    parent_message_id?: string | null;
    agent_slot?: string | null;
    execution_active?: unknown;
  }>(
    db,
    "SELECT parent_message_id,agent_slot,execution_active FROM assistant_replies WHERE message_id=?",
    [messageId],
  );
  // A cancelled queued request owns no runtime or sandbox. In particular, it
  // must never stop the primary that is still serving another member.
  await Promise.allSettled([
    task?.close(),
    reply?.execution_active
      ? releaseSandbox(db, {
          thread_id: threadId,
          message_id: messageId,
          parent_message_id: reply.parent_message_id,
          agent_slot: reply.agent_slot,
        })
      : undefined,
  ]);
}
async function checkpoint(
  db: Db,
  { table, key, id }: { table: string; key: string; id: string },
  home: string,
  seenSequence: unknown,
  modelMessages?: unknown,
): Promise<void> {
  const dir = join(home, "sessions");
  const files: Record<string, string> = {};
  async function walk(path: string, prefix = "") {
    for (const entry of await readdir(path, { withFileTypes: true }).catch((e) =>
      e.code === "ENOENT" ? [] : Promise.reject(e),
    )) {
      const relative = prefix + entry.name;
      if (entry.isDirectory()) await walk(join(path, entry.name), relative + "/");
      else if (entry.isFile())
        files[relative] = (await readFile(join(path, entry.name))).toString("base64");
    }
  }
  await walk(dir);
  if (modelMessages)
    files["_cothread_context.json"] = Buffer.from(JSON.stringify(modelMessages)).toString("base64");
  const data = gzipSync(JSON.stringify(files));
  if (data.length > 10 * 1024 * 1024) throw new Error("Agent 会话快照超过 10 MiB");
  await query(db, `UPDATE ${table} SET checkpoint=?,seen_sequence=? WHERE ${key}=?`, [
    data,
    seenSequence,
    id,
  ]);
}
export async function openAgentRuntime(
  context: AgentContext,
  options: AgentRuntimeOptions,
): Promise<AgentRuntime> {
  const {
    db,
    job,
    user,
    observe = true,
    autoCompact = true,
    createHarness: createHarnessOption,
    role = job.parent_message_id ? "executor" : "coordinator",
    sessionLockHeld = false,
    keepalive = false,
    sessionReset = false,
  } = options;
  let createHarness = createHarnessOption;
  const runtimeStarted = performance.now();
  let sessionLock: NamedLock | null | undefined;
  let stageStarted = runtimeStarted;
  const timed = (stage: string) => {
    const now = performance.now();
    logAgentTiming({
      messageId: job.message_id,
      threadId: job.thread_id,
      kind: job.kind,
      stage,
      durationMs: Math.round(now - stageStarted),
      elapsedMs: Math.round(now - runtimeStarted),
    });
    stageStarted = now;
  };
  // The hosted bundle hoists static external imports even out of lazy modules.
  // Load the DSH SDK only when a runtime is actually needed, so a missing SDK
  // dependency cannot prevent the Agent HTTP entry and coordinator from booting.
  if (!createHarness) {
    const { DeepSeekHarness } = await import("@deepseek-ai/dsh-sdk-client");
    createHarness = (options) => new DeepSeekHarness(options);
  }
  const service = new Service(db);
  const actor = { ...user, scope: context.project_id };
  const spec = agentSession(job);
  const progress = (text: string): Promise<unknown> =>
    job.message_id
      ? query(
          db,
          "UPDATE assistant_replies SET progress=? WHERE message_id=? AND status='running'",
          [text, job.message_id],
        )
      : Promise.resolve();
  await progress(job.parent_message_id ? "小祥正在准备处理" : "正在启动运行时");
  let session: AgentSessionRow;
  await query(db, `INSERT IGNORE INTO ${spec.table}(${spec.key},session_id) VALUES(?,?)`, [
    spec.id,
    randomUUID(),
  ]);
  [session] = await query(db, `SELECT * FROM ${spec.table} WHERE ${spec.key}=?`, [spec.id]);
  const sessionRow = { table: spec.table, key: spec.key, id: spec.id };
  if (!job.parent_message_id && !sessionLockHeld && job.thread_id) {
    sessionLock = await acquireSessionLock(db as Pool, job.thread_id, 30);
    if (!sessionLock) {
      const error: AgentError = new Error("小祥 session is busy");
      error.code = "XIAOXIANG_SESSION_BUSY";
      error.agentStage = "start";
      throw error;
    }
  }
  if (spec.kind === "child_agent" && spec.id && !sessionLockHeld) {
    sessionLock = await acquireSessionLock(db as Pool, spec.homeId, 30);
    if (!sessionLock) {
      const error: AgentError = new Error("子 Agent session is busy");
      error.code = "CHILD_SESSION_BUSY";
      error.agentStage = "start";
      throw error;
    }
  }
  let handedOff = false;
  try {
    const sharedCapabilities = await loadAgentCapabilityProfile(db, "xiaoxiang");
    const childCapabilities = {
      ...sharedCapabilities,
      level: "child_agent",
      systemPrompt: SYSTEM_PROMPTS.child_agent.prompt,
    };
    const capabilityProfiles: CapabilityProfiles =
      role === "coordinator"
        ? { xiaoxiang: sharedCapabilities, child_agent: childCapabilities }
        : { child_agent: childCapabilities };
    const capabilityProfile =
      role === "coordinator" ? capabilityProfiles.xiaoxiang : capabilityProfiles.child_agent;
    const runtimeRoot = agentRuntimeRoot();
    const home = resolve(runtimeRoot, spec.homeId);
    await mkdir(home, { recursive: true });
    // MySQL is authoritative. Restore only session records into a dedicated host orchestration directory.
    // A truncated/corrupt checkpoint (e.g. missing session header after failed compaction) must not
    // permanently block 小祥; fall through to the one-shot reset path below.
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
    const token = randomBytes(32).toString("hex");
    const thinkingOptions: TrackThinkingOptions =
      role === "coordinator"
        ? {
            async onVisibleText(text: string) {
              const posted = await insertUniqueAssistantMessage(
                service as unknown as AssistantPoster,
                db,
                actor,
                job.thread_id,
                text,
                job.message_id as string,
                messageTurnIdForJob(job),
              );
              if (posted) publishWork(db, job.thread_id);
            },
          }
        : {};
    let thinking: ThinkingTracker = trackThinking(
      db,
      job.message_id as string,
      session.session_id,
      thinkingOptions,
    );
    const toolOptions: { role: string; xiaoxiangSessionId: string } = {
      role,
      xiaoxiangSessionId: session.session_id,
    };
    const executeTool = createAgentTools(service, actor, job, toolOptions);
    const execute = (name: string, args: unknown, caller: ToolCaller = {}) => {
      const level =
        role === "coordinator" && caller.sessionId && caller.sessionId !== session.session_id
          ? "child_agent"
          : role === "coordinator"
            ? "xiaoxiang"
            : "child_agent";
      // Internal harness helpers (not model-facing). create_task auto-dispatch
      // binds the spawned 子 Agent through bind_child_agent; it must not require a
      // capability-profile allowlist entry or the model could also call it.
      const internalBridgeTools = new Set(["bind_child_agent"]);
      if (!internalBridgeTools.has(name) && !capabilityProfiles[level]!.allowedTools.includes(name))
        throw new HttpError(403, "当前成员未启用该插件能力");
      return executeTool(name, args, caller);
    };
    let accepting = true;
    let chain = Promise.resolve();
    const bridge = createServer(async (req, res) => {
      res.setHeader("Content-Type", "application/json");
      const supplied = Buffer.from(req.headers.authorization || "");
      const expected = Buffer.from(`Bearer ${token}`);
      if (
        !accepting ||
        !job.message_id ||
        req.method !== "POST" ||
        req.url !== "/tool" ||
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      ) {
        res.writeHead(403);
        res.end("{}");
        return;
      }
      try {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 300000) throw new Error("请求过大");
        }
        const request = JSON.parse(body);
        const task = chain.then(async () => {
          await thinking.flush();
          return execute(request.name, request.args, { sessionId: request.sessionId });
        });
        chain = task.catch(() => {});
        const result = await task;
        res.end(JSON.stringify(result));
      } catch (error) {
        const failure = error as { status?: number; message?: string };
        res.writeHead(failure.status || 400);
        res.end(JSON.stringify({ error: failure.message }));
      }
    });
    await new Promise<void>((done) => bridge.listen(0, "127.0.0.1", done));
    const patch = join(home, "tools.yml");
    const modelPatch = join(home, "model.yml");
    await writeFile(patch, agentRuntimePatch());
    const parentCapture: Parameters<typeof modelForLaunch>[1] =
      role === "executor" && job?.thread_id
        ? coordinatorRuntimes.get(job.thread_id)?.runtime?.modelCapture
        : null;
    const configuredModel = modelForLaunch(role, parentCapture);
    await writeFile(modelPatch, dshModelPatch(configuredModel, role));
    // Never inherit database or unrelated application secrets into the Agent process.
    const env: Record<string, string | undefined> = {};
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
      COTHREAD_BRIDGE_URL: `http://127.0.0.1:${(bridge.address() as AddressInfo).port}`,
      COTHREAD_BRIDGE_TOKEN: token,
      COTHREAD_RESUME_SESSION: resumeSessionId,
      COTHREAD_ALLOWED_TOOLS: JSON.stringify([
        ...new Set(Object.values(capabilityProfiles).flatMap((profile) => profile.allowedTools)),
      ]),
      COTHREAD_ALLOWED_TOOLS_BY_LEVEL: JSON.stringify(
        Object.fromEntries(
          Object.entries(capabilityProfiles).map(([level, profile]) => [
            level,
            profile.allowedTools,
          ]),
        ),
      ),
      COTHREAD_SKILLS_BY_LEVEL: JSON.stringify(
        Object.fromEntries(
          Object.entries(capabilityProfiles).map(([level, profile]) => [
            level,
            profile.instructions,
          ]),
        ),
      ),
      COTHREAD_SYSTEM_PROMPTS_BY_LEVEL: JSON.stringify(
        Object.fromEntries(
          Object.entries(capabilityProfiles).map(([level, profile]) => [
            level,
            profile.systemPrompt,
          ]),
        ),
      ),
      COTHREAD_PRIMARY_AGENT_LEVEL: role === "coordinator" ? "xiaoxiang" : "child_agent",
      COTHREAD_PRIMARY_AGENT_ID: session.session_id,
      HOME: home,
      USERPROFILE: home,
    });
    const harness = createHarness({
      profile: "sdk-minimal",
      dshHome: home,
      processCwd: home,
      cwd: home,
      patches: [modelPatch, assetPath("dsh-layer/agent-patch.yml"), patch],
      env,
      provider: "cothread-compatible",
      model: configuredModel.model,
      initializeTimeoutMs: 30000,
      requestTimeoutMs: 600000,
      maxTokens: dshModelMaxTokens(configuredModel, role),
    });
    if (job.message_id) running.set(job.message_id, harness);
    let seenSequence = session.seen_sequence;
    let modelMessages: unknown;
    if (!job.parent_message_id && session.checkpoint) {
      const saved = JSON.parse(
        gunzipSync(session.checkpoint, { maxOutputLength: 40 * 1024 * 1024 }).toString(),
      );
      if (saved["_cothread_context.json"])
        modelMessages = JSON.parse(
          Buffer.from(saved["_cothread_context.json"], "base64").toString(),
        );
    }
    let sharedHistory: unknown;
    if (job.parent_message_id && !session.checkpoint) {
      const [primary] = await query<{
        checkpoint?: string | Buffer | null;
        seen_sequence?: string | number | bigint;
      }>(db, "SELECT checkpoint,seen_sequence FROM agent_sessions WHERE thread_id=?", [
        job.thread_id,
      ]);
      if (primary?.checkpoint) {
        const files = JSON.parse(
          gunzipSync(primary.checkpoint, { maxOutputLength: 40 * 1024 * 1024 }).toString(),
        );
        if (files["_cothread_context.json"]) {
          sharedHistory = JSON.parse(
            Buffer.from(files["_cothread_context.json"], "base64").toString(),
          );
          seenSequence = primary.seen_sequence;
        }
      }
    }
    let sampling = Promise.resolve();
    let samplingNow = false;
    let interval: NodeJS.Timeout | undefined;
    let closed = false;
    const forgottenSessions = new Set<string>();
    const activeChildren = new Set<string>();
    let childWatch: NotificationSubscription | undefined;
    const forgetSession = (sessionId: string | null | undefined) => {
      if (sessionId && sessionId !== session.session_id) forgottenSessions.add(sessionId);
    };
    const pruneForgottenSessions = async () => {
      const sessionsRoot = resolve(home, "sessions");
      const walk = async (path: string): Promise<void> => {
        for (const entry of await readdir(path, { withFileTypes: true }).catch((error) =>
          error.code === "ENOENT" ? [] : Promise.reject(error),
        )) {
          if (!entry.isDirectory()) continue;
          const candidate = resolve(path, entry.name);
          if (
            entry.name === ".." ||
            (candidate !== sessionsRoot && !candidate.startsWith(sessionsRoot + sep))
          )
            throw new Error("Invalid child session cleanup path");
          if (forgottenSessions.has(entry.name))
            await rm(candidate, { recursive: true, force: true });
          else await walk(candidate);
        }
      };
      await walk(sessionsRoot);
    };
    const request: BridgeRequest = ((method: string, params: Record<string, unknown> = {}) =>
      harness.client.request(
        `cothread/${method}`,
        { sessionId: session.session_id, ...params },
        250000,
      )) as BridgeRequest;
    const compactSafely = async () => {
      try {
        await request("compact", { automatic: true });
      } catch (error) {
        const failure = error as { name?: string; message?: unknown } | null;
        console.error("Automatic compaction skipped", {
          threadId: job.thread_id,
          type: failure?.name || "Error",
          diagnostic: redactSecrets(failure?.message || error).slice(-1000),
        });
      }
    };
    const sample = () => {
      if (samplingNow || closed) return sampling;
      samplingNow = true;
      sampling = (async () => {
        const stats = await request<ContextStats>("context");
        await query(
          db,
          `UPDATE ${sessionRow.table} SET context_stats=? WHERE ${sessionRow.key}=?`,
          [JSON.stringify({ ...stats, seenSequence }), sessionRow.id],
        );
        // Never await live 子 Agent meters on the shared harness RPC. A long child tool
        // can serialize behind parent park/bind and leave the next 小祥 turn queued
        // as 「等待处理」for the whole 子 Agent run. watchChildren / retainOrForgetChild
        // still capture durable 子 Agent stats when the child settles.
        // Heartbeat is independent of context RPC so a hung meter cannot freeze liveness.
        for (const childId of [...activeChildren]) {
          void touchChildInferenceHeartbeat(db, childId).catch(() => {});
          void request<{ used?: unknown } | null>("context", { sessionId: childId })
            .then((childStats) => persistChildContextStats(db, childId, childStats))
            .catch(() => {});
        }
      })().finally(() => {
        samplingNow = false;
      });
      return sampling;
    };
    const ingest = async (messages: unknown[], replies: unknown[] = []) => {
      const fresh: AgentMessage[] =
        observe && !job.parent_message_id
          ? (pendingMessages(messages, seenSequence, replies) as AgentMessage[])
          : [];
      for (const message of fresh) {
        agentStage = "observe";
        if (!job.parent_message_id) modelMessages = undefined;
        const stats = await request<ContextStats>("observe", {
          messages: [discussionText(message)],
        });
        seenSequence = message.sequence;
        if (autoCompact && stats.used >= (stats.autoCompactAt ?? AUTO_COMPACT_AT)) {
          agentStage = "compact";
          await compactSafely();
        }
      }
      if (
        observe &&
        messages.length &&
        BigInt((messages.at(-1) as AgentMessage).sequence) > BigInt(seenSequence || 0)
      )
        seenSequence = (messages.at(-1) as AgentMessage).sequence;
      agentStage = "meter";
      await sample();
    };
    const park = async (completed = true) => {
      running.delete(job.message_id);
      await thinking.close(completed ? "completed" : "failed");
      // Unlock before any harness RPC so a follow-up member message can claim 小祥
      // while 子 Agent is still running on this keepalive runtime.
      if (sessionLock) {
        const lock = sessionLock;
        sessionLock = undefined;
        await lock.release();
      }
      if (activeChildren.size) {
        // Live 子 Agent shares this harness. Do not await in-flight sampling or parent
        // history RPCs that can stall behind child tools; checkpoint the last
        // known transcript. Metering continues via the idle interval and
        // retainOrForgetChild when the child settles.
        await checkpoint(db, sessionRow, home, seenSequence, modelMessages);
        return;
      }
      await sampling.catch(() => {});
      await sample().catch(() => {});
      try {
        modelMessages = await request("history");
      } catch {}
      await checkpoint(db, sessionRow, home, seenSequence, modelMessages);
    };
    const bindTurn = async ({
      job: nextJob,
      user: nextUser,
      context: nextContext,
    }: { job?: AgentJob; user?: AgentUser; context?: AgentContext } = {}) => {
      if (closed) throw new Error("runtime closed");
      if (nextJob) Object.assign(job, nextJob);
      if (nextUser) Object.assign(actor, nextUser, { scope: context.project_id });
      if (!job.parent_message_id && !sessionLock && job.thread_id) {
        sessionLock = await acquireSessionLock(db as Pool, job.thread_id, 30);
        if (!sessionLock) {
          const error: AgentError = new Error("小祥 session is busy");
          error.code = "XIAOXIANG_SESSION_BUSY";
          error.agentStage = "start";
          throw error;
        }
      }
      thinking = trackThinking(db, job.message_id as string, session.session_id, thinkingOptions);
      if (job.message_id) running.set(job.message_id, harness);
      await progress("正在接入运行时");
      await progress("正在准备上下文");
      await ingest(
        (nextContext?.messages || []) as unknown[],
        (nextContext?.replies || []) as unknown[],
      );
      timed("context_ready");
    };
    const close = async (completed = false): Promise<void> => {
      if (closed) return;
      clearInterval(interval);
      if (childWatch) {
        try {
          childWatch.close();
        } catch {}
        childWatch = undefined;
      }
      accepting = false;
      running.delete(job.message_id);
      try {
        try {
          if (completed) {
            await sampling.catch(() => {});
            await sample();
            if (completed) modelMessages = await request("history");
          } else if (interval) {
            // A failed compaction has emitted its end marker. Persist that final
            // meter state rather than leaving the UI stuck on "compacting".
            await sampling.catch(() => {});
            await sample().catch(() => {});
          }
        } finally {
          closed = true;
          try {
            await harness.close();
            await sampling.catch(() => {});
          } finally {
            await chain;
            await pruneForgottenSessions();
            await new Promise<void>((done) => bridge.close(() => done()));
            await thinking.close(completed ? "completed" : "failed");
            try {
              if (handedOff) await checkpoint(db, sessionRow, home, seenSequence, modelMessages);
            } finally {
              if (job.parent_message_id && job.message_id) await releaseSandbox(db, job);
              if (job.parent_message_id && completed) {
                if (dirname(home) !== runtimeRoot) throw new Error("Invalid child workspace");
                await rm(home, { recursive: true, force: true });
              }
            }
          }
        }
      } finally {
        // Every cleanup stage can fail, including checkpoint and sandbox recycle.
        // The database lock owns a pooled connection and must always be returned.
        if (sessionLock) {
          const lock = sessionLock;
          sessionLock = undefined;
          await lock.release();
        }
      }
    };
    let agentStage = "start";
    try {
      timed("runtime_setup");
      await harness.start();
      timed("harness_start");
      await progress("正在准备上下文");
      agentStage = "restore";
      if (sharedHistory) await request("seed", { messages: sharedHistory });
      await request("observe", { messages: [] });
      agentStage = "meter";
      await sample();
      interval = setInterval(() => void sample().catch(() => {}), 2000);
      interval.unref();
      // Append only new discussion. Native assistant turns and compressed summaries
      // already live in this session and must never be re-sent as full transcripts.
      await ingest(context.messages as unknown[], context.replies as unknown[]);
      timed("context_ready");
      handedOff = true;
      const watchChildren = (
        onNotification: (notification: HarnessNotification) => void,
        after: () => Promise<void> = async () => {},
      ) => {
        if (childWatch || !harness?.client?.subscribeSessionTree) return;
        const sub = harness.client.subscribeSessionTree(session.session_id);
        childWatch = sub;
        void (async () => {
          try {
            while (activeChildren.size) {
              const notification = await sub.next();
              // Parent 小祥 chunks already arrive via harness.run. Replaying the
              // session tree would duplicate every visible character.
              if (
                notification?.method === "session.event" &&
                notification.params?.sessionId === session.session_id
              ) {
                await after();
                continue;
              }
              onNotification(notification);
              await after();
            }
          } catch (error) {
            const failure = error as { name?: string; message?: unknown } | null;
            console.error("Coordinator child watch ended", {
              type: failure?.name || "Error",
              diagnostic: redactSecrets(failure?.message || error).slice(-1000),
            });
          } finally {
            if (childWatch === sub) childWatch = undefined;
            try {
              sub.close();
            } catch {}
          }
        })();
      };
      return {
        harness,
        session,
        request,
        sample,
        close,
        progress,
        bindTurn,
        park,
        get thinking() {
          return thinking;
        },
        forgetSession,
        capabilityProfile,
        activeChildren,
        watchChildren,
        hasActiveChildren: () => activeChildren.size > 0,
        modelCapture: configuredModel,
      };
    } catch (error) {
      (error as AgentError | null)!.agentStage = agentStage;
      await close().catch(() => {});
      if (!sessionReset && isCorruptSessionLog(error)) {
        const failure = error as { name?: string } | null;
        console.error("Agent session log corrupt, resetting", {
          threadId: job.thread_id,
          messageId: job.message_id,
          type: failure?.name || "Error",
        });
        await resetAgentSessionStore(db, job);
        return openAgentRuntime(context, { ...options, sessionReset: true });
      }
      throw error;
    }
  } finally {
    if (!handedOff && sessionLock) {
      const lock = sessionLock;
      sessionLock = undefined;
      await lock.release().catch(() => {});
    }
  }
}

/** `generateAgentReply` 的注入项：runtime 省略时由本文件开一个自己的运行时。
 *  注入的替身只实现 `request` / `close`，所以这里按 unknown 接住、进函数再收窄。 */
type GenerateReplyOptions = {
  db: Db;
  job: AgentJob;
  user: AgentUser;
  runtime?: unknown;
};

/** 上下文注入的正文与来源。 */
type ContextInjection = { text: string; source: unknown };

export async function generateAgentReply(
  context: AgentContext,
  { db, job, user, runtime: injectedRuntime }: GenerateReplyOptions,
): Promise<string> {
  const owned = !injectedRuntime;
  // 注入替身（测试）只提供 request / close；真实运行时由本文件打开，形状是 AgentRuntime。
  const runtime = (injectedRuntime ||
    (await openAgentRuntime(context, { db, job, user }))) as AgentRuntime;
  const { harness, session, progress, thinking, capabilityProfile } = runtime;
  let cancellationTimer: NodeJS.Timeout | undefined;
  let completed = false;
  let polling = Promise.resolve();
  const usageMeter = createUsageMeter();
  // DSH 的上下文注入是带 source 的 user/message：正文进预览，source 进来源。
  const injections: ContextInjection[] = [];
  let modelStarted: number | undefined;
  let modelFinished: number | undefined;
  try {
    // 本轮真正发给模型的上下文：范围、工作区与应答约束。
    // 它还承担「告诉模型回哪条消息、不许扩展任务」的硬约束，是编排里必要的注入，不是展示用的装饰。
    const turnContext = `当前项目 ID：${context.project_id}。迭代 ID：${job.thread_id}。沙箱工作区 /home/user/cothread/${agentSession(job).workspaceId}。`;
    const turnInstruction = `请回应当前上下文中 ID 为 ${job.message_id} 的成员消息，并结合该成员对当前任务的追加要求更新工作。追加要求属于同一任务，不应作为新任务排队，也不要重复已完成的操作。请简洁回应，不擅自扩展任务。梳理讨论时直接分析已有上下文，不要为了梳理再次调用 read_iteration 读取整个会话；只有用户明确要求核查缺失的原文时才按页读取。其他实现、分析文件或产出内容，应实际调用工具完成并保存结果。`;
    const prompt = `${turnContext}\n${turnInstruction}`;
    await progress("Agent 正在分析请求");
    // 注入的上下文在模型调用前落成轨迹事件，和小祥的工具调用进同一份 agent_events：
    // 轨迹里的「上下文」行就是这段真实注入，而不是事后补出来的说明。
    await query(
      db,
      "INSERT INTO agent_events(message_id,agent_session_id,agent_task_id,tool,status,input,output,created_at,finished_at) VALUES(?,?,?,'context_notice','completed',?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))",
      [
        job.message_id,
        session.session_id,
        job.task_id || null,
        turnContext.slice(0, 4000),
        JSON.stringify({
          kind: "cothread-turn-context",
          form: "notice",
          summary: "项目 / 迭代 / 工作区与应答约束",
        }).slice(0, 4000),
      ],
    ).catch((error) => console.error("Turn context persistence failed", { type: error.name }));
    // 同一次运行的系统提示词也逐轮落库：重启服务或改补丁后，下一轮的系统提示词会变。
    const systemText = [COTHREAD_SYSTEM_TEXT, capabilityProfile?.systemPrompt]
      .filter(Boolean)
      .join("\n\n");
    if (systemText)
      await query(
        db,
        "INSERT INTO agent_events(message_id,agent_session_id,agent_task_id,tool,status,input,output,created_at,finished_at) VALUES(?,?,?,'system_prompt','completed',?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))",
        [
          job.message_id,
          session.session_id,
          job.task_id || null,
          systemText.slice(0, 4000),
          JSON.stringify({
            kind: "cothread-system-prompt",
            form: "system",
            summary: "本轮系统提示词",
          }).slice(0, 4000),
        ],
      ).catch((error) => console.error("System prompt persistence failed", { type: error.name }));
    await deliverTaskUpdates(db, { message_id: job.message_id as string }, runtime, "observe");
    const result = await Promise.race([
      new Promise<never>((_, reject) => {
        let checking = false;
        cancellationTimer = setInterval(() => {
          if (checking) return;
          checking = true;
          polling = (async () => {
            try {
              const [row] = await query(
                db,
                "SELECT status FROM assistant_replies WHERE message_id=?",
                [job.message_id],
              );
              if (row?.status !== "running") {
                clearInterval(cancellationTimer);
                await releaseSandbox(db, job).catch(() => {});
                reject(new HttpError(409, "任务已停止"));
                return;
              }
              await deliverTaskUpdates(db, { message_id: job.message_id as string }, runtime);
            } catch (error) {
              reject(error);
            } finally {
              checking = false;
            }
          })();
        }, 1000);
        cancellationTimer.unref();
      }),
      ((modelStarted = performance.now()),
      harness.run(prompt, {
        sessionId: session.session_id,
        onNotification: (notification) => {
          if (
            notification.method === "session.event" &&
            notification.params?.sessionId === session.session_id
          ) {
            const event = notification.params.event;
            usageMeter.notify(event);
            const injection = contextInjectionFromEvent(event);
            if (injection) injections.push(injection);
          }
          thinking.notify(notification);
        },
      })),
    ]);
    modelFinished = performance.now();
    if (!result.finalResponse?.trim()) {
      const turnEnd = result.events?.findLast((event) => event?.type === "turn/end");
      const providerError = (
        turnEnd?.data as
          { reason?: { error?: { message?: string; code?: string } } } | null | undefined
      )?.reason?.error;
      if (providerError?.message) {
        const error: AgentError = new Error(providerError.message);
        error.code = providerError.code;
        throw error;
      }
      throw new Error("Agent 未返回最终结果");
    }
    await thinking.close("completed", result.finalResponse);
    // 注入的上下文记成轨迹事件，和小祥的工具调用进同一份 agent_events。
    for (const injection of injections) {
      await query(
        db,
        "INSERT INTO agent_events(message_id,agent_session_id,agent_task_id,tool,status,input,output,created_at,finished_at) VALUES(?,?,?,'context_notice','completed',?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))",
        [
          job.message_id,
          session.session_id,
          job.task_id || null,
          injection.text.slice(0, 4000),
          JSON.stringify(injection.source).slice(0, 4000),
        ],
      ).catch((error) =>
        console.error("Context injection persistence failed", { type: error.name }),
      );
    }
    completed = true;
    await progress("正在保存 Agent 会话");
    await runtime.sample();
    return result.finalResponse.slice(0, 20000);
  } finally {
    clearInterval(cancellationTimer);
    await polling;
    if (modelStarted !== undefined) {
      await saveReplyUsage(db as Pool, job.message_id as string, {
        ...usageMeter.result(),
        ...capturedModelUsage(runtime.modelCapture),
        executionDurationMs: Math.round((modelFinished ?? performance.now()) - modelStarted),
      }).catch((error) => console.error("Usage persistence failed", { type: error.name }));
    }
    if (owned) await runtime.close(completed);
  }
}
