import { createServer } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { createUsageMeter } from "./agent-usage.js";
import { assetPath } from "./assets.js";
import { restoreSessionCheckpoint } from "./agent-checkpoint.js";
import { contextInjectionFromEvent } from "../shared/context-injection.js";
import { elderRuntimePatch } from "./dsh-runtime-config.js";
import { contextBudget, contextUsage } from "../shared/context.js";
import { MCP_CAPABILITIES } from "../shared/mcp-capabilities.js";
import { dshModelMaxTokens, dshModelPatch, modelConfig, redactSecrets } from "./model-config.js";
import { mcpReadToolSpecs } from "./mcp.js";

const RANGE = {
  project: "当前项目。只读查知识页、文档、迭代、消息、任务和成员。",
  company: "所属全部。只读查提问者所在的项目和公司公开指南。",
  org: "这个组织已发布的知识，不展开参与项目的正文。",
  web: "全网检索。先查所属全部里的资料，需要时再用网页搜索和阅读。",
};

const MCP_READ = MCP_CAPABILITIES.filter((item) => item.access === "read").map((item) => item.name);
const MCP_TITLE = Object.fromEntries(MCP_CAPABILITIES.map((item) => [item.name, item.title]));

export function elderToolNames(scope) {
  const names = ["search_knowledge", ...MCP_READ];
  if (scope === "web") names.push("web_search", "web_fetch");
  return names;
}

function iterationFocusLine(focus) {
  const id = typeof focus?.id === "string" ? focus.id.trim() : "";
  const title =
    typeof focus?.title === "string" ? focus.title.replace(/\s+/g, " ").trim().slice(0, 160) : "";
  if (!id || !title) return "提问者没有打开具体迭代。";
  return (
    "提问者左侧正在看的群聊迭代：" +
    title +
    "（threadId：" +
    id +
    "）。同一项目里切换迭代不换这番对话，以本轮注入为准。没有点名别的迭代时，用 get_iteration_context 和 list_messages 优先看这次。询问范围仍按上一句，这次迭代是他正在看的背景。"
  );
}

/**
 * 老翁问答里与本次提问无关的固定指令段。
 * elderPrompt 用它拼每轮提示词，轨迹接口也用它回填 systemPrompt，
 * 两边同源，避免轨迹里展示的规则和真正下发的不一致。
 */
export function elderInstruction(scope) {
  return [
    "你是老翁，运行在 DSH 中。这是和提问者的私聊。",
    "先用一两句说出你对问题的理解，然后再调用工具。不要以「我理解：」开头。",
    "查阅时边做边说：每次工具前后用简短中文说明你在看什么、看到了什么。",
    "只能使用只读工具。不要改文档、建任务或往群里发言。",
    "数量、清单、有哪些，用同名的 MCP 只读工具，例如 get_project_context。不要把整句拿去 search_knowledge。当前项目会自动带上 projectId。",
    "问「以前说过什么、做过什么决策、承诺过什么、有哪些重要任务或文档」先用 search_memory 检索项目记忆；它返回摘要与出处，需要原话再按出处核对，不要凭印象编造。",
    "读项目文档正文用 read_document，传入 list_documents 或消息引用里的版本 ID。它返回文本和是否截断；截断时用返回的 nextOffset 作为 offset 续读。不要用 get_document_version 读正文，那个工具按字节分片下载原始文件，正文不会进入回答。",
    "没有查到就说明没有，不要编造。",
    "询问范围：" + (RANGE[scope] || RANGE.project),
  ].join("\n");
}

/**
 * 本轮真正注入给模型的上下文：范围规则 + 当前迭代焦点。
 * 它约束老翁「只按这个范围查」，是编排里必要的注入，轨迹里的「上下文」行记录的就是这段原文。
 */
export function elderContextBlock(scope, focus) {
  return [elderInstruction(scope), iterationFocusLine(focus)].filter(Boolean).join("\n");
}

export function elderPrompt(question, scope, focus) {
  return [elderContextBlock(scope, focus), "问题：" + question].join("\n");
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const inputTokens =
    usage.inputTokens ??
    usage.input ??
    Math.max(0, (usage.input_tokens || 0) - (usage.input_tokens_details?.cached_tokens || 0));
  const outputTokens = usage.outputTokens ?? usage.output ?? usage.output_tokens ?? 0;
  const cacheReadTokens =
    usage.cacheReadTokens ?? usage.cacheRead ?? usage.input_tokens_details?.cached_tokens ?? 0;
  const cacheWriteTokens =
    usage.cacheWriteTokens ??
    usage.cacheWrite ??
    usage.input_tokens_details?.cache_write_tokens ??
    0;
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens:
      usage.totalTokens ??
      usage.total_tokens ??
      inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
    calls: 1,
  };
}

function dropUnderstandingLabel(text) {
  return String(text || "")
    .replace(/^(?:\s*我理解\s*[:：]\s*)+/, "")
    .trim();
}

function textOf(event) {
  const chunk = event?.data?.chunk;
  return event?.type === "assistant/chunk" &&
    chunk?.type === "text-delta" &&
    typeof chunk.text === "string"
    ? chunk.text
    : "";
}

export function foldElderRun({ notifications = [], toolSteps = [], finalResponse = "" }) {
  let understanding = "";
  let narration = "";
  let sawTool = false;
  for (const note of notifications) {
    if (note?.method !== "session.event") continue;
    const event = note.params?.event;
    if (event?.type === "tool/call") sawTool = true;
    const text = textOf(event);
    if (!text) continue;
    if (sawTool) narration += text;
    else understanding += text;
  }
  understanding = dropUnderstandingLabel(understanding);
  narration = dropUnderstandingLabel(narration);
  const answer = dropUnderstandingLabel(
    String(finalResponse || "").trim() || narration || understanding,
  );
  const trace = [];
  if (understanding)
    trace.push({ tool: "understanding", label: "理解", status: "completed", text: understanding });
  trace.push(...toolSteps);
  if (narration)
    trace.push({ tool: "assistant_text", label: "说明", status: "completed", text: narration });
  return {
    text: answer || "没有形成回答。",
    trace,
  };
}

async function listen(handler) {
  const bridge = createServer(handler);
  await new Promise((resolve) => bridge.listen(0, "127.0.0.1", resolve));
  return bridge;
}

async function captureCheckpoint(home) {
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
  const checkpoint = gzipSync(JSON.stringify(files));
  return checkpoint.length > 10 * 1024 * 1024 ? null : checkpoint;
}

async function sampleContext(harness, sessionId) {
  if (!harness?.client?.request) return null;
  try {
    return await harness.client.request("cothread/context", { sessionId });
  } catch {
    return null;
  }
}

export async function compactElderHome({ home, sessionId, checkpoint, model, createHarness }) {
  if (checkpoint) {
    const files = JSON.parse(
      gunzipSync(checkpoint, { maxOutputLength: 40 * 1024 * 1024 }).toString(),
    );
    await restoreSessionCheckpoint(files, home);
  }
  const configured = model || modelConfig("knowledge");
  // 压缩要走 cothread/sdk-resume 注册的运行时方法，所以必须和提问时用同一套插件补丁，
  // 否则 DSH 会回 "unknown method: cothread/compact"。
  const runtimePatch = join(home, "runtime.yml");
  const modelPatch = join(home, "model.yml");
  await writeFile(runtimePatch, elderRuntimePatch());
  await writeFile(modelPatch, dshModelPatch(configured, "knowledge"));
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
    MODEL_API_KEY: configured.apiKey,
    COTHREAD_PRIMARY_AGENT_LEVEL: "knowledge",
    COTHREAD_RESUME_SESSION: sessionId,
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
    model: configured.model,
    initializeTimeoutMs: 30000,
    requestTimeoutMs: 250000,
    maxTokens: dshModelMaxTokens(configured, "knowledge"),
  };
  const open =
    createHarness ||
    (async (options) => new (await import("@deepseek-ai/dsh-sdk-client")).DeepSeekHarness(options));
  const harness = await open(harnessOptions);
  try {
    await harness.start?.();
    if (!harness.client?.request) return { changed: false, reason: "already_small" };

    const before = await sampleContext(harness, sessionId);
    const result = (await harness.client.request(
      "cothread/compact",
      { sessionId, automatic: false },
      250000,
    )) || { changed: true };
    return {
      ...result,
      contextStats: await sampleContext(harness, sessionId),
      before: before?.used || 0,
      checkpoint: await captureCheckpoint(home),
    };
  } finally {
    await harness.close?.().catch(() => {});
  }
}

export async function runElderQuestion({
  question,
  scope,
  focus,
  lookup,
  createHarness,
  model,
  persist,
  onProgress,
}) {
  const names = elderToolNames(scope);
  const prompt = elderPrompt(question, scope, focus);
  // DSH 的上下文注入本质是一条带 source 的 user 消息：kind/form/summary 是可展示的来源元数据。
  const injections = [];
  const token = randomBytes(24).toString("hex");
  const materials = [];
  const toolSteps = [];
  const notifications = [];
  let phaseTools = false;
  let streamed = "";
  let reasoning = "";
  let streamedUsage = null;
  let startedAt = 0;
  const timingMeter = createUsageMeter();
  const budget = contextBudget("knowledge");
  const publish = () => {
    if (typeof onProgress !== "function") return;
    const folded = foldElderRun({ notifications, toolSteps, finalResponse: "" });
    const partial = folded.text === "没有形成回答。" ? "" : folded.text;
    const text = dropUnderstandingLabel(partial || streamed || reasoning);
    const timed = timingMeter.result();
    const elapsed = startedAt ? Date.now() - startedAt : 0;
    const usage = {
      ...(streamedUsage || {}),
      modelMs: elapsed,
      executionDurationMs: elapsed,
      ttftMs: timed?.ttftMs || 0,
      ttftSteps: timed?.ttftSteps || 0,
      decodeMs: timed?.decodeMs || 0,
      decodeTokens: timed?.decodeTokens || 0,
    };
    try {
      onProgress({
        ...folded,
        text,
        usage,
        contextUsage: contextUsage(
          {
            context_stats: {
              used: usage?.totalTokens || Math.ceil(text.length / 4),
              estimated: !usage?.totalTokens,
              limit: budget.limit,
              autoCompactAt: budget.autoCompactAt,
              categories: {
                discussion: usage?.inputTokens || 0,
                assistant: usage?.outputTokens || Math.ceil(text.length / 4),
              },
              compactions: 0,
              measuredAt: new Date().toISOString(),
            },
          },
          [],
          [],
        ),
      });
    } catch {
      // 页面断开时不要中断老翁这一轮。
    }
  };
  const bridge = await listen(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    const supplied = Buffer.from(req.headers.authorization || "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (
      req.method !== "POST" ||
      (req.url !== "/tool" && req.url !== "/stream") ||
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      res.writeHead(403);
      res.end("{}");
      return;
    }
    try {
      let body = "";
      for await (const chunk of req) body += chunk;
      const request = JSON.parse(body);
      if (req.url === "/stream") {
        if (request.type === "text-delta") streamed += request.text || "";
        else if (request.type === "reasoning-delta") reasoning += request.text || "";
        else if (request.type === "usage" && request.usage)
          streamedUsage = normalizeUsage(request.usage);
        publish();
        res.end("{}");
        return;
      }
      if (!names.includes(request.name)) throw new Error("老翁只能只读查阅");
      phaseTools = true;
      const found = await lookup(request.name, request.args || {});
      materials.push(...(found.materials || []));
      toolSteps.push({
        tool: request.name,
        label:
          MCP_TITLE[request.name] ||
          (request.name === "web_search"
            ? "搜索网页"
            : request.name === "web_fetch"
              ? "阅读网页"
              : "查阅资料"),
        status: "completed",
        input: String(
          request.args?.query || request.args?.url || request.args?.versionId || "",
        ).slice(0, 200),
        output: String(found.text || "").slice(0, 1000),
      });
      publish();
      res.end(JSON.stringify(found.text || ""));
    } catch (error) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: error.message || "查阅失败" }));
    }
  });
  const home = persist?.home || (await mkdtemp(join(tmpdir(), "cothread-elder-")));
  if (persist?.home) await mkdir(home, { recursive: true });
  const checkpoint = persist?.checkpoint?.length ? persist.checkpoint : null;
  let resumeSessionId = "";
  if (checkpoint && persist?.sessionId) {
    try {
      const files = JSON.parse(
        gunzipSync(checkpoint, { maxOutputLength: 40 * 1024 * 1024 }).toString(),
      );
      await restoreSessionCheckpoint(files, home);
      resumeSessionId = persist.sessionId;
    } catch {
      resumeSessionId = "";
    }
  }
  const sessionId = resumeSessionId || randomUUID();
  const started = Date.now();
  startedAt = started;
  let harness;
  try {
    const configured = model || modelConfig("knowledge");
    const runtimePatch = join(home, "runtime.yml");
    const modelPatch = join(home, "model.yml");
    await writeFile(runtimePatch, elderRuntimePatch());
    await writeFile(modelPatch, dshModelPatch(configured, "knowledge"));
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
      MODEL_API_KEY: configured.apiKey,
      COTHREAD_BRIDGE_URL: `http://127.0.0.1:${bridge.address().port}`,
      COTHREAD_BRIDGE_TOKEN: token,
      COTHREAD_ALLOWED_TOOLS: JSON.stringify(names),
      COTHREAD_MCP_TOOLS: JSON.stringify(mcpReadToolSpecs()),
      COTHREAD_PRIMARY_AGENT_LEVEL: "knowledge",
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
      model: configured.model,
      initializeTimeoutMs: 30000,
      requestTimeoutMs: 180000,
      maxTokens: dshModelMaxTokens(configured, "knowledge"),
    };
    const open =
      createHarness ||
      (async () =>
        new (await import("@deepseek-ai/dsh-sdk-client")).DeepSeekHarness(harnessOptions));
    harness = await open(harnessOptions);
    await harness.start();
    const result = await harness.run(prompt, {
      sessionId,
      onNotification: (note) => {
        const injection = contextInjectionFromEvent(note?.params?.event);
        if (injection) injections.push(injection);
        if (phaseTools && note?.params?.event?.type === "tool/call") return;
        if (note?.params?.event) timingMeter.notify(note.params.event);
        notifications.push(note);
        if (note?.params?.event?.type === "tool/call") phaseTools = true;
        publish();
      },
    });
    const folded = foldElderRun({
      notifications,
      toolSteps,
      finalResponse: result?.finalResponse || streamed || "",
    });
    const contextStats = await sampleContext(harness, sessionId);
    const modelMs = Date.now() - started;
    const text = folded.text || streamed;
    const timed = timingMeter.result();
    return {
      ...folded,
      text,
      materials,
      injections,
      // 真实注入的上下文原文，由记录层落成轨迹里的「上下文」事件。
      contextBlock: elderContextBlock(scope, focus),
      sessionId,
      contextStats: contextStats?.used ? contextStats : null,
      checkpoint: persist ? await captureCheckpoint(home).catch(() => null) : null,
      usage: {
        ...(streamedUsage || {}),
        model: configured.model || undefined,
        reasoningEffort: configured.reasoningEffort || undefined,
        settingsVersion: configured.settingsVersion ?? null,
        modelMs,
        executionDurationMs: modelMs,
        calls: streamedUsage?.calls || timed?.calls || 1,
        ttftMs: timed?.ttftMs || 0,
        ttftSteps: timed?.ttftSteps || 0,
        decodeMs: timed?.decodeMs || 0,
        decodeTokens: timed?.decodeTokens || timed?.outputTokens || 0,
        totalTokens:
          streamedUsage?.totalTokens ||
          contextStats?.used ||
          Math.ceil((question.length + text.length) / 4),
        inputTokens:
          streamedUsage?.inputTokens ||
          contextStats?.categories?.discussion ||
          Math.ceil(question.length / 4),
        outputTokens:
          streamedUsage?.outputTokens ||
          contextStats?.categories?.assistant ||
          Math.ceil(text.length / 4),
      },
    };
  } catch (error) {
    error.message = redactSecrets(error.message || String(error));
    throw error;
  } finally {
    await harness?.close?.().catch(() => {});
    bridge.close();
    if (!persist) await rm(home, { recursive: true, force: true }).catch(() => {});
  }
}
