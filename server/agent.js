import { discussionText, pendingMessages } from "../shared/context.js";
import { trackThinking } from "./agent-thinking.js";
import { DeepSeekHarness } from "@deepseek-ai/dsh-sdk-client";
import { createServer } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { query } from "./db.js";
import { Service, HttpError } from "./service.js";
import { createAgentTools } from "./agent-tools.js";
import { releaseSandbox } from "./agent-sandbox.js";

const running = new Map();
export async function stopAgent(db, threadId, messageId) {
  const task = running.get(messageId);
  await Promise.allSettled([task?.close(), releaseSandbox(db, threadId)]);
}
async function checkpoint(db, threadId, home, seenSequence) {
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
  const data = gzipSync(JSON.stringify(files));
  if (data.length > 10 * 1024 * 1024)
    throw new Error("Agent 会话快照超过 10 MiB");
  await query(
    db,
    "UPDATE agent_sessions SET checkpoint=?,seen_sequence=? WHERE thread_id=?",
    [data, seenSequence, threadId],
  );
}
export async function openAgentRuntime(
  context,
  { db, job, user, observe = true, autoCompact = true },
) {
  const service = new Service(db);
  const progress = (text) =>
    job.message_id
      ? query(
          db,
          "UPDATE assistant_replies SET progress=? WHERE message_id=?",
          [text, job.message_id],
        )
      : Promise.resolve();
  await progress("正在启动 DSH Agent");
  await query(
    db,
    "INSERT IGNORE INTO agent_sessions(thread_id,session_id) VALUES(?,?)",
    [job.thread_id, randomUUID()],
  );
  const [session] = await query(
    db,
    "SELECT * FROM agent_sessions WHERE thread_id=?",
    [job.thread_id],
  );
  const home = resolve(".local/agents", job.thread_id);
  await mkdir(home, { recursive: true });
  // MySQL is authoritative. Restore only session records into a dedicated host orchestration directory.
  if (session.checkpoint) {
    const files = JSON.parse(
      gunzipSync(session.checkpoint, {
        maxOutputLength: 40 * 1024 * 1024,
      }).toString(),
    );
    for (const [path, bytes] of Object.entries(files)) {
      if (
        !/^[A-Za-z0-9_./-]+$/.test(path) ||
        path.startsWith("/") ||
        path.split("/").includes("..")
      )
        throw new Error("无效会话快照路径");
      const target = join(home, "sessions", path);
      await mkdir(resolve(target, ".."), { recursive: true });
      await writeFile(target, Buffer.from(bytes, "base64"));
    }
  }
  const token = randomBytes(32).toString("hex");
  const thinking = trackThinking(db, job.message_id, session.session_id);
  const execute = createAgentTools(
    service,
    { ...user, scope: context.project_id },
    job,
  );
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
        return execute(request.name, request.args);
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
  await writeFile(
    patch,
    `- id: sdk-jsonrpc-server\n  disabled: true\n- insert:\n    - id: cothread-sdk-server\n      name: ${JSON.stringify(pathToFileURL(resolve("runtime/sdk-resume.mjs")).href)}\n      inject: [sdkAppStartup, loader]\n    - id: cothread-project-tools\n      name: ${JSON.stringify(pathToFileURL(resolve("runtime/cothread-tools.mjs")).href)}\n`,
  );
  // Never inherit database, ACS or unrelated application secrets into the Agent process.
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
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || "",
    COTHREAD_BRIDGE_URL: `http://127.0.0.1:${bridge.address().port}`,
    COTHREAD_BRIDGE_TOKEN: token,
    COTHREAD_RESUME_SESSION: session.checkpoint ? session.session_id : "",
    HOME: home,
    USERPROFILE: home,
  });
  const harness = new DeepSeekHarness({
    profile: "sdk-minimal",
    dshHome: home,
    processCwd: home,
    cwd: home,
    patches: [resolve("runtime/agent-patch.yml"), patch],
    env,
    model: process.env.CHAT_MODEL || "deepseek-v4-flash",
    initializeTimeoutMs: 30000,
    requestTimeoutMs: 600000,
    maxTokens: 8192,
  });
  if (job.message_id) running.set(job.message_id, harness);
  let seenSequence = session.seen_sequence;
  let sampling = Promise.resolve();
  let samplingNow = false;
  let interval;
  let closed = false;
  const request = (method, params = {}) =>
    harness.client.request(
      `cothread/${method}`,
      { sessionId: session.session_id, ...params },
      250000,
    );
  const sample = () => {
    if (samplingNow || closed) return sampling;
    samplingNow = true;
    sampling = request("context")
      .then((stats) =>
        query(
          db,
          "UPDATE agent_sessions SET context_stats=? WHERE thread_id=?",
          [JSON.stringify({ ...stats, seenSequence }), job.thread_id],
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
      await sampling.catch(() => {});
      await sample();
    } finally {
      closed = true;
      try {
        await harness.close();
      } finally {
        await chain;
        await new Promise((resolve) => bridge.close(resolve));
        await thinking.close(completed ? "completed" : "failed");
        await checkpoint(db, job.thread_id, home, seenSequence);
      }
    }
  };
  try {
    await harness.start();
    // Append only new discussion. Native assistant turns and compressed summaries
    // already live in this session and must never be re-sent as full transcripts.
    const fresh = observe
      ? pendingMessages(context.messages, seenSequence, context.replies)
      : [];
    await request("observe", { messages: fresh.map(discussionText) });
    if (observe && context.messages.length)
      seenSequence = context.messages.at(-1).sequence;
    await sample();
    interval = setInterval(() => void sample().catch(() => {}), 2000);
    interval.unref();
    if (autoCompact) await request("compact", { automatic: true });
    await sample();
    return { harness, session, request, sample, close, progress, thinking };
  } catch (error) {
    await close().catch(() => {});
    throw error;
  }
}

export async function generateAgentReply(context, { db, job, user, runtime }) {
  const owned = !runtime;
  runtime ||= await openAgentRuntime(context, { db, job, user });
  const { harness, session, progress, thinking } = runtime;
  let timer;
  let completed = false;
  try {
    const prompt = `你是共序项目中的助理，姓名是小祥。当前项目 ID：${context.project_id}。迭代 ID：${job.thread_id}。ACS 工作区 /home/user/cothread/${job.thread_id}。
请回应当前上下文中 ID 为 ${job.message_id} 的成员消息。本轮已确定需要回复：明确 @小祥、项目中只有一名成员与助手，或模型判断应参与多人讨论。只有一名成员时，即使未 @ 也应作为直接对话正常回应。请简洁回应，不擅自扩展任务或把成员之间的分工当作对你的授权。若成员确实请求你实现、分析文件或产出内容，应实际调用工具完成并保存结果。`;
    await progress("Agent 正在分析请求");
    const result = await Promise.race([
      harness.run(prompt, {
        sessionId: session.session_id,
        onNotification: thinking.notify,
      }),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Agent 执行超过 10 分钟")),
          600000,
        );
      }),
    ]);
    if (!result.finalResponse?.trim()) throw new Error("Agent 未返回最终结果");
    await thinking.close("completed");
    completed = true;
    await progress("正在保存 Agent 会话");
    await runtime.sample();
    return result.finalResponse.slice(0, 20000);
  } finally {
    clearTimeout(timer);
    if (owned) await runtime.close(completed);
  }
}
