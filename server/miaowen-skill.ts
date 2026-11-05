// 腾讯广告妙问走共序进程内的 HTTP，不另起 Node，也不读 ~/.MIAOWEN_ACCESS_TOKEN。
// 协议对齐官方 tencent-ads-assistant 1.3.0 的 chat.js。服务端返回 140209 时表示这份版本过期。
const CHAT_URL =
  process.env.MIAOWEN_CHAT_API_URL ||
  "https://ad.qq.com/ai/gw/ai_customer_service/v1/open_api/stream_chat";

export const MIAOWEN_SKILL_NAME = "tencent-ads-assistant";
export const MIAOWEN_SKILL_VERSION = "1.3.0";
export const MIAOWEN_TIMEOUT_MS = 10 * 60 * 1000;
export const MIAOWEN_BRIDGE_TIMEOUT_MS = MIAOWEN_TIMEOUT_MS + 60 * 1000;

const VERSION_EXPIRED_CODE = 140209;
const RESULT_LIMIT = 400_000;
const ATTACHMENT_TYPES = new Set(["IMAGE", "VIDEO", "AUDIO"]);
const MISSING =
  "[TOKEN_NOT_FOUND] 当前登录账号还没有配置妙问 API KEY。请到个人设置的「环境变量」填写，不要把 KEY 发到对话里。";

/** 一个预审附件。 */
export type MiaowenMaterial = { content_type: string; url: string };

/** 一次妙问对话的返回值。 */
export type MiaowenChatResult = { text: string; materials: MiaowenMaterial[] };

/** 调用方可以注入的依赖与回调。 */
export type MiaowenChatOptions = {
  onProgress?: ((line: string) => void) | null;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

/** 妙问返回的 JSON 负载。 */
type JsonObject = Record<string, unknown>;

/** 一次对话累积下来的状态。 */
type MiaowenChatState = {
  markdownContent: string;
  taskInfo: string;
  hasError: boolean;
  errorMessage: string;
  versionExpired: boolean;
  versionMessage: string;
  totalSteps: number;
  completedRounds: Set<number>;
  printedInstructs: Set<string>;
  roundResults: Record<string, string>;
  mdMilestone: number;
  loadingShown: boolean;
  streamEnded: boolean;
  thinking: boolean;
  answering: boolean;
  sessionId: string;
  messageId: string;
  progress: string[];
  lastProgressAt: number;
  streamInterrupted: boolean;
};

/** 只把普通对象当作负载；数组与 null 一律视为「没有对象」。 */
function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

export function miaowenSkillLabel(): string {
  return `妙问技能 ${MIAOWEN_SKILL_NAME} ${MIAOWEN_SKILL_VERSION} 已装入本进程，随共序启动。`;
}

export function scrubMiaowenSecret(value: unknown): string {
  return String(value || "").replace(/sk-mw-[A-Za-z0-9_-]+/g, "sk-mw-***");
}

export async function runMiaowenChat(
  args: { query?: unknown; attachments?: unknown },
  token: unknown,
  options: MiaowenChatOptions = {},
): Promise<MiaowenChatResult> {
  const queryText = String(args?.query || "").trim();
  if (!queryText) throw new Error("请提供要问妙问的问题");
  if (queryText.length > 8000) throw new Error("问题过长");
  const attachments = normalizeAttachments(args?.attachments);
  if (attachments.error) return { text: attachments.error, materials: [] };
  const secret = String(token || "").trim();
  if (!secret) return { text: MISSING, materials: [] };
  if (secret.length > 200 || /[\s]/.test(secret)) {
    return {
      text: "[TOKEN_EMPTY] 当前账号保存的妙问 API KEY 无效。请到个人设置的「环境变量」重新填写，不要把 KEY 发到对话里。",
      materials: [],
    };
  }

  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  const state = createState();
  const note = (line: string): void => {
    state.progress.push(line);
    if (state.progress.length > 40) state.progress.shift();
    state.lastProgressAt = Date.now();
    onProgress?.(line);
  };
  note("正在调用妙问。简单问题大约几十秒，复杂分析可能要几分钟。");
  const pulse = onProgress
    ? setInterval(() => {
        if (Date.now() - state.lastProgressAt < 15000) return;
        state.lastProgressAt = Date.now();
        onProgress("仍在等待妙问…");
      }, 15000)
    : null;

  const fetchImpl = options.fetch || globalThis.fetch;
  const requestBody: { query: string; attachments?: MiaowenMaterial[] } = { query: queryText };
  if (attachments.value.length) requestBody.attachments = attachments.value;
  try {
    let response: Response;
    try {
      response = await fetchImpl(CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "skill-name": MIAOWEN_SKILL_NAME,
          "skill-version": MIAOWEN_SKILL_VERSION,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(options.timeoutMs || MIAOWEN_TIMEOUT_MS),
      });
    } catch (error) {
      return { text: networkMessage(error), materials: [] };
    }
    if (!response.ok) return { text: await httpFailure(response), materials: [] };
    const type = response.headers?.get?.("content-type") || "";
    if (!type.includes("text/event-stream")) {
      const body = await response.text();
      const parsed = safeJsonParse(body);
      if (parsed?.code === VERSION_EXPIRED_CODE) {
        return { text: versionExpiredText(parsed.message), materials: [] };
      }
      if (body.includes("data:")) {
        for (const line of body.split("\n"))
          consumeLine(line, (json) => handleEvent(json, state, note));
        return { text: finish(state), materials: [] };
      }
      return {
        text: parsed
          ? `[API_ERROR] ${scrubMiaowenSecret(JSON.stringify(parsed)).slice(0, 2000)}`
          : "[API_ERROR] 妙问没有返回流式结果。",
        materials: [],
      };
    }
    try {
      await readSse(response, (json) => handleEvent(json, state, note));
    } catch (error) {
      if (!state.markdownContent && !buildFallback(state))
        return { text: networkMessage(error), materials: [] };
      state.streamInterrupted = true;
    }
    return { text: finish(state), materials: [] };
  } finally {
    if (pulse) clearInterval(pulse);
  }
}

function normalizeAttachments(value: unknown): {
  value: MiaowenMaterial[];
  error?: string;
} {
  if (value == null) return { value: [] };
  if (!Array.isArray(value)) return { error: "[ERROR] 附件必须是数组。", value: [] };
  if (value.length > 8) return { error: "[ERROR] 一次最多预审 8 个附件。", value: [] };
  const normalized: MiaowenMaterial[] = [];
  for (const raw of value) {
    const item = raw as { url?: unknown; content_type?: unknown } | null | undefined;
    const urlText = String(item?.url || "").trim();
    let url: URL;
    try {
      url = new URL(urlText);
    } catch {
      return {
        error: "[ERROR] 附件地址无效。共序不能读取本机文件，只接受 https 素材地址。",
        value: [],
      };
    }
    if (url.protocol !== "https:") {
      return { error: "[ERROR] 附件只接受 https 地址，不能读取本机文件。", value: [] };
    }
    const contentType = String(item?.content_type || "IMAGE")
      .trim()
      .toUpperCase();
    if (!ATTACHMENT_TYPES.has(contentType)) {
      return { error: "[ERROR] 附件类型只支持 IMAGE、VIDEO、AUDIO。", value: [] };
    }
    normalized.push({ content_type: contentType, url: url.href });
  }
  return { value: normalized };
}

function createState(): MiaowenChatState {
  return {
    markdownContent: "",
    taskInfo: "",
    hasError: false,
    errorMessage: "",
    versionExpired: false,
    versionMessage: "",
    totalSteps: 0,
    completedRounds: new Set(),
    printedInstructs: new Set(),
    roundResults: {},
    mdMilestone: 0,
    loadingShown: false,
    streamEnded: false,
    thinking: false,
    answering: false,
    sessionId: "",
    messageId: "",
    progress: [],
    lastProgressAt: Date.now(),
    streamInterrupted: false,
  };
}

function safeJsonParse(text: string): JsonObject | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return asObject(parsed);
  } catch {
    return null;
  }
}

function pickId(obj: unknown, key: string): string {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return "";
  const value = (obj as JsonObject)[key];
  if (typeof value !== "string" && typeof value !== "number") return "";
  const text = String(value).trim();
  return text && text !== "0" ? text : "";
}

function collectFeedbackIds(
  parsed: JsonObject,
  state: MiaowenChatState,
  note: (line: string) => void,
): void {
  for (const source of [parsed, parsed.data, parsed.agent_info]) {
    const sessionId = pickId(source, "session_id");
    if (sessionId && !state.sessionId) {
      state.sessionId = sessionId;
      note(`会话 ID：${sessionId}`);
    }
    const messageId = pickId(source, "answer_message_id");
    if (messageId && messageId !== state.messageId) state.messageId = messageId;
  }
}

function handleEvent(
  jsonData: string,
  state: MiaowenChatState,
  note: (line: string) => void,
): void {
  const parsed = safeJsonParse(jsonData);
  if (!parsed) return;
  collectFeedbackIds(parsed, state, note);
  if (parsed.code === VERSION_EXPIRED_CODE) {
    state.versionExpired = true;
    state.versionMessage = String(parsed.message || "");
  }
  const data = parsed.data;
  const eventType = parsed.event_type;
  if (eventType === "STREAM_BEGIN") {
    note("已连接妙问，正在分析问题。");
    return;
  }
  if (eventType === "LOADING") {
    if (!state.loadingShown) {
      state.loadingShown = true;
      note("正在加载分析。");
    }
    return;
  }
  if (eventType === "THINK") {
    handleThink(data, parsed.think_seconds, state, note);
    return;
  }
  if (eventType === "MARKDOWN_DATA" && typeof data === "string" && data) {
    state.markdownContent += data;
    if (!state.answering) {
      state.answering = true;
      note("正在生成回答。");
    } else if (state.markdownContent.length - state.mdMilestone >= 800) {
      state.mdMilestone = state.markdownContent.length;
      note(`回答生成中，已约 ${state.mdMilestone} 字。`);
    }
    return;
  }
  const obj = asObject(data);
  if (eventType === "MARKDOWN_OF_HTML" && obj && typeof obj.content === "string") {
    state.markdownContent += obj.content;
    return;
  }
  if (eventType === "HTML_DATA" && obj) {
    const pieces = [
      obj.tip,
      obj.report_preface,
      obj.report_title ? `### ${obj.report_title}` : "",
      obj.reply_content,
      obj.report_content,
      obj.report_content_stream,
      obj.html_content,
      obj.html_url ? `\n[在线查看完整内容](${obj.html_url})` : "",
    ].filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
    if (pieces.length) {
      state.markdownContent += (state.markdownContent ? "\n\n" : "") + pieces.join("\n\n");
    }
    const template = parsed.html_template || obj.html_template || "";
    if (template) note(`收到结构化卡片：${String(template)}`);
    return;
  }
  if (eventType === "SEARCH" && Array.isArray(data) && data.length) {
    const refs = (data as unknown[])
      .map((raw) => {
        const item = asObject(raw);
        return item?.title
          ? `- [${item.title}](${item.url || ""})${item.site_name ? ` _(${item.site_name})_` : ""}`
          : "";
      })
      .filter(Boolean)
      .join("\n");
    if (refs) {
      state.markdownContent += `${state.markdownContent ? "\n\n" : ""}**参考来源：**\n${refs}`;
      note("已检索到相关资料。");
    }
    return;
  }
  if (eventType === "GUI") {
    const answer = obj ? (obj.answer_msg as string) || "" : typeof data === "string" ? data : "";
    if (answer) state.markdownContent += (state.markdownContent ? "\n\n" : "") + answer;
    note("妙问需要补充信息后才能继续。");
    return;
  }
  if (eventType === "SECURITY_TAG" && obj && obj.is_need_replace_content) {
    state.markdownContent = (obj.content_replace as string) || state.markdownContent;
    note("内容安全校验已触发。");
    return;
  }
  if (eventType === "STREAM_END") {
    if (parsed.agent_info) state.taskInfo = JSON.stringify(parsed.agent_info);
    if (!state.streamEnded) {
      state.streamEnded = true;
      note("妙问已结束本次回答。");
    }
    return;
  }
  if (eventType === "ERROR" || eventType === "ERROR_TIP") {
    state.hasError = true;
    let message = "未知错误";
    let code: unknown;
    if (obj) {
      message = (obj.message as string) || (obj.tip as string) || message;
      code = obj.code;
    } else if (typeof data === "string" && data) message = data;
    if (code === VERSION_EXPIRED_CODE || parsed.code === VERSION_EXPIRED_CODE) {
      state.versionExpired = true;
      state.versionMessage = message;
    }
    state.errorMessage = message;
    note(`妙问返回提示：${scrubMiaowenSecret(message)}`);
  }
}

function handleThink(
  data: unknown,
  thinkSeconds: unknown,
  state: MiaowenChatState,
  note: (line: string) => void,
): void {
  const obj = asObject(data);
  if (obj) {
    const kind = obj.data_type;
    if (kind === "QUESTION_EVALUATION") {
      note(obj.question ? `问题理解：${obj.question}` : "已完成问题理解。");
    } else if (kind === "STEP_INSTRUCT") {
      const round = obj.round as number | undefined;
      const instruct = (obj.instruct as string) || "";
      if (round !== undefined) state.totalSteps = Math.max(state.totalSteps, Number(round) || 0);
      const key = `${round}::${instruct}`;
      if (state.printedInstructs.has(key)) return;
      state.printedInstructs.add(key);
      note(instruct ? `步骤 ${round}：${instruct}` : `正在执行分析步骤 ${round}。`);
    } else if (kind === "STEP_RESULT") {
      const round = obj.round as number | undefined;
      const result = String(obj.result || "").trim();
      if (result && round !== undefined) {
        const previous = state.roundResults[String(round)] || "";
        if (result.length >= previous.length) state.roundResults[String(round)] = result;
      }
      const first = round === undefined || !state.completedRounds.has(round);
      if (round !== undefined) state.completedRounds.add(round);
      if (!first) return;
      const tools = Array.isArray(obj.tools) ? (obj.tools as unknown[]) : [];
      const toolNames = [
        ...new Set(
          tools
            .map((raw) => asObject(raw)?.tool_name)
            .filter((name) => typeof name === "string" && name),
        ),
      ].join("、");
      note(
        round === undefined
          ? "一个分析步骤已完成。"
          : toolNames
            ? `步骤 ${round} 已完成（${toolNames}）。`
            : `步骤 ${round} 已完成。`,
      );
    } else if (kind === "SUMMARY") note("分析步骤已完成，正在整合回答。");
    if (thinkSeconds) note(`已用时 ${String(thinkSeconds)} 秒。`);
    return;
  }
  if (typeof data === "string" && !state.thinking) {
    state.thinking = true;
    note("正在推理。");
  }
}

function buildFallback(state: MiaowenChatState): string {
  const rounds = Object.keys(state.roundResults)
    .map(Number)
    .sort((left, right) => left - right);
  if (!rounds.length) return "";
  const last = String(state.roundResults[String(rounds[rounds.length - 1])] || "").trim();
  if (!last) return "";
  return `> 注意：本次回答在生成最终结论前中断，以下是已完成步骤的阶段性结果，可能不完整。\n\n${last}`;
}

function versionExpiredText(message: unknown): string {
  return scrubMiaowenSecret(
    `[VERSION_EXPIRED] ${message || `共序内置的妙问协议仍是 ${MIAOWEN_SKILL_VERSION}，服务端要求更新。`}\n请稍后再试。这不是钥匙问题，不要重新索取 API KEY。`,
  );
}

function finish(state: MiaowenChatState): string {
  if (state.versionExpired) return versionExpiredText(state.versionMessage);
  let content = state.markdownContent.trim();
  if (!content) content = buildFallback(state);
  else if (state.streamInterrupted) {
    content = `> 注意：连接在回答过程中中断，以下内容可能不完整。\n\n${content}`;
  }
  if (content) return scrubMiaowenSecret(clip(formatResult(state, content)));
  if (state.hasError) {
    return scrubMiaowenSecret(
      `[API_ERROR] ${state.errorMessage || "妙问没有返回完整回答。"}\n若提示钥匙失效，请到个人设置的「环境变量」重新填写，不要把 KEY 发到对话里。`,
    );
  }
  return "[API_ERROR] 妙问没有返回完整回答。可以稍后重试。";
}

function formatResult(state: MiaowenChatState, content: string): string {
  const lines: string[] = [];
  if (state.progress.length)
    lines.push(state.progress.map((line) => `[PROGRESS] ${line}`).join("\n"));
  lines.push("[RESULT]");
  lines.push(content);
  if (state.taskInfo) lines.push(`[TASK_INFO] ${state.taskInfo}`);
  if (state.sessionId || state.messageId) {
    lines.push(
      `[FEEDBACK_IDS] ${JSON.stringify({
        session_id: state.sessionId || "",
        answer_message_id: state.messageId || "",
      })}`,
    );
  }
  return lines.join("\n");
}

function clip(text: string): string {
  if (text.length <= RESULT_LIMIT) return text;
  return text.slice(0, RESULT_LIMIT) + "\n\n[TRUNCATED] 回答过长，共序已截断尾部。";
}

async function readSse(response: Response, onEvent: (json: string) => void): Promise<void> {
  if (!response.body?.getReader) {
    const text = await response.text();
    for (const line of text.split("\n")) consumeLine(line, onEvent);
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) consumeLine(line, onEvent);
  }
  if (buffer.trim()) consumeLine(buffer, onEvent);
}

function consumeLine(line: string, onEvent: (json: string) => void): void {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return;
  const json = trimmed.slice(5).trim();
  if (json && json !== "[DONE]") onEvent(json);
}

async function httpFailure(response: Response): Promise<string> {
  const body = scrubMiaowenSecret(await response.text().catch(() => ""));
  const parsed = safeJsonParse(body);
  if (parsed?.code === VERSION_EXPIRED_CODE) return versionExpiredText(parsed.message);
  if (response.status === 401 || response.status === 403) {
    return "[API_ERROR] 妙问拒绝了当前账号的 API KEY。请到个人设置的「环境变量」重新填写，不要把 KEY 发到对话里。";
  }
  const detail = body.trim().slice(0, 2000);
  return `[API_ERROR] 妙问请求失败（HTTP ${response.status}）。${detail ? `\n${detail}` : "服务端没有返回详情。"}`;
}

function networkMessage(error: unknown): string {
  const failure = (error ?? {}) as {
    name?: string;
    message?: unknown;
    code?: string;
    cause?: { code?: string };
  };
  const name = failure.name || "";
  const code = failure.cause?.code || failure.code || "";
  if (name === "TimeoutError" || name === "AbortError" || code === "ABORT_ERR") {
    return "[NETWORK_ERROR] 妙问超过 10 分钟没有返回，请稍后重试。";
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN")
    return "[NETWORK_ERROR] 无法解析妙问域名，请检查服务器网络。";
  if (code === "ECONNREFUSED" || code === "ECONNRESET")
    return "[NETWORK_ERROR] 连接妙问失败，请稍后重试。";
  return `[NETWORK_ERROR] ${scrubMiaowenSecret(failure.message || "网络异常")}。请稍后重试。`;
}
