import { discussionText, pendingMessages, AUTO_COMPACT_AT } from "../shared/context.js";
import { trackThinking } from "./agent-thinking.js";
import { createServer } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { resolve, join, dirname, sep } from "node:path";
import { tmpdir } from "node:os";
import { assetPath } from "./assets.js";
import { gzipSync, gunzipSync } from "node:zlib";
import { query } from "./db.js";
import { Service, HttpError } from "./service.js";
import { createAgentTools } from "./agent-tools.js";
import { releaseSandbox } from "./agent-sandbox.js";
import { agentSession } from "./agent-session.js";
import { deliverTaskUpdates } from "./agent-updates.js";
import { restoreSessionCheckpoint } from "./agent-checkpoint.js";
import { createUsageMeter, saveReplyUsage } from './agent-usage.js';
import { publishWork } from "./work-events.js";
import { dshModelPatch, modelConfig, modelOutputLimit, redactSecrets } from "./model-config.js";
import { loadAgentCapabilityProfile } from "./agent-capabilities.js";
import { agentRuntimePatch } from "./dsh-runtime-config.js";
import { persistL3ContextStats } from "./l3-session.js";
import { acquireSessionLock } from "./session-lock.js";
import { logAgentTiming } from "./agent-timing-log.js";

const running = new Map();
const coordinatorRuntimes = new Map();
const COORDINATOR_IDLE_MS = 5 * 60 * 1000;

function agentRuntimeRoot() {
  return process.env.COTHREAD_MAKERS === "true"
    ? resolve(tmpdir(), "cothread-agents") : resolve(".local/agents");
}

export function isCorruptSessionLog(error) {
  const message = String(error?.message || error || "");
  return /corrupt session log/i.test(message) || /无效会话快照/.test(message);
}

async function discardCoordinatorRuntime(threadId, runtime) {
  const entry = coordinatorRuntimes.get(threadId);
  if (entry?.runtime === runtime) {
    clearTimeout(entry.idleTimer);
    coordinatorRuntimes.delete(threadId);
  }
  if (runtime) await runtime.close(false).catch(() => {});
}

/** Drop any parked L2 runtime for this iteration. Session-id rotations must never leave a stale in-memory L2. */
export async function invalidateCoordinatorRuntime(threadId) {
  if (!threadId) return;
  const entry = coordinatorRuntimes.get(threadId);
  if (!entry?.runtime) return;
  clearTimeout(entry.idleTimer);
  coordinatorRuntimes.delete(threadId);
  await entry.runtime.close(false).catch(() => {});
}

export async function resetAgentSessionStore(db, job) {
  const spec = agentSession(job);
  // Rotate the durable session id only after killing any parked coordinator that still
  // holds the old id; otherwise create_task stamps the new id while dsh_l3 binds the old one.
  if (spec.kind === "l2") await invalidateCoordinatorRuntime(spec.id);
  await query(
    db,
    `UPDATE ${spec.table} SET checkpoint=NULL,session_id=?,context_stats=NULL WHERE ${spec.key}=?`,
    [randomUUID(), spec.id],
  );
  await rm(join(agentRuntimeRoot(), spec.homeId, "sessions"), { recursive: true, force: true });
}

export async function acquireCoordinatorRuntime(context, { db, job, user, createHarness } = {}) {
  const key = job.thread_id;
  const existing = coordinatorRuntimes.get(key);
  if (existing?.runtime) {
    clearTimeout(existing.idleTimer);
    existing.idleTimer = undefined;
    try {
      const [row] = await query(db, "SELECT session_id FROM agent_sessions WHERE thread_id=?", [key]);
      if (!row?.session_id || row.session_id !== existing.runtime.session?.session_id) {
        const error = new Error("L2 session rotated");
        error.code = "L2_SESSION_ROTATED";
        throw error;
      }
      await existing.runtime.bindTurn({ job, user, context });
      existing.db = db;
      return existing.runtime;
    } catch (error) {
      coordinatorRuntimes.delete(key);
      await existing.runtime.close().catch(() => {});
      console.error("Coordinator runtime rebind failed", {
        type: error?.name || "Error",
        code: error?.code || null,
      });
    }
  }
  const runtime = await openAgentRuntime(context, {
    db, job, user, role: "coordinator", keepalive: true, createHarness,
  });
  coordinatorRuntimes.set(key, { runtime, db });
  return runtime;
}

export async function parkCoordinatorRuntime(threadId, runtime, completed = true) {
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

export { discardCoordinatorRuntime };

export async function stopAgent(db, threadId, messageId) {
  const task = running.get(messageId);
  const [reply] = await query(db,
    "SELECT parent_message_id,agent_slot,execution_active FROM assistant_replies WHERE message_id=?", [messageId]);
  // A cancelled queued request owns no runtime or sandbox. In particular, it
  // must never stop the primary that is still serving another member.
  await Promise.allSettled([task?.close(), reply?.execution_active
    ? releaseSandbox(db, {
      thread_id: threadId,
      message_id: messageId,
      parent_message_id: reply.parent_message_id,
      agent_slot: reply.agent_slot,
    })
    : undefined]);
}
async function checkpoint(db, { table, key, id }, home, seenSequence, modelMessages) {
  const dir = join(home, "sessions");
  const files = {};
  async function walk(path, prefix = "") {
    for (const entry of await readdir(path, { withFileTypes: true }).catch(
      (e) => (e.code === "ENOENT" ? [] : Promise.reject(e)),
    )) {
      const relative = prefix + entry.name;
      if (entry.isDirectory())
        await walk(join(path, entry.name), relative + "/");
      else if (entry.isFile())
        files[relative] = (await readFile(join(path, entry.name))).toString(
          "base64",
        );
    }
  }
  await walk(dir);
  if (modelMessages) files["_cothread_context.json"] = Buffer.from(JSON.stringify(modelMessages)).toString("base64");
  const data = gzipSync(JSON.stringify(files));
  if (data.length > 10 * 1024 * 1024)
    throw new Error("Agent 会话快照超过 10 MiB");
  await query(
    db,
    `UPDATE ${table} SET checkpoint=?,seen_sequence=? WHERE ${key}=?`,
    [data, seenSequence, id],
  );
}
export async function openAgentRuntime(
  context,
  options,
) {
  const {
    db, job, user, observe = true, autoCompact = true, createHarness: createHarnessOption,
    role = job.parent_message_id ? "executor" : "coordinator",
    sessionLockHeld = false, keepalive = false, sessionReset = false,
  } = options;
  let createHarness = createHarnessOption;
  const runtimeStarted = performance.now();
  let sessionLock;
  let stageStarted = runtimeStarted;
  const timed = (stage) => {
    const now = performance.now();
    logAgentTiming({ messageId: job.message_id, threadId: job.thread_id, kind: job.kind, stage,
      durationMs: Math.round(now - stageStarted), elapsedMs: Math.round(now - runtimeStarted) });
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
  const progress = (text) =>
    job.message_id
      ? query(
          db,
          "UPDATE assistant_replies SET progress=? WHERE message_id=? AND status='running'",
          [text, job.message_id],
        )
      : Promise.resolve();
  await progress(job.parent_message_id ? "小祥正在准备处理" : "正在启动运行时");
  let session;
  await query(db, `INSERT IGNORE INTO ${spec.table}(${spec.key},session_id) VALUES(?,?)`,
    [spec.id, randomUUID()]);
  [session] = await query(db, `SELECT * FROM ${spec.table} WHERE ${spec.key}=?`, [spec.id]);
  const sessionRow = { table: spec.table, key: spec.key, id: spec.id };
  if (!job.parent_message_id && !sessionLockHeld && job.thread_id) {
    sessionLock = await acquireSessionLock(db, job.thread_id, 30);
    if (!sessionLock) {
      const error = new Error("L2 session is busy");
      error.agentStage = "start";
      throw error;
    }
  }
  if (spec.kind === "l3" && spec.id && !sessionLockHeld) {
    sessionLock = await acquireSessionLock(db, spec.homeId, 30);
    if (!sessionLock) {
      const error = new Error("L3 session is busy");
      error.agentStage = "start";
      throw error;
    }
  }
  let handedOff = false;
  try {
  const capabilityProfiles = role === "coordinator"
    ? { l2: await loadAgentCapabilityProfile(db, "l2"), l3: await loadAgentCapabilityProfile(db, "l3") }
    : { l3: await loadAgentCapabilityProfile(db, "l3") };
  const capabilityProfile = role === "coordinator" ? capabilityProfiles.l2 : capabilityProfiles.l3;
  const runtimeRoot = agentRuntimeRoot();
  const home = resolve(runtimeRoot, spec.homeId);
  await mkdir(home, { recursive: true });
  // MySQL is authoritative. Restore only session records into a dedicated host orchestration directory.
  // A truncated/corrupt checkpoint (e.g. missing session header after failed compaction) must not
  // permanently block L2; fall through to the one-shot reset path below.
  if (session.checkpoint) {
    const files = JSON.parse(
      gunzipSync(session.checkpoint, {
        maxOutputLength: 40 * 1024 * 1024,
      }).toString(),
    );
    await restoreSessionCheckpoint(files, home);
  }
  const token = randomBytes(32).toString("hex");
  const thinkingOptions = role === "coordinator" ? {
    async onVisibleText(text) {
      const body = String(text || "").trim().slice(0, 4000);
      if (!body) return;
      const [existing] = await query(db,
        "SELECT id FROM messages WHERE agent_task_id=? AND body=? ORDER BY sequence DESC LIMIT 1",
        [job.message_id, body]);
      if (existing) return;
      await service.insertMessage(db, actor, job.thread_id, body, [], "assistant", job.message_id);
      publishWork(db, job.thread_id);
    },
  } : {};
  let thinking = trackThinking(db, job.message_id, session.session_id, thinkingOptions);
  const executeTool = createAgentTools(
    service,
    actor,
    job,
    { role, l2SessionId: session.session_id },
  );
  const execute = (name, args, caller = {}) => {
    const level = role === "coordinator" && caller.sessionId && caller.sessionId !== session.session_id ? "l3"
      : role === "coordinator" ? "l2" : "l3";
    if (!capabilityProfiles[level].allowedTools.includes(name))
      throw new HttpError(403, `${level.toUpperCase()} 未启用该插件能力`);
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
      res.writeHead(error.status || 400);
      res.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((resolve) => bridge.listen(0, "127.0.0.1", resolve));
  const patch = join(home, "tools.yml");
  const modelPatch = join(home, "model.yml");
  await writeFile(
    patch,
    agentRuntimePatch(),
  );
  const configuredModel = modelConfig(role);
  await writeFile(modelPatch, dshModelPatch(configuredModel));
  // Never inherit database or unrelated application secrets into the Agent process.
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
    COTHREAD_BRIDGE_URL: `http://127.0.0.1:${bridge.address().port}`,
    COTHREAD_BRIDGE_TOKEN: token,
    COTHREAD_RESUME_SESSION: session.checkpoint ? session.session_id : "",
    COTHREAD_ALLOWED_TOOLS: JSON.stringify([...new Set(Object.values(capabilityProfiles).flatMap((profile) => profile.allowedTools))]),
    COTHREAD_ALLOWED_TOOLS_BY_LEVEL: JSON.stringify(Object.fromEntries(Object.entries(capabilityProfiles)
      .map(([level, profile]) => [level, profile.allowedTools]))),
    COTHREAD_SKILLS_BY_LEVEL: JSON.stringify(Object.fromEntries(Object.entries(capabilityProfiles)
      .map(([level, profile]) => [level, profile.instructions]))),
    COTHREAD_SYSTEM_PROMPTS_BY_LEVEL: JSON.stringify(Object.fromEntries(Object.entries(capabilityProfiles)
      .map(([level, profile]) => [level, profile.systemPrompt]))),
    COTHREAD_PRIMARY_AGENT_LEVEL: role === "coordinator" ? "l2" : "l3",
    COTHREAD_PRIMARY_AGENT_ID: session.session_id,
    HOME: home,
    USERPROFILE: home,
  });
  const harness = createHarness({
    profile: "sdk-minimal",
    dshHome: home,
    processCwd: home,
    cwd: home,
    patches: [modelPatch, assetPath("runtime/agent-patch.yml"), patch],
    env,
    provider: "cothread-compatible",
    model: configuredModel.model,
    initializeTimeoutMs: 30000,
    requestTimeoutMs: 600000,
    maxTokens: modelOutputLimit(configuredModel),
  });
  if (job.message_id) running.set(job.message_id, harness);
  let seenSequence = session.seen_sequence;
  let modelMessages;
  if (!job.parent_message_id && session.checkpoint) {
    const saved = JSON.parse(gunzipSync(session.checkpoint, { maxOutputLength: 40 * 1024 * 1024 }).toString());
    if (saved["_cothread_context.json"]) modelMessages = JSON.parse(Buffer.from(saved["_cothread_context.json"], "base64").toString());
  }
  let sharedHistory;
  if (job.parent_message_id && !session.checkpoint) {
    const [primary] = await query(db, "SELECT checkpoint,seen_sequence FROM agent_sessions WHERE thread_id=?", [job.thread_id]);
    if (primary?.checkpoint) {
      const files = JSON.parse(gunzipSync(primary.checkpoint, { maxOutputLength: 40 * 1024 * 1024 }).toString());
      if (files["_cothread_context.json"]) {
        sharedHistory = JSON.parse(Buffer.from(files["_cothread_context.json"], "base64").toString());
        seenSequence = primary.seen_sequence;
      }
    }
  }
  let sampling = Promise.resolve();
  let samplingNow = false;
  let interval;
  let closed = false;
  const forgottenSessions = new Set();
  const activeChildren = new Set();
  let childWatch;
  const forgetSession = (sessionId) => { if (sessionId && sessionId !== session.session_id) forgottenSessions.add(sessionId); };
  const pruneForgottenSessions = async () => {
    const sessionsRoot = resolve(home, "sessions");
    const walk = async (path) => {
      for (const entry of await readdir(path, { withFileTypes: true }).catch(
        (error) => error.code === "ENOENT" ? [] : Promise.reject(error),
      )) {
        if (!entry.isDirectory()) continue;
        const candidate = resolve(path, entry.name);
        if (entry.name === ".." || (candidate !== sessionsRoot && !candidate.startsWith(sessionsRoot + sep)))
          throw new Error("Invalid child session cleanup path");
        if (forgottenSessions.has(entry.name)) await rm(candidate, { recursive: true, force: true });
        else await walk(candidate);
      }
    };
    await walk(sessionsRoot);
  };
  const request = (method, params = {}) =>
    harness.client.request(
      `cothread/${method}`,
      { sessionId: session.session_id, ...params },
      250000,
    );
  const compactSafely = async () => {
    try {
      await request("compact", { automatic: true });
    } catch (error) {
      console.error("Automatic compaction skipped", {
        threadId: job.thread_id,
        type: error?.name || "Error",
        diagnostic: redactSecrets(error?.message || error).slice(-1000),
      });
    }
  };
  const sample = () => {
    if (samplingNow || closed) return sampling;
    samplingNow = true;
    sampling = (async () => {
      const stats = await request("context");
      await query(
        db,
        `UPDATE ${sessionRow.table} SET context_stats=? WHERE ${sessionRow.key}=?`,
        [JSON.stringify({ ...stats, seenSequence }), sessionRow.id],
      );
      for (const childId of activeChildren) {
        try {
          await persistL3ContextStats(db, childId, await request("context", { sessionId: childId }));
        } catch {}
      }
    })().finally(() => {
      samplingNow = false;
    });
    return sampling;
  };
  const ingest = async (messages, replies) => {
    const fresh = observe && !job.parent_message_id
      ? pendingMessages(messages, seenSequence, replies)
      : [];
    for (const message of fresh) {
      agentStage = "observe";
      if (!job.parent_message_id) modelMessages = undefined;
      const stats = await request("observe", { messages: [discussionText(message)] });
      seenSequence = message.sequence;
      if (autoCompact && stats.used >= AUTO_COMPACT_AT) {
        agentStage = "compact";
        await compactSafely();
      }
    }
    if (observe && messages.length && BigInt(messages.at(-1).sequence) > BigInt(seenSequence || 0))
      seenSequence = messages.at(-1).sequence;
    agentStage = "meter";
    await sample();
  };
  const park = async (completed = true) => {
    running.delete(job.message_id);
    await thinking.close(completed ? "completed" : "failed");
    await sampling.catch(() => {});
    await sample().catch(() => {});
    try { modelMessages = await request("history"); } catch {}
    await checkpoint(db, sessionRow, home, seenSequence, modelMessages);
    if (sessionLock) {
      const lock = sessionLock;
      sessionLock = undefined;
      await lock.release();
    }
  };
  const bindTurn = async ({ job: nextJob, user: nextUser, context: nextContext } = {}) => {
    if (closed) throw new Error("runtime closed");
    if (nextJob) Object.assign(job, nextJob);
    if (nextUser) Object.assign(actor, nextUser, { scope: context.project_id });
    if (!job.parent_message_id && !sessionLock && job.thread_id) {
      sessionLock = await acquireSessionLock(db, job.thread_id, 30);
      if (!sessionLock) {
        const error = new Error("L2 session is busy");
        error.agentStage = "start";
        throw error;
      }
    }
    thinking = trackThinking(db, job.message_id, session.session_id, thinkingOptions);
    if (job.message_id) running.set(job.message_id, harness);
    await progress("正在接入运行时");
    await progress("正在准备上下文");
    await ingest(nextContext?.messages || [], nextContext?.replies || []);
    timed("context_ready");
  };
  const close = async (completed = false) => {
    if (closed) return;
    clearInterval(interval);
    if (childWatch) {
      try { childWatch.close(); } catch {}
      childWatch = undefined;
    }
    accepting = false;
    running.delete(job.message_id);
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
        await new Promise((resolve) => bridge.close(resolve));
        await thinking.close(completed ? "completed" : "failed");
        try {
          if (handedOff) await checkpoint(db, sessionRow, home, seenSequence, modelMessages);
        }
        finally {
          if (job.parent_message_id && job.message_id) await releaseSandbox(db, job);
          if (job.parent_message_id && completed) {
            if (dirname(home) !== runtimeRoot) throw new Error("Invalid child workspace");
            await rm(home, { recursive: true, force: true });
          }
          if (sessionLock) {
            const lock = sessionLock;
            sessionLock = undefined;
            await lock.release();
          }
        }
      }
    }
  };
  let agentStage = "start";
  try {
    timed('runtime_setup');
    await harness.start();
    timed('harness_start');
    await progress('正在准备上下文');
    agentStage = "restore";
    if (sharedHistory) await request("seed", { messages: sharedHistory });
    await request("observe", { messages: [] });
    agentStage = "meter";
    await sample();
    interval = setInterval(() => void sample().catch(() => {}), 2000);
    interval.unref();
    // Append only new discussion. Native assistant turns and compressed summaries
    // already live in this session and must never be re-sent as full transcripts.
    await ingest(context.messages, context.replies);
    timed('context_ready');
    handedOff = true;
    const watchChildren = (onNotification, after = async () => {}) => {
      if (childWatch || !harness?.client?.subscribeSessionTree) return;
      const sub = harness.client.subscribeSessionTree(session.session_id);
      childWatch = sub;
      void (async () => {
        try {
          while (activeChildren.size) {
            const notification = await sub.next();
            // Parent L2 chunks already arrive via harness.run. Replaying the
            // session tree would duplicate every visible character.
            if (notification?.method === "session.event" && notification.params?.sessionId === session.session_id) {
              await after();
              continue;
            }
            onNotification(notification);
            await after();
          }
        } catch (error) {
          console.error("Coordinator child watch ended", {
            type: error?.name || "Error",
            diagnostic: redactSecrets(error?.message || error).slice(-1000),
          });
        } finally {
          if (childWatch === sub) childWatch = undefined;
          try { sub.close(); } catch {}
        }
      })();
    };
    return {
      harness, session, request, sample, close, progress, bindTurn, park,
      get thinking() { return thinking; },
      forgetSession, capabilityProfile,
      activeChildren, watchChildren, hasActiveChildren: () => activeChildren.size > 0,
    };
  } catch (error) {
    error.agentStage = agentStage;
    await close().catch(() => {});
    if (!sessionReset && isCorruptSessionLog(error)) {
      console.error("Agent session log corrupt, resetting", {
        threadId: job.thread_id, messageId: job.message_id, type: error?.name || "Error",
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

export async function generateAgentReply(context, { db, job, user, runtime }) {
  const owned = !runtime;
  runtime ||= await openAgentRuntime(context, { db, job, user });
  const { harness, session, progress, thinking, capabilityProfile } = runtime;
  let cancellationTimer;
  let completed = false;
  let polling = Promise.resolve();
  const usageMeter=createUsageMeter();let modelStarted,modelFinished;
  try {
    const prompt = `当前项目 ID：${context.project_id}。迭代 ID：${job.thread_id}。沙箱工作区 /home/user/cothread/${agentSession(job).workspaceId}。
请回应当前上下文中 ID 为 ${job.message_id} 的成员消息，并结合该成员对当前任务的追加要求更新工作。追加要求属于同一任务，不应作为新任务排队，也不要重复已完成的操作。请简洁回应，不擅自扩展任务。梳理讨论时直接分析已有上下文，不要为了梳理再次调用 read_iteration 读取整个会话；只有用户明确要求核查缺失的原文时才按页读取。其他实现、分析文件或产出内容，应实际调用工具完成并保存结果。`;
    await progress("Agent 正在分析请求");
    await deliverTaskUpdates(db, job, runtime, "observe");
    const result = await Promise.race([
      new Promise((_, reject) => {
        let checking = false;
        cancellationTimer = setInterval(() => {
          if (checking) return;
          checking = true;
          polling = (async () => {
          try {
            const [row] = await query(db, "SELECT status FROM assistant_replies WHERE message_id=?", [job.message_id]);
            if (row?.status !== "running") {
              clearInterval(cancellationTimer);
              await releaseSandbox(db, job).catch(() => {});
              reject(new HttpError(409, "任务已停止"));
              return;
            }
            await deliverTaskUpdates(db, job, runtime);
          } catch (error) { reject(error); }
          finally { checking = false; }
          })();
        }, 1000);
        cancellationTimer.unref();
      }),
      (modelStarted=performance.now(),harness.run(prompt, {
        sessionId: session.session_id,
        onNotification: notification=>{if(notification.method==='session.event'&&notification.params?.sessionId===session.session_id)usageMeter.notify(notification.params.event);thinking.notify(notification);},
      })),
    ]);
    modelFinished=performance.now();
    if (!result.finalResponse?.trim()) {
      const turnEnd = result.events?.findLast((event) => event?.type === "turn/end");
      const providerError = turnEnd?.data?.reason?.error;
      if (providerError?.message) {
        const error = new Error(providerError.message);
        error.code = providerError.code;
        throw error;
      }
      throw new Error("Agent 未返回最终结果");
    }
    await thinking.close("completed", result.finalResponse);
    completed = true;
    await progress("正在保存 Agent 会话");
    await runtime.sample();
    return result.finalResponse.slice(0, 20000);
  } finally {
    clearInterval(cancellationTimer);
    await polling;
    if(modelStarted!==undefined){const configuredModel=modelConfig("executor");await saveReplyUsage(db,job.message_id,{...usageMeter.result(),model:configuredModel.model,reasoningEffort:configuredModel.reasoningEffort,executionDurationMs:Math.round((modelFinished??performance.now())-modelStarted)}).catch(error=>console.error('Usage persistence failed',{type:error.name}));}
    if (owned) await runtime.close(completed);
  }
}
