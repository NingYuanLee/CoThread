import { createServer } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { createUsageMeter } from "./agent-usage.ts";
import { assetPath } from "./assets.ts";
import { restoreSessionCheckpoint } from "./agent-checkpoint.ts";
import { contextInjectionFromEvent } from "../shared/context-injection.js";
import { elderRuntimePatch } from "./dsh-runtime-config.ts";
import { contextBudget, contextUsage } from "../shared/context.js";
import { MCP_CAPABILITIES } from "../shared/mcp-capabilities.js";
import { dshModelMaxTokens, dshModelPatch, modelConfig, redactSecrets } from "./model-config.js";
import { mcpReadToolSpecs } from "./mcp.js";
import type { AddressInfo } from "node:net";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DeepSeekHarness, HarnessNotification } from "@deepseek-ai/dsh-sdk-client";
import type { Db } from "./types.ts";

/** 询问范围：提问者在输入框切换的三档，外加组织公开指南这一档。 */
type ElderScope = "project" | "company" | "web" | "org";

/** 提问者左侧正在看的迭代；前端可能不传。 */
type ElderFocus = { id?: unknown; title?: unknown };

/** `session.event` 负载：只声明本文件真正读到的字段，其余保持 `unknown`。 */
type ElderSessionEvent = {
  type?: string;
  data?: { chunk?: { type?: string; text?: string }; reason?: unknown };
  [field: string]: unknown;
};

/** 轨迹条目：工具步骤带输入输出，「理解 / 说明」段只带正文。 */
type ElderTraceItem = {
  tool: string;
  label: string;
  status: string;
  input?: string;
  output?: string;
  text?: string;
};

/** 一条上下文注入（`cothread/context` 之外由事件里取的来源与正文）。 */
type ElderInjection = { text: string; source: unknown };

/** 用量计的归一结果：四种 token 与调用次数。 */
type NormalizedUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  calls: number;
};

/** `cothread/context` 的采样结果：自定义方法不在协议类型里，只声明读到的字段。 */
type ElderContextSample = {
  used?: number;
  autoCompactAt?: number;
  categories?: { discussion?: number; assistant?: number };
  [field: string]: unknown;
};

/** `cothread/compact` 的结果；`changed` 之外都是可选的诊断信息。 */
type ElderCompactResult = {
  changed: boolean;
  reason?: string;
  before?: number;
  after?: number;
  contextStats?: ElderContextSample | null;
  checkpoint?: Buffer | null;
  [field: string]: unknown;
};

/** DSH SDK 运行时对象；测试会注入自己的替身。 */
type ElderHarness = DeepSeekHarness;
type ElderHarnessOptions = NonNullable<ConstructorParameters<typeof DeepSeekHarness>[0]>;
type CreateElderHarness = (options: ElderHarnessOptions) => ElderHarness | Promise<ElderHarness>;

/** 查阅入口：由 `wiki-questions` 注入，老翁只透传工具名与参数。 */
type ElderLookup = (
  name: string,
  args: Record<string, unknown>,
  options?: { onProgress?: (line: unknown) => void },
) => Promise<{ text?: unknown; materials?: unknown[] }>;

/** 进度回调：页面浮窗按这个结构增量渲染。 */
type ElderProgress = {
  text: string;
  trace: ElderTraceItem[];
  usage: Record<string, unknown>;
  contextUsage: unknown;
};

/** 老翁会话的持久化位置：重置时 `persist` 为空，跑完删除临时 home。 */
type ElderPersist = {
  home?: string;
  checkpoint?: Buffer | string | null;
  sessionId?: string | null;
};

const ASKER_SCOPES = [
  ["project", "当前项目", "只读查这个项目的项目记忆、文档、迭代、消息、任务和成员。"],
  ["company", "所属全部", "只读查提问者所在的项目和公司公开指南。"],
  [
    "web",
    "全网检索",
    "先查所属全部里的资料，需要时再用网页搜索和阅读。只有这一档有 web_search 和 web_fetch。",
  ],
];

function scopeInstruction(scope: ElderScope): string {
  if (scope === "org") return "询问范围：本组织已发布的指南，不展开参与项目的正文。";
  const current = ASKER_SCOPES.some(([id]) => id === scope) ? scope : "project";
  // 上一行的候选集与 ASKER_SCOPES 同源，命中一定有值。
  const label = ASKER_SCOPES.find(([id]) => id === current)![1];
  return [
    "问老翁有三种范围，由提问者在输入框切换，你不能自己换：",
    ...ASKER_SCOPES.map(
      ([id, name, detail]) => "- " + name + (id === current ? "（本轮）" : "") + "：" + detail,
    ),
    "本轮只按「" +
      label +
      "」查。另外两种没有放行；问题需要另一种时，请提问者自己切换，不要假装已经查过。",
  ].join("\n");
}

const MCP_READ = MCP_CAPABILITIES.filter((item) => item.access === "read").map((item) => item.name);
const MCP_TITLE = Object.fromEntries(MCP_CAPABILITIES.map((item) => [item.name, item.title]));

export function elderToolNames(scope: ElderScope): string[] {
  const names = ["beijing_time", "miaowen_chat", ...MCP_READ];
  if (scope === "web") names.push("web_search", "web_fetch");
  return names;
}

function iterationFocusLine(focus: ElderFocus | null | undefined): string {
  const id = typeof focus?.id === "string" ? focus.id.trim() : "";
  const title =
    typeof focus?.title === "string" ? focus.title.replace(/\s+/g, " ").trim().slice(0, 160) : "";
  if (!id || !title) return "提问者没有打开具体迭代。";
  return (
    "提问者左侧正在看的群聊迭代：" +
    title +
    "（threadId：" +
    id +
    "）。同一项目里切换迭代不换这番对话，以本轮注入为准。没有点名别的迭代时，用 get_iteration_context 和 list_messages 优先看这次。询问范围仍按上面的本轮范围，这次迭代是他正在看的背景。"
  );
}

/**
 * 老翁问答里与本次提问无关的固定指令段。
 * elderPrompt 用它拼每轮提示词，轨迹接口也用它回填 systemPrompt，
 * 两边同源，避免轨迹里展示的规则和真正下发的不一致。
 */
export function elderInstruction(scope: ElderScope): string {
  return [
    "你是老翁，运行在 DSH 中。这是和提问者的私聊。",
    "先用一两句说出你对问题的理解，然后再调用工具。不要以「我理解：」开头。",
    "查阅时边做边说：每次工具前后用简短中文说明你在看什么、看到了什么。",
    "除 miaowen_chat 外，只能使用只读工具。不要改文档、建任务或往群里发言。",
    "腾讯广告、微信广告、朋友圈广告、视频号广告、微信小店、妙问、开户、充值、审核、素材、报表、诊断、创意和投放，用 miaowen_chat。技能在共序进程内直接请求妙问，不要运行 node，不要读脚本，也不要另起服务。",
    "妙问 API KEY 在提问者的个人环境变量里。你不能直接读取环境变量。调用 miaowen_chat 时，共序会在工具内部注入。未配置或失效时，请他到个人设置的「环境变量」填写以 sk-mw- 开头的 API KEY。不要让他把 KEY 发到对话里，也不要在回答里复述 KEY。",
    "用户没有明确要求创建、修改或管理广告时，只通过妙问查询、分析和建议。",
    "miaowen_chat 可能要几分钟。[RESULT] 之后的 Markdown 必须原样给出，保留 video、img、audio 标签和完整地址。有 [FEEDBACK_IDS] 时，在结尾用灰色小字注明会话 ID 和消息 ID。结果写明是阶段性结果时，要告诉提问者不完整并询问是否重试。本地文件不能预审；只有用户给出的 https 素材地址才能放进 attachments。",
    "数量、清单、有哪些，用对应的 MCP 只读工具，例如 get_project_context、list_documents、list_tasks、list_messages。当前项目会自动带上 projectId。",
    "问「以前说过什么、做过什么决策、承诺过什么、有哪些主要任务或文件」先用 search_memory。subject 只能是 utterance（关键发言）、document（文件索引）、task（主要任务）、discussion（核心议题）、project（项目进程）。它返回现行记忆的摘要和出处，根文件夹索引可带导航；要原话再按出处用 read_message 或 read_document 核对。不要凭印象编造，回答时用这五类名称。",
    "项目进程出处为 milestone、iteration_context、archive 或 memory_page 时，用 read_memory_source 核对原始变更、归档或关联记忆。",
    "记忆只有现行和作废，现行不代表发言客观真实。查当前安排用 search_memory purpose=current，查历史或原因用 purpose=history/explain；按引用的 memoryRevisionId 用 read_memory_revision 读当时内容，原话、独立判断和更多出处用 read_memory_history 分页查。A 后来改口不抹掉 A 曾说过的话，原因推断要明确是解释。",
    "项目创建人时间、迭代和任务的当前状态、全量统计与业务事件用 read_project_facts。get_task 的 decisionEvidence 是当时记录的请求、明确采用的记忆修订和附带文档，未记录的决定依据不要补造。",
    "读项目文档正文用 read_document，传入 list_documents 或消息引用里的版本 ID。它返回文本和是否截断；截断时用返回的 nextOffset 作为 offset 续读。不要用 get_document_version 读正文，那个工具按字节分片下载原始文件，正文不会进入回答。",
    "没有查到就说明没有，不要编造。",
    scopeInstruction(scope),
  ].join("\n");
}

/**
 * 本轮真正注入给模型的上下文：范围规则 + 当前迭代焦点。
 * 它约束老翁「只按这个范围查」，是编排里必要的注入，轨迹里的「上下文」行记录的就是这段原文。
 */
export function elderContextBlock(scope: ElderScope, focus: ElderFocus | null | undefined): string {
  return [elderInstruction(scope), iterationFocusLine(focus)].filter(Boolean).join("\n");
}

export function elderPrompt(
  question: string,
  scope: ElderScope,
  focus?: ElderFocus | null,
): string {
  return [elderContextBlock(scope, focus), "问题：" + question].join("\n");
}

/** 问老翁读的是每轮提示词，不是工具名单。技能正文必须写在这里。 */
export function elderPromptWithSkills(prompt: string, instructions: unknown): string {
  const text = typeof instructions === "string" ? instructions.trim() : "";
  if (!text) return prompt;
  return [
    prompt,
    "已启用的老翁技能。问到技能名称、内容或用法时，直接依据下文回答，不要说自己没有这个技能。调用妙问只用 miaowen_chat。下文不增加其他工具。",
    text,
  ].join("\n\n");
}

/** 问老翁的运行身份是 knowledge，技能插件按这个键取正文。 */
export function elderSkillsBinding(instructions: unknown): Record<string, string> {
  const text = typeof instructions === "string" ? instructions : "";
  if (!text) return {};
  return { COTHREAD_SKILLS_BY_LEVEL: JSON.stringify({ knowledge: text }) };
}

async function laowengSkillInstructions(db: Db | null | undefined): Promise<string> {
  if (!db) return "";
  try {
    const { loadAgentCapabilityProfile } = await import("./agent-capabilities.ts");
    const profile = await loadAgentCapabilityProfile(db, "laoweng");
    return profile.instructions || "";
  } catch (error) {
    console.error("老翁技能没有装上", {
      type: (error as { name?: unknown } | null)?.name || "Error",
    });
    return "";
  }
}

async function resolveElderSkillInstructions(
  db: Db | null | undefined,
  skillInstructions: unknown,
): Promise<string> {
  if (typeof skillInstructions === "string") return skillInstructions;
  return laowengSkillInstructions(db);
}

function normalizeUsage(usage: unknown): NormalizedUsage | null {
  if (!usage || typeof usage !== "object") return null;
  const raw = usage as {
    inputTokens?: number;
    input?: number;
    input_tokens?: number;
    input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
    outputTokens?: number;
    output?: number;
    output_tokens?: number;
    cacheReadTokens?: number;
    cacheRead?: number;
    cacheWriteTokens?: number;
    cacheWrite?: number;
    totalTokens?: number;
    total_tokens?: number;
  };
  const inputTokens =
    raw.inputTokens ??
    raw.input ??
    Math.max(0, (raw.input_tokens || 0) - (raw.input_tokens_details?.cached_tokens || 0));
  const outputTokens = raw.outputTokens ?? raw.output ?? raw.output_tokens ?? 0;
  const cacheReadTokens =
    raw.cacheReadTokens ?? raw.cacheRead ?? raw.input_tokens_details?.cached_tokens ?? 0;
  const cacheWriteTokens =
    raw.cacheWriteTokens ?? raw.cacheWrite ?? raw.input_tokens_details?.cache_write_tokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens:
      raw.totalTokens ??
      raw.total_tokens ??
      inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
    calls: 1,
  };
}

function dropUnderstandingLabel(text: unknown): string {
  return String(text || "")
    .replace(/^(?:\s*我理解\s*[:：]\s*)+/, "")
    .trim();
}

/** 通知里的 `session.event` 负载；不是普通对象时当作没有事件。 */
function sessionEventOf(note: HarnessNotification | null | undefined): ElderSessionEvent | null {
  const event = note?.params?.event;
  return event && typeof event === "object" ? (event as ElderSessionEvent) : null;
}

function textOf(event: ElderSessionEvent | null | undefined): string {
  const chunk = event?.data?.chunk;
  return event?.type === "assistant/chunk" &&
    chunk?.type === "text-delta" &&
    typeof chunk.text === "string"
    ? chunk.text
    : "";
}

export function foldElderRun({
  notifications = [],
  toolSteps = [],
  finalResponse = "",
}: {
  notifications?: HarnessNotification[];
  toolSteps?: ElderTraceItem[];
  finalResponse?: string;
}) {
  let understanding = "";
  let narration = "";
  let sawTool = false;
  for (const note of notifications) {
    if (note?.method !== "session.event") continue;
    const event = sessionEventOf(note);
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
  const trace: ElderTraceItem[] = [];
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

async function listen(
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
): Promise<ReturnType<typeof createServer>> {
  const bridge = createServer(handler);
  // 妙问官方超时是 10 分钟。桥只负责收完一个很小的工具请求，真正等待发生在响应阶段。
  bridge.timeout = 0;
  bridge.requestTimeout = 12 * 60 * 1000;
  await new Promise<void>((resolve) => bridge.listen(0, "127.0.0.1", () => resolve()));
  return bridge;
}

async function captureCheckpoint(home: string): Promise<Buffer | null> {
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
  const checkpoint = gzipSync(JSON.stringify(files));
  return checkpoint.length > 10 * 1024 * 1024 ? null : checkpoint;
}

async function sampleContext(
  harness: ElderHarness,
  sessionId: string,
): Promise<ElderContextSample | null> {
  if (!harness?.client?.request) return null;
  try {
    return (await harness.client.request("cothread/context", { sessionId })) as ElderContextSample;
  } catch {
    return null;
  }
}

export async function compactElderHome({
  home,
  sessionId,
  checkpoint,
  model,
  createHarness,
  db,
  skillInstructions,
}: {
  home: string;
  sessionId: string;
  checkpoint?: Buffer | string | null;
  model?: ReturnType<typeof modelConfig>;
  createHarness?: CreateElderHarness;
  db?: Db | null;
  skillInstructions?: unknown;
}): Promise<ElderCompactResult> {
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
  const skillText = await resolveElderSkillInstructions(db, skillInstructions);
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
    MODEL_API_KEY: configured.apiKey,
    COTHREAD_PRIMARY_AGENT_LEVEL: "knowledge",
    COTHREAD_RESUME_SESSION: sessionId,
    HOME: home,
    USERPROFILE: home,
    ...elderSkillsBinding(skillText),
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
  const open: CreateElderHarness =
    createHarness ||
    (async (options: ElderHarnessOptions) =>
      new (await import("@deepseek-ai/dsh-sdk-client")).DeepSeekHarness(options));
  const harness = await open(harnessOptions);
  try {
    await harness.start?.();
    if (!harness.client?.request) return { changed: false, reason: "already_small" };

    const before = await sampleContext(harness, sessionId);
    const result = ((await harness.client.request(
      "cothread/compact",
      { sessionId, automatic: false },
      250000,
    )) || { changed: true }) as ElderCompactResult;
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
  db,
  skillInstructions,
}: {
  question: string;
  scope: ElderScope;
  focus?: ElderFocus | null;
  lookup: ElderLookup;
  createHarness?: CreateElderHarness;
  model?: ReturnType<typeof modelConfig>;
  persist?: ElderPersist | null;
  onProgress?: (progress: ElderProgress) => void;
  db?: Db | null;
  skillInstructions?: unknown;
}) {
  const names = elderToolNames(scope);
  const prompt = elderPrompt(question, scope, focus);
  // DSH 的上下文注入本质是一条带 source 的 user 消息：kind/form/summary 是可展示的来源元数据。
  const injections: ElderInjection[] = [];
  const token = randomBytes(24).toString("hex");
  const materials: unknown[] = [];
  const toolSteps: ElderTraceItem[] = [];
  const notifications: HarnessNotification[] = [];
  let phaseTools = false;
  let streamed = "";
  let reasoning = "";
  let streamedUsage: NormalizedUsage | null = null;
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
      const input = String(
        request.args?.query || request.args?.url || request.args?.versionId || "",
      ).slice(0, 200);
      const label =
        MCP_TITLE[request.name] ||
        (request.name === "web_search"
          ? "搜索网页"
          : request.name === "web_fetch"
            ? "阅读网页"
            : request.name === "miaowen_chat"
              ? "妙问"
              : "查阅资料");
      let runningIndex = -1;
      const found = await lookup(request.name, request.args || {}, {
        onProgress:
          request.name === "miaowen_chat"
            ? (line) => {
                const output = String(line || "").slice(0, 500);
                if (runningIndex < 0) {
                  runningIndex = toolSteps.length;
                  toolSteps.push({
                    tool: request.name,
                    label,
                    status: "running",
                    input,
                    output,
                  });
                } else toolSteps[runningIndex].output = output;
                publish();
              }
            : undefined,
      });
      materials.push(...(found.materials || []));
      const output = String(found.text || "").slice(0, 1000);
      if (runningIndex >= 0) {
        toolSteps[runningIndex].status = "completed";
        toolSteps[runningIndex].output = output;
      } else {
        toolSteps.push({
          tool: request.name,
          label,
          status: "completed",
          input,
          output,
        });
      }
      publish();
      res.end(JSON.stringify(found.text || ""));
    } catch (error) {
      const message = String((error as Error | null)?.message || "查阅失败").replace(
        /sk-mw-[A-Za-z0-9_-]+/g,
        "sk-mw-***",
      );
      const running = toolSteps.find((step) => step.status === "running");
      if (running) {
        running.status = "failed";
        running.output = message.slice(0, 1000);
        publish();
      }
      res.writeHead(400);
      res.end(JSON.stringify({ error: message }));
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
  let harness: ElderHarness | undefined;
  try {
    const configured = model || modelConfig("knowledge");
    const runtimePatch = join(home, "runtime.yml");
    const modelPatch = join(home, "model.yml");
    await writeFile(runtimePatch, elderRuntimePatch());
    await writeFile(modelPatch, dshModelPatch(configured, "knowledge"));
    const skillText = await resolveElderSkillInstructions(db, skillInstructions);
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
    const bridgeAddress = bridge.address() as AddressInfo;
    Object.assign(env, {
      MODEL_API_KEY: configured.apiKey,
      COTHREAD_BRIDGE_URL: `http://127.0.0.1:${bridgeAddress.port}`,
      COTHREAD_BRIDGE_TOKEN: token,
      COTHREAD_ALLOWED_TOOLS: JSON.stringify(names),
      COTHREAD_MCP_TOOLS: JSON.stringify(mcpReadToolSpecs()),
      COTHREAD_PRIMARY_AGENT_LEVEL: "knowledge",
      COTHREAD_RESUME_SESSION: resumeSessionId,
      HOME: home,
      USERPROFILE: home,
      ...elderSkillsBinding(skillText),
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
    const open: CreateElderHarness =
      createHarness ||
      (async (options: ElderHarnessOptions) =>
        new (await import("@deepseek-ai/dsh-sdk-client")).DeepSeekHarness(options));
    harness = await open(harnessOptions);
    await harness.start();
    const runPrompt = elderPromptWithSkills(prompt, skillText);
    const result = await harness.run(runPrompt, {
      sessionId,
      onNotification: (note) => {
        const event = sessionEventOf(note);
        const injection = contextInjectionFromEvent(event);
        if (injection) injections.push(injection);
        if (phaseTools && event?.type === "tool/call") return;
        if (event) timingMeter.notify(event);
        notifications.push(note);
        if (event?.type === "tool/call") phaseTools = true;
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
    // 流式用量是在桥回调里累积的：闭包里的赋值不参与外层的收窄，这里取回声明类型。
    const streamedSnapshot = streamedUsage as NormalizedUsage | null;
    return {
      ...folded,
      text,
      materials,
      injections,
      // 真实注入的上下文原文，由记录层落成轨迹里的「上下文」事件。
      contextBlock: elderPromptWithSkills(elderContextBlock(scope, focus), skillText),
      skillInstructions: skillText,
      sessionId,
      contextStats: contextStats?.used ? contextStats : null,
      checkpoint: persist ? await captureCheckpoint(home).catch(() => null) : null,
      usage: {
        ...(streamedSnapshot || {}),
        model: configured.model || undefined,
        reasoningEffort: configured.reasoningEffort || undefined,
        settingsVersion: configured.settingsVersion ?? null,
        modelMs,
        executionDurationMs: modelMs,
        calls: streamedSnapshot?.calls || timed?.calls || 1,
        ttftMs: timed?.ttftMs || 0,
        ttftSteps: timed?.ttftSteps || 0,
        decodeMs: timed?.decodeMs || 0,
        decodeTokens: timed?.decodeTokens || timed?.outputTokens || 0,
        totalTokens:
          streamedSnapshot?.totalTokens ||
          contextStats?.used ||
          Math.ceil((question.length + text.length) / 4),
        inputTokens:
          streamedSnapshot?.inputTokens ||
          contextStats?.categories?.discussion ||
          Math.ceil(question.length / 4),
        outputTokens:
          streamedSnapshot?.outputTokens ||
          contextStats?.categories?.assistant ||
          Math.ceil(text.length / 4),
      },
    };
  } catch (error) {
    const failure = error as Error;
    failure.message = redactSecrets(failure.message || String(error));
    throw failure;
  } finally {
    await harness?.close?.().catch(() => {});
    bridge.close();
    if (!persist) await rm(home, { recursive: true, force: true }).catch(() => {});
  }
}
