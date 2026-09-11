const MODEL_SCOPES = Object.freeze({
  knowledge: "KNOWLEDGE_MODEL",
  coordinator: "COORDINATOR_MODEL",
  executor: "EXECUTOR_MODEL",
});
const REQUIRED_MODEL_FIELDS = ["PROVIDER", "BASE_URL", "API_KEY", "NAME"];
const REASONING_EFFORTS = new Set(["off", "none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);
const MODEL_CONTEXT_WINDOW = 1024 * 1024;

export function modelOutputLimit(config) {
  return /deepseek/iu.test(`${config?.provider || ""} ${config?.model || ""}`)
    ? 384 * 1024
    : 128 * 1024;
}

function reasoningOptions(config) {
  return { reasoning: { effort: config.reasoningEffort === "off" ? "none" : config.reasoningEffort } };
}

export function normalizeModelBaseUrl(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw new Error("MODEL_BASE_URL must be a valid HTTP(S) URL");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new Error("MODEL_BASE_URL must be a valid HTTP(S) URL");
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname
    .replace(/\/+$/u, "")
    .replace(/\/(?:chat\/completions|responses)$/iu, "");
  return url.toString().replace(/\/$/u, "");
}

export function modelConfig(scope = "coordinator", env = process.env) {
  const prefix = MODEL_SCOPES[scope];
  if (!prefix) throw new Error(`Unknown model scope: ${scope}`);
  const key = (field) => `${prefix}_${field}`;
  const missing = REQUIRED_MODEL_FIELDS.map(key).filter((name) => !env[name]?.trim());
  if (missing.length)
    throw new Error(`Model is not configured: missing ${missing.join(", ")}`);
  const baseUrl = normalizeModelBaseUrl(env[key("BASE_URL")]);
  const reasoningEffort = (env[key("REASONING_EFFORT")] || "medium").trim().toLowerCase();
  if (!REASONING_EFFORTS.has(reasoningEffort))
    throw new Error(`${key("REASONING_EFFORT")} must be one of: none, minimal, low, medium, high, xhigh`);
  return {
    scope,
    provider: env[key("PROVIDER")].trim(),
    baseUrl,
    responsesUrl: `${baseUrl}/responses`,
    apiKey: env[key("API_KEY")].trim(),
    model: env[key("NAME")].trim(),
    reasoningEffort,
  };
}

export async function modelResponse(
  { messages, maxTokens, scope = "coordinator", signal = AbortSignal.timeout(60000) },
  request = fetch,
) {
  const config = modelConfig(scope);
  const response = await request(config.responsesUrl, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      store: false,
      max_output_tokens: maxTokens,
      input: messages,
      ...reasoningOptions(config),
    }),
  });
  if (!response.ok) throw new Error(`Model HTTP ${response.status}`);
  const contentType = response.headers?.get?.("content-type") || "unknown content type";
  const body = await response.text();
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`Model returned invalid JSON (${contentType})`);
  }
  if (data?.status === "incomplete") {
    const reason = data.incomplete_details?.reason || "unknown";
    throw new Error(`Model response incomplete (${reason})`);
  }
  return data;
}

export async function modelResponseStream(
  { messages, maxTokens, scope = "coordinator", signal = AbortSignal.timeout(60000), onText = () => {} },
  request = fetch,
) {
  const config = modelConfig(scope);
  const response = await request(config.responsesUrl, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      stream: true,
      store: false,
      max_output_tokens: maxTokens,
      input: messages,
      ...reasoningOptions(config),
    }),
  });
  if (!response.ok) throw new Error(`Model HTTP ${response.status}`);
  const contentType = response.headers?.get?.("content-type") || "";
  if (!contentType.includes("text/event-stream") || !response.body?.getReader) {
    const data = JSON.parse(await response.text());
    if (data?.status === "incomplete")
      throw new Error(`Model response incomplete (${data.incomplete_details?.reason || "unknown"})`);
    const text = responseText(data);
    if (text) onText(text);
    return { data, text };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", text = "", completed;
  const consume = (line) => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    const event = JSON.parse(payload);
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      text += event.delta;
      onText(event.delta);
    } else if (event.type === "response.completed") completed = event.response;
    else if (event.type === "response.incomplete")
      throw new Error(`Model response incomplete (${event.response?.incomplete_details?.reason || "unknown"})`);
    else if (event.type === "error") throw new Error(`Model stream failed (${event.message || event.code || "unknown"})`);
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/u);
    buffer = done ? "" : lines.pop() || "";
    for (const line of lines) consume(line);
    if (done) break;
  }
  if (buffer.trim()) consume(buffer.trim());
  const finalText = responseText(completed);
  if (!text && finalText) { text = finalText; onText(finalText); }
  return { data: completed || {}, text };
}

export function responseText(response) {
  if (typeof response?.output_text === "string") return response.output_text;
  return (response?.output || [])
    .flatMap((item) => item?.type === "message" ? item.content || [] : [])
    .filter((content) => content?.type === "output_text" && typeof content.text === "string")
    .map((content) => content.text)
    .join("");
}

export function modelUsage(usage) {
  return usage ? {
    inputTokens: Math.max(0, (usage.input_tokens || 0) - (usage.input_tokens_details?.cached_tokens || 0)),
    cacheReadTokens: usage.input_tokens_details?.cached_tokens || 0,
    cacheWriteTokens: usage.input_tokens_details?.cache_write_tokens || 0,
    outputTokens: usage.output_tokens || 0,
    reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? null,
    totalTokens: usage.total_tokens || (usage.input_tokens || 0) + (usage.output_tokens || 0),
    calls: 1,
  } : null;
}

export function dshModelPatch(config = modelConfig("executor")) {
  const configuredEffort = config.reasoningEffort || "medium";
  const reasoning = ["off", "none"].includes(configuredEffort)
    ? "off" : configuredEffort === "ultra" ? "max" : configuredEffort;
  const maxReasoning = configuredEffort === "ultra" ? "ultra" : "max";
  return `- id: llm-deepseek\n  disabled: true\n- insert:\n    - id: llm-cothread-compatible\n      name: '@deepseek-ai/dsh-llm-pi-ai'\n      config:\n        providers:\n          cothread-compatible:\n            displayName: ${JSON.stringify(config.provider)}\n            apiKeyEnv: MODEL_API_KEY\n            api: openai-responses\n            baseURL: ${JSON.stringify(config.baseUrl)}\n            reasoning: ${reasoning}\n            models:\n              - id: ${JSON.stringify(config.model)}\n                name: ${JSON.stringify(config.model)}\n                contextWindow: ${MODEL_CONTEXT_WINDOW}\n                maxTokens: ${modelOutputLimit(config)}\n                reasoningEfforts:\n                  off: none\n                  minimal: minimal\n                  low: low\n                  medium: medium\n                  high: high\n                  xhigh: xhigh\n                  max: ${maxReasoning}\n`;
}

export function redactSecrets(value, env = process.env) {
  let result = String(value || "");
  for (const key of ["KNOWLEDGE_MODEL_API_KEY", "COORDINATOR_MODEL_API_KEY", "EXECUTOR_MODEL_API_KEY", "MODEL_API_KEY", "E2B_API_KEY"])
    if (env[key]) result = result.split(env[key]).join("[REDACTED]");
  return result;
}
