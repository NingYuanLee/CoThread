import { createHash } from "node:crypto";
import { AUTO_COMPACT_RATIO, CONTEXT_LIMITS } from "../shared/context.js";
import { MODEL_REASONING_EFFORTS } from "../shared/model-settings.js";

const MODEL_SCOPES = Object.freeze({
  knowledge: "KNOWLEDGE_MODEL",
  coordinator: "COORDINATOR_MODEL",
  executor: "EXECUTOR_MODEL",
});
const BASELINE_MODEL = "MODEL";
const REASONING_EFFORTS = new Set(MODEL_REASONING_EFFORTS);
const STORED_INCOMPLETE = "数据库模型配置不完整，已停止回退到环境变量";

/** Per-attempt cap. A hung provider must fail the probe instead of replacing config. */
export const MODEL_PROBE_ATTEMPT_MS = 12_000;
/** Budget for one route's three probes (normal, stream, 老翁 structured output). */
export const MODEL_PROBE_BUDGET_MS = 36_000;

let activeSnapshot = null;
let activeFailure = null;
let activeFailureMeta = null;
// Running harnesses can retain a prior key after activation. Keep those keys in
// the process-local redactor so late provider errors never expose an old key.
const activatedModelSecrets = new Set();

export function installPlatformModelSettings(snapshot) {
  for (const key of [snapshot?.default?.apiKey, snapshot?.knowledge?.apiKey])
    if (key) activatedModelSecrets.add(key);
  activeFailure = null;
  activeFailureMeta = null;
  activeSnapshot = snapshot || null;
}

export function failPlatformModelSettings(error, meta = null) {
  activeSnapshot = null;
  activeFailure = error;
  activeFailureMeta = meta;
}

export function clearPlatformModelSettings() {
  activeSnapshot = null;
  activeFailure = null;
  activeFailureMeta = null;
}

export function platformModelSettingsState() {
  return {
    snapshot: activeSnapshot,
    failure: activeFailure,
    failureMeta: activeFailureMeta,
  };
}

export function modelContextWindow(scope = "coordinator") {
  return CONTEXT_LIMITS[scope] || CONTEXT_LIMITS.coordinator;
}

export function modelOutputLimit(config) {
  return /deepseek/iu.test(config?.model || "") ? 384 * 1024 : 128 * 1024;
}

/**
 * DSH 0.2 reserves the request output cap inside the model's context window and
 * subtracts its compaction headroom (`headroomTokens` in dsh-layer/*-patch.yml).
 * Keep the advertised cap inside the window so DSH's own pressure threshold
 * survives and still lands on the shared 70% budget.
 */
export const DSH_COMPACTION_HEADROOM_TOKENS = 8_192;

export function dshModelMaxTokens(config, scope = "executor") {
  const window = modelContextWindow(scope);
  const ceiling = window - DSH_COMPACTION_HEADROOM_TOKENS - Math.floor(window * AUTO_COMPACT_RATIO);
  return Math.max(1_024, Math.min(modelOutputLimit(config), ceiling));
}

function reasoningOptions(config) {
  return {
    reasoning: { effort: config.reasoningEffort === "off" ? "none" : config.reasoningEffort },
  };
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

export function modelVariablePrefix(scope, env = process.env) {
  const scopedPrefix = MODEL_SCOPES[scope];
  if (!scopedPrefix) throw new Error(`Unknown model scope: ${scope}`);
  const present = (prefix) =>
    Boolean(
      env[prefix]?.trim() || env[`${prefix}_BASE_URL`]?.trim() || env[`${prefix}_API_KEY`]?.trim(),
    );
  if (scope === "knowledge") return present(scopedPrefix) ? scopedPrefix : BASELINE_MODEL;
  return present(BASELINE_MODEL) ? BASELINE_MODEL : scopedPrefix;
}

function parseModelField(prefix, configuredModel, scope) {
  const separator = configuredModel.lastIndexOf("@");
  const hasEffort = separator > 0;
  const model = (hasEffort ? configuredModel.slice(0, separator) : configuredModel).trim();
  const reasoningEffort = (
    hasEffort
      ? configuredModel.slice(separator + 1)
      : prefix === BASELINE_MODEL || scope === "coordinator"
        ? "low"
        : "medium"
  )
    .trim()
    .toLowerCase();
  if (!model) throw new Error(`${prefix} must include a model name`);
  if (!REASONING_EFFORTS.has(reasoningEffort))
    throw new Error(
      `${prefix} reasoning effort must be one of: ${MODEL_REASONING_EFFORTS.join(", ")}`,
    );
  return { model, reasoningEffort };
}

export function modelRouteIdentity(config) {
  const keyHash = createHash("sha256")
    .update(String(config?.apiKey || ""))
    .digest("hex")
    .slice(0, 16);
  return [config?.baseUrl || "", config?.model || "", config?.reasoningEffort || "", keyHash].join(
    "\n",
  );
}

function finishRoute(fields, meta) {
  const config = {
    baseUrl: fields.baseUrl,
    responsesUrl: `${fields.baseUrl}/responses`,
    apiKey: fields.apiKey,
    model: fields.model,
    reasoningEffort: fields.reasoningEffort,
    source: meta.source,
    sourceDetail: meta.sourceDetail,
    legacyFallback: !!meta.legacyFallback,
    inherited: !!meta.inherited,
    settingsVersion: meta.settingsVersion ?? null,
  };
  config.routeIdentity = modelRouteIdentity(config);
  return Object.freeze(config);
}

function storedRoute(fields, meta) {
  if (!fields?.baseUrl || !fields?.apiKey || !fields?.model || !fields?.reasoningEffort)
    throw new Error(STORED_INCOMPLETE);
  if (!REASONING_EFFORTS.has(fields.reasoningEffort)) throw new Error(STORED_INCOMPLETE);
  return finishRoute(fields, meta);
}

function resolveStoredModel(snapshot, scope) {
  if (!snapshot?.default) throw new Error(STORED_INCOMPLETE);
  if (scope === "knowledge" && snapshot.knowledge) {
    return storedRoute(snapshot.knowledge, {
      source: "database",
      sourceDetail: "knowledge",
      settingsVersion: snapshot.version,
    });
  }
  const inherited = scope === "knowledge";
  return storedRoute(snapshot.default, {
    source: "database",
    sourceDetail: "default",
    inherited,
    settingsVersion: snapshot.version,
  });
}

export function modelConfigFromEnvironment(scope = "coordinator", env = process.env) {
  const prefix = modelVariablePrefix(scope, env);
  const key = (field) => `${prefix}_${field}`;
  const missing = [key("BASE_URL"), key("API_KEY"), prefix].filter((name) => !env[name]?.trim());
  if (missing.length) throw new Error(`Model is not configured: missing ${missing.join(", ")}`);
  const baseUrl = normalizeModelBaseUrl(env[key("BASE_URL")]);
  const parsed = parseModelField(prefix, env[prefix].trim(), scope);
  return finishRoute(
    { baseUrl, apiKey: env[key("API_KEY")].trim(), ...parsed },
    {
      source: "environment",
      sourceDetail: prefix,
      legacyFallback: prefix === "COORDINATOR_MODEL" || prefix === "EXECUTOR_MODEL",
      inherited: scope === "knowledge" && prefix === BASELINE_MODEL,
    },
  );
}

export function modelConfig(scope = "coordinator", env = process.env) {
  if (activeFailure) throw activeFailure;
  if (activeSnapshot) return resolveStoredModel(activeSnapshot, scope);
  return modelConfigFromEnvironment(scope, env);
}

/** True when a parked harness still matches the route a new task must use. */
export function modelRouteIsCurrent(captured, scope = "coordinator") {
  if (!captured?.routeIdentity) return true;
  try {
    return modelConfig(scope).routeIdentity === captured.routeIdentity;
  } catch {
    return false;
  }
}

/**
 * A running task and its children keep the route captured at start.
 * An idle harness is replaced so the next task reads the activated settings.
 */
export function coordinatorReuseDecision(capture, { activeChildren = false } = {}) {
  if (capture?.routeIdentity && !modelRouteIsCurrent(capture, "coordinator"))
    return activeChildren ? "wait" : "replace";
  return "keep";
}

/** Child work of a stale running coordinator stays on that capture. 老翁 does not. */
export function modelForLaunch(scope = "coordinator", parentCapture = null) {
  if (
    parentCapture?.routeIdentity &&
    scope !== "knowledge" &&
    !modelRouteIsCurrent(parentCapture, "coordinator")
  )
    return parentCapture;
  return modelConfig(scope);
}

/** Identity stored with usage. Never includes the API key. */
export function capturedModelUsage(config, extra = {}) {
  if (!config?.model) return {};
  return {
    model: config.model,
    reasoningEffort: extra.reasoningEffort || config.reasoningEffort || "",
    settingsVersion: config.settingsVersion ?? null,
  };
}

function publicRoute(config, error = null) {
  if (!config && error) return { error, apiKeyConfigured: false };
  return {
    source: config.source,
    sourceDetail: config.sourceDetail,
    legacyFallback: config.legacyFallback,
    inherited: config.inherited,
    baseUrl: config.baseUrl,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    apiKeyConfigured: !!config.apiKey,
    settingsVersion: config.settingsVersion,
    error,
  };
}

function inspectScope(scope, env) {
  try {
    return publicRoute(modelConfig(scope, env));
  } catch (error) {
    let sourceDetail = null;
    let legacyFallback = false;
    let inherited = false;
    try {
      sourceDetail = activeSnapshot || activeFailure ? null : modelVariablePrefix(scope, env);
      legacyFallback = sourceDetail === "COORDINATOR_MODEL" || sourceDetail === "EXECUTOR_MODEL";
      inherited = scope === "knowledge" && sourceDetail === BASELINE_MODEL;
    } catch {
      sourceDetail = null;
    }
    return {
      source: activeSnapshot || activeFailure ? "database" : "environment",
      sourceDetail,
      legacyFallback,
      inherited,
      baseUrl: "",
      model: "",
      reasoningEffort: "",
      apiKeyConfigured: false,
      settingsVersion: activeSnapshot?.version ?? activeFailureMeta?.version ?? null,
      error: error.message,
    };
  }
}

export function presentPlatformModelSettings(env = process.env) {
  if (activeFailure) {
    return {
      storage: "database",
      configured: false,
      unreadable: true,
      version: activeFailureMeta?.version ?? null,
      updatedAt: activeFailureMeta?.updatedAt ?? null,
      updatedBy: activeFailureMeta?.updatedBy ?? null,
      error: activeFailure.message,
      usingEnvironment: false,
      default: null,
      knowledge: null,
      executor: null,
      sourcesDiffer: false,
      knowledgeKeyRetained: false,
    };
  }
  const knowledge = inspectScope("knowledge", env);
  const coordinator = inspectScope("coordinator", env);
  const executor = inspectScope("executor", env);
  const sameExecutor =
    executor.sourceDetail === coordinator.sourceDetail &&
    executor.model === coordinator.model &&
    executor.baseUrl === coordinator.baseUrl &&
    executor.reasoningEffort === coordinator.reasoningEffort &&
    executor.legacyFallback === coordinator.legacyFallback &&
    !executor.error === !coordinator.error;
  const sourcesDiffer =
    !sameExecutor ||
    coordinator.legacyFallback ||
    knowledge.legacyFallback ||
    executor.legacyFallback ||
    (!knowledge.inherited && knowledge.sourceDetail !== coordinator.sourceDetail);
  return {
    storage: activeSnapshot ? "database" : "environment",
    configured: !!activeSnapshot,
    unreadable: false,
    version: activeSnapshot?.version ?? 0,
    updatedAt: activeSnapshot?.updatedAt ?? null,
    updatedBy: activeSnapshot?.updatedBy ?? null,
    error: null,
    usingEnvironment: !activeSnapshot,
    default: coordinator,
    knowledge,
    executor: sameExecutor ? null : executor,
    sourcesDiffer,
    knowledgeKeyRetained: !!activeSnapshot?.knowledgeKeyRetained,
  };
}

function probeSignal(budget) {
  if (budget?.aborted) {
    const error = new Error("模型校验超时");
    error.code = "MODEL_PROBE_TIMEOUT";
    throw error;
  }
  return AbortSignal.any([budget, AbortSignal.timeout(MODEL_PROBE_ATTEMPT_MS)]);
}

function probeFailure(stage, error, secrets) {
  if (
    error?.code === "MODEL_PROBE_TIMEOUT" ||
    error?.name === "AbortError" ||
    error?.name === "TimeoutError"
  ) {
    const timeout = new Error(`模型校验超时（${stage}）`);
    timeout.code = "MODEL_PROBE_TIMEOUT";
    throw timeout;
  }
  const message = redactSecrets(error?.message || error, process.env, secrets);
  throw new Error(`模型校验失败（${stage}）：${message}`.slice(0, 400));
}

async function readBody(response, signal, secrets) {
  if (signal.aborted) probeFailure("读取响应", { code: "MODEL_PROBE_TIMEOUT" }, secrets);
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `模型返回的不是 JSON（${response.headers?.get?.("content-type") || "未知类型"}）`,
    );
  }
  if (data?.status === "incomplete") {
    throw new Error(`Model response incomplete (${data.incomplete_details?.reason || "unknown"})`);
  }
  return data;
}

function responseRequest(config, body, signal) {
  return {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      store: false,
      max_output_tokens: 1024,
      ...reasoningOptions(config),
      ...body,
    }),
  };
}

async function probeNormal(config, request, budget) {
  const stage = "普通 Responses";
  const signal = probeSignal(budget);
  let response;
  try {
    response = await request(
      config.responsesUrl,
      responseRequest(
        config,
        { stream: false, input: [{ role: "user", content: "Reply with ok" }] },
        signal,
      ),
    );
  } catch (error) {
    probeFailure(stage, error, [config.apiKey]);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    probeFailure(
      stage,
      new Error(
        `HTTP ${response.status} ${redactSecrets(text, process.env, [config.apiKey]).slice(0, 160)}`,
      ),
      [config.apiKey],
    );
  }
  let data;
  try {
    data = await readBody(response, signal, [config.apiKey]);
  } catch (error) {
    probeFailure(stage, error, [config.apiKey]);
  }
  if (!responseText(data).trim()) throw new Error("模型校验失败（普通 Responses）：没有返回文本");
}

async function probeStream(config, request, budget) {
  const stage = "流式 Responses";
  const signal = probeSignal(budget);
  let response;
  try {
    response = await request(
      config.responsesUrl,
      responseRequest(
        config,
        { stream: true, input: [{ role: "user", content: "Reply with ok" }] },
        signal,
      ),
    );
  } catch (error) {
    probeFailure(stage, error, [config.apiKey]);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    probeFailure(
      stage,
      new Error(
        `HTTP ${response.status} ${redactSecrets(text, process.env, [config.apiKey]).slice(0, 160)}`,
      ),
      [config.apiKey],
    );
  }
  const contentType = response.headers?.get?.("content-type") || "";
  if (!contentType.includes("text/event-stream") || !response.body?.getReader)
    throw new Error("模型校验失败（流式 Responses）：未返回 text/event-stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let completed;
  const consume = (line) => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    const event = JSON.parse(payload);
    if (event.type === "response.output_text.delta" && typeof event.delta === "string")
      text += event.delta;
    else if (event.type === "response.completed") completed = event.response;
    else if (event.type === "response.incomplete")
      throw new Error(
        `Model response incomplete (${event.response?.incomplete_details?.reason || "unknown"})`,
      );
    else if (event.type === "error")
      throw new Error(`Model stream failed (${event.message || event.code || "unknown"})`);
  };
  try {
    while (true) {
      if (signal.aborted) probeFailure(stage, { code: "MODEL_PROBE_TIMEOUT" }, [config.apiKey]);
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split(/\r?\n/u);
      buffer = done ? "" : lines.pop() || "";
      for (const line of lines) consume(line);
      if (done) break;
    }
    if (buffer.trim()) consume(buffer.trim());
  } catch (error) {
    probeFailure(stage, error, [config.apiKey]);
  }
  if (!completed || completed.status !== "completed")
    throw new Error("模型校验失败（流式 Responses）：未收到完整完成事件");
  const finalText = responseText(completed);
  if (!text && finalText) text = finalText;
  if (!text.trim()) throw new Error("模型校验失败（流式 Responses）：没有返回文本");
}

const L1_PROBE_SCHEMA = {
  type: "object",
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
  additionalProperties: false,
};

async function probeStructured(config, request, budget) {
  const stage = "老翁 结构化输出";
  const signal = probeSignal(budget);
  let response;
  try {
    response = await request(
      config.responsesUrl,
      responseRequest(
        config,
        {
          stream: false,
          input: [
            {
              role: "user",
              content: 'Return a JSON object {"ok":true} and nothing else.',
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "l1_probe",
              strict: true,
              schema: L1_PROBE_SCHEMA,
            },
          },
        },
        signal,
      ),
    );
  } catch (error) {
    probeFailure(stage, error, [config.apiKey]);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    probeFailure(
      stage,
      new Error(
        `HTTP ${response.status} ${redactSecrets(text, process.env, [config.apiKey]).slice(0, 160)}`,
      ),
      [config.apiKey],
    );
  }
  let data;
  try {
    data = await readBody(response, signal, [config.apiKey]);
  } catch (error) {
    probeFailure(stage, error, [config.apiKey]);
  }
  let parsed;
  try {
    parsed = JSON.parse(responseText(data));
  } catch {
    throw new Error("模型校验失败（老翁 结构化输出）：返回内容不是 JSON");
  }
  if (!parsed || parsed.ok !== true || Object.keys(parsed).length !== 1)
    throw new Error("模型校验失败（老翁 结构化输出）：返回的 JSON 不是 {ok:true}");
}

/**
 * Prove a candidate route can serve the calls CoThread actually makes.
 * Failure leaves the caller to keep the previous configuration.
 */
export async function probeModelCompatibility(config, request = fetch, options = {}) {
  const budget = options.signal ?? AbortSignal.timeout(options.budgetMs || MODEL_PROBE_BUDGET_MS);
  await probeNormal(config, request, budget);
  await probeStream(config, request, budget);
  await probeStructured(config, request, budget);
}

export async function modelResponse(
  {
    messages,
    maxTokens,
    scope = "coordinator",
    reasoningEffort,
    signal = AbortSignal.timeout(60000),
    config,
  },
  request = fetch,
) {
  const resolved = config || modelConfig(scope);
  const effort = reasoningEffort || resolved.reasoningEffort;
  const response = await request(resolved.responsesUrl, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resolved.apiKey}`,
    },
    body: JSON.stringify({
      model: resolved.model,
      stream: false,
      store: false,
      max_output_tokens: maxTokens,
      input: messages,
      ...reasoningOptions({ reasoningEffort: effort }),
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
  {
    messages,
    maxTokens,
    scope = "coordinator",
    signal = AbortSignal.timeout(60000),
    onText = () => {},
    config,
  },
  request = fetch,
) {
  const resolved = config || modelConfig(scope);
  const response = await request(resolved.responsesUrl, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${resolved.apiKey}` },
    body: JSON.stringify({
      model: resolved.model,
      stream: true,
      store: false,
      max_output_tokens: maxTokens,
      input: messages,
      ...reasoningOptions(resolved),
    }),
  });
  if (!response.ok) throw new Error(`Model HTTP ${response.status}`);
  const contentType = response.headers?.get?.("content-type") || "";
  if (!contentType.includes("text/event-stream") || !response.body?.getReader) {
    const data = JSON.parse(await response.text());
    if (data?.status === "incomplete")
      throw new Error(
        `Model response incomplete (${data.incomplete_details?.reason || "unknown"})`,
      );
    const text = responseText(data);
    if (text) onText(text);
    return { data, text };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "",
    text = "",
    completed;
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
      throw new Error(
        `Model response incomplete (${event.response?.incomplete_details?.reason || "unknown"})`,
      );
    else if (event.type === "error")
      throw new Error(`Model stream failed (${event.message || event.code || "unknown"})`);
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
  if (!text && finalText) {
    text = finalText;
    onText(finalText);
  }
  return { data: completed || {}, text };
}

export function responseText(response) {
  if (typeof response?.output_text === "string") return response.output_text;
  return (response?.output || [])
    .flatMap((item) => (item?.type === "message" ? item.content || [] : []))
    .filter((content) => content?.type === "output_text" && typeof content.text === "string")
    .map((content) => content.text)
    .join("");
}

export function modelUsage(usage) {
  return usage
    ? {
        inputTokens: Math.max(
          0,
          (usage.input_tokens || 0) - (usage.input_tokens_details?.cached_tokens || 0),
        ),
        cacheReadTokens: usage.input_tokens_details?.cached_tokens || 0,
        cacheWriteTokens: usage.input_tokens_details?.cache_write_tokens || 0,
        outputTokens: usage.output_tokens || 0,
        reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? null,
        totalTokens: usage.total_tokens || (usage.input_tokens || 0) + (usage.output_tokens || 0),
        calls: 1,
      }
    : null;
}

export function dshModelPatch(config = modelConfig("executor"), scope = "executor") {
  const configuredEffort = config.reasoningEffort || "medium";
  const reasoning = ["off", "none"].includes(configuredEffort)
    ? "off"
    : configuredEffort === "ultra"
      ? "max"
      : configuredEffort;
  const maxReasoning = configuredEffort === "ultra" ? "ultra" : "max";
  const window = modelContextWindow(scope);
  // 老翁 is a background maintenance turn. The provider default waits 5 minutes
  // with no tokens and retries 5 times, which pins the UI on 整理中 when
  // inference is busy or silent. Fail that route within about 90 seconds.
  const knowledgeDeadline =
    scope === "knowledge"
      ? `\n            streamIdleTimeoutMs: 90000\n            retryPolicy:\n              mode: normal\n              maxRetries: 1\n              backoff:\n                initialDelayMs: 1000\n                maxDelayMs: 5000`
      : "";
  return `- id: llm-deepseek\n  disabled: true\n- insert:\n    - id: llm-cothread-compatible\n      name: '@deepseek-ai/dsh-llm-pi-ai'\n      config:\n        providers:\n          cothread-compatible:\n            displayName: CoThread\n            apiKeyEnv: MODEL_API_KEY\n            api: openai-responses\n            baseURL: ${JSON.stringify(config.baseUrl)}\n            reasoning: ${reasoning}${knowledgeDeadline}\n            models:\n              - id: ${JSON.stringify(config.model)}\n                name: ${JSON.stringify(config.model)}\n                contextWindow: ${window}\n                maxTokens: ${dshModelMaxTokens(config, scope)}\n                reasoningEfforts:\n                  off: none\n                  minimal: minimal\n                  low: low\n                  medium: medium\n                  high: high\n                  xhigh: xhigh\n                  max: ${maxReasoning}\n`;
}

export function redactSecrets(value, env = process.env, extras = []) {
  let result = String(value || "");
  const secrets = [...activatedModelSecrets, ...extras];
  for (const key of [
    "KNOWLEDGE_MODEL_API_KEY",
    "COORDINATOR_MODEL_API_KEY",
    "EXECUTOR_MODEL_API_KEY",
    "MODEL_API_KEY",
  ])
    if (env?.[key]) secrets.push(env[key]);
  if (activeSnapshot?.default?.apiKey) secrets.push(activeSnapshot.default.apiKey);
  if (activeSnapshot?.knowledge?.apiKey) secrets.push(activeSnapshot.knowledge.apiKey);
  for (const secret of secrets) {
    if (!secret) continue;
    result = result.split(String(secret)).join("[REDACTED]");
  }
  return result;
}
