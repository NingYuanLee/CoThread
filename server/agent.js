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
import { dshModelPatch, modelConfig, modelOutputLimit, redactSecrets } from "./model-config.js";
import { loadAgentCapabilityProfile } from "./agent-capabilities.js";
import { agentRuntimePatch } from "./dsh-runtime-config.js";
import { acquireSessionLock } from "./session-lock.js";

const running = new Map();
export async function stopAgent(db, threadId, messageId) {
  const task = running.get(messageId);
  const [reply] = await query(db,
    "SELECT parent_message_id,execution_active FROM assistant_replies WHERE message_id=?", [messageId]);
  // A cancelled queued request owns no runtime or sandbox. In particular, it
  // must never stop the primary that is still serving another member.
  await Promise.allSettled([task?.close(), reply?.execution_active
    ? releaseSandbox(db, { thread_id: threadId, message_id: messageId, parent_message_id: reply.parent_message_id })
    : undefined]);
}
async function checkpoint(db, scope, home, seenSequence, modelMessages) {
  const { table, key, id } = agentSession(scope);
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
  { db, job, user, observe = true, autoCompact = true, createHarness, role = job.parent_message_id ? "executor" : "coordinator", sessionLockHeld = false },
) {
  const runtimeStarted = performance.now();
  let sessionLock;
  let stageStarted = runtimeStarted;
  const timed = (stage) => {
    const now = performance.now();
    console.log('Agent timing', { messageId:job.message_id, threadId:job.thread_id, stage,
      durationMs:Math.round(now-stageStarted), elapsedMs:Math.round(now-runtimeStarted) });
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
  const { table, key, id: workspaceId } = agentSession(job);
  const progress = (text) =>
    job.message_id
      ? query(
          db,
          "UPDATE assistant_replies SET progress=? WHERE message_id=?",
          [text, job.message_id],
        )
      : Promise.resolve();
  await progress(job.parent_message_id ? "小祥正在准备处理" : "正在启动 DSH Agent");
  await query(
    db,
    `INSERT IGNORE INTO ${table}(${key},session_id) VALUES(?,?)`,
    [workspaceId, randomUUID()],
  );
  const [session] = await query(
    db,
    `SELECT * FROM ${table} WHERE ${key}=?`,
    [workspaceId],
  );
  if (!job.parent_message_id && !sessionLockHeld && job.thread_id) {
    sessionLock = await acquireSessionLock(db, job.thread_id, 30);
    if (!sessionLock) {
      const error = new Error("L2 session is busy");
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
  const runtimeRoot = process.env.COTHREAD_MAKERS === "true"
    ? resolve(tmpdir(), "cothread-agents") : resolve(".local/agents");
  const home = resolve(runtimeRoot, workspaceId);
  await mkdir(home, { recursive: true });
  // MySQL is authoritative. Restore only session records into a dedicated host orchestration directory.
  if (session.checkpoint) {
    const files = JSON.parse(
      gunzipSync(session.checkpoint, {
        maxOutputLength: 40 * 1024 * 1024,
      }).toString(),
    );
    await restoreSessionCheckpoint(files, home);
  }
  const token = randomBytes(32).toString("hex");
  const thinking = trackThinking(db, job.message_id, session.session_id);
  const executeTool = createAgentTools(
    service,
    { ...user, scope: context.project_id },
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
    sampling = request("context")
      .then((stats) =>
        query(
          db,
          `UPDATE ${table} SET context_stats=? WHERE ${key}=?`,
          [JSON.stringify({ ...stats, seenSequence }), workspaceId],
        ),
      )
      .finally(() => {
        samplingNow = false;
      });
    return sampling;
  };
  const close = async (completed = false) => {
    if (closed) return;
    clearInterval(interval);
    accepting = false;
    running.delete(job.message_id);
    try {
      if (completed) {
        await sampling.catch(() => {});
        await sample();
        if (!job.parent_message_id) modelMessages = await request("history");
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
          if (!job.parent_message_id || !completed) await checkpoint(db, job, home, seenSequence, modelMessages);
          else await query(db, "UPDATE agent_child_sessions SET checkpoint=NULL,context_stats=NULL WHERE message_id=?", [job.message_id]);
        }
        finally {
          if (job.parent_message_id) await releaseSandbox(db, job);
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
    const fresh = observe
      ? pendingMessages(context.messages, seenSequence, job.parent_message_id ? [] : context.replies)
      : [];
    for (const message of fresh) {
      agentStage = "observe";
      if (!job.parent_message_id) modelMessages = undefined;
      const stats = await request("observe", { messages: [discussionText(message)] });
      // Commit the observation cursor before a potentially failing model call.
      // A timed-out compaction must not cause this message to be ingested twice.
      seenSequence = message.sequence;
      if (autoCompact && stats.used >= AUTO_COMPACT_AT) {
        agentStage = "compact";
        await compactSafely();
      }
    }
    if (observe && context.messages.length && BigInt(context.messages.at(-1).sequence) > BigInt(seenSequence || 0))
      seenSequence = context.messages.at(-1).sequence;
    agentStage = "meter";
    await sample();
    timed('context_ready');
    handedOff = true;
    return { harness, session, request, sample, close, progress, thinking, forgetSession, capabilityProfile };
  } catch (error) {
    error.agentStage = agentStage;
    await close().catch(() => {});
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
  let timer;
  let cancellationTimer;
  let completed = false;
  let polling = Promise.resolve();
  const usageMeter=createUsageMeter();let modelStarted,modelFinished;
  try {
    const prompt = `当前项目 ID：${context.project_id}。迭代 ID：${job.thread_id}。沙箱工作区 /home/user/cothread/${agentSession(job).id}。
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
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Agent 执行超过 10 分钟")),
          600000,
        );
      }),
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
    clearTimeout(timer);
    clearInterval(cancellationTimer);
    await polling;
    if(modelStarted!==undefined){const configuredModel=modelConfig("executor");await saveReplyUsage(db,job.message_id,{...usageMeter.result(),model:configuredModel.model,reasoningEffort:configuredModel.reasoningEffort,executionDurationMs:Math.round((modelFinished??performance.now())-modelStarted)}).catch(error=>console.error('Usage persistence failed',{type:error.name}));}
    if (owned) await runtime.close(completed);
  }
}
