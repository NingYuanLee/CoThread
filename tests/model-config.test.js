import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dshModelPatch,
  modelResponse,
  modelResponseStream,
  modelConfig,
  modelOutputLimit,
  normalizeModelBaseUrl,
  redactSecrets,
  responseText,
} from "../server/model-config.js";

const keys = ["COORDINATOR_MODEL_PROVIDER", "COORDINATOR_MODEL_BASE_URL", "COORDINATOR_MODEL_API_KEY", "COORDINATOR_MODEL_NAME", "COORDINATOR_MODEL_REASONING_EFFORT"];

async function withModelEnv(values, run) {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try { return await run(); }
  finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("model URL accepts a root or complete OpenAI endpoint", () => {
  assert.equal(normalizeModelBaseUrl("https://api.openai.com"), "https://api.openai.com");
  assert.equal(normalizeModelBaseUrl("https://api.openai.com/v1/"), "https://api.openai.com/v1");
  assert.equal(normalizeModelBaseUrl("http://localhost:11434/v1/chat/completions"), "http://localhost:11434/v1");
  assert.equal(normalizeModelBaseUrl("http://localhost:11434/v1/responses"), "http://localhost:11434/v1");
  assert.throws(() => normalizeModelBaseUrl("file:///tmp/model"), /HTTP\(S\)/);
});

test("all four model settings are required", () => withModelEnv({
  COORDINATOR_MODEL_PROVIDER: "Example",
  COORDINATOR_MODEL_BASE_URL: "https://example.test/v1",
  COORDINATOR_MODEL_API_KEY: "",
  COORDINATOR_MODEL_NAME: "example-model",
}, () => assert.throws(() => modelConfig(), /MODEL_API_KEY/)));

test("compatible request and DSH route use the configured provider", () => withModelEnv({
  COORDINATOR_MODEL_PROVIDER: "Example Cloud",
  COORDINATOR_MODEL_BASE_URL: "https://example.test/v1/chat/completions",
  COORDINATOR_MODEL_API_KEY: "secret-value",
  COORDINATOR_MODEL_NAME: "example-model",
  COORDINATOR_MODEL_REASONING_EFFORT: "high",
}, async () => {
  let captured;
  const data = await modelResponse({ messages: [{ role: "user", content: "hello" }], maxTokens: 64 },
    async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }] }),
      };
    });
  assert.equal(responseText(data), "ok");
  assert.equal(captured.url, "https://example.test/v1/responses");
  assert.equal(captured.options.headers.Authorization, "Bearer secret-value");
  assert.equal(captured.body.model, "example-model");
  assert.equal(captured.body.max_output_tokens, 64);
  assert.deepEqual(captured.body.input, [{ role: "user", content: "hello" }]);
  assert.deepEqual(captured.body.reasoning, { effort: "high" });
  assert.equal(captured.body.store, false);
  const patch = dshModelPatch(modelConfig());
  assert.match(patch, /llm-pi-ai/);
  assert.match(patch, /displayName: "Example Cloud"/);
  assert.match(patch, /api: openai-responses/);
  assert.match(patch, /reasoning: high/);
  assert.match(patch, /baseURL: "https:\/\/example\.test\/v1"/);
  assert.match(patch, /id: "example-model"/);
  assert.match(patch, /contextWindow: 1048576/);
  assert.match(patch, /maxTokens: 131072/);
  assert.match(patch, /reasoningEfforts:\s+off: none\s+minimal: minimal\s+low: low\s+medium: medium\s+high: high\s+xhigh: xhigh\s+max: max/);
  assert.equal(patch.includes("secret-value"), false);
  assert.equal(redactSecrets("failed secret-value"), "failed [REDACTED]");
}));

test("model capacity uses a 1M context and provider-specific output limits", () => {
  assert.equal(modelOutputLimit({ provider: "Deepseek", model: "deepseek-flash" }), 393216);
  assert.equal(modelOutputLimit({ provider: "Taoxiang", model: "gpt-6-astra" }), 131072);
});

test("DSH maps none and ultra onto its supported reasoning selector keys", () => {
  const base = { provider: "Compatible", baseUrl: "https://example.test", apiKey: "secret", model: "custom" };
  const none = dshModelPatch({ ...base, reasoningEffort: "none" });
  assert.match(none, /reasoning: off/);
  assert.match(none, /off: none/);
  const ultra = dshModelPatch({ ...base, reasoningEffort: "ultra" });
  assert.match(ultra, /reasoning: max/);
  assert.match(ultra, /max: ultra/);
  assert.doesNotMatch(ultra, /\n\s+ultra:/);
});

test("compatible request reports an invalid non-JSON response", () => withModelEnv({
  COORDINATOR_MODEL_PROVIDER: "Example Cloud",
  COORDINATOR_MODEL_BASE_URL: "https://example.test/v1",
  COORDINATOR_MODEL_API_KEY: "secret-value",
  COORDINATOR_MODEL_NAME: "example-model",
}, async () => {
  await assert.rejects(
    modelResponse({ messages: [], maxTokens: 64 }, async () => ({
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => "<!doctype html>",
    })),
    /invalid JSON \(text\/html\)/,
  );
}));

test("compatible request reports an incomplete Responses result", () => withModelEnv({
  COORDINATOR_MODEL_PROVIDER: "Example Cloud",
  COORDINATOR_MODEL_BASE_URL: "https://example.test/v1",
  COORDINATOR_MODEL_API_KEY: "secret-value",
  COORDINATOR_MODEL_NAME: "example-model",
}, async () => {
  await assert.rejects(
    modelResponse({ messages: [], maxTokens: 64 }, async () => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }),
    })),
    /incomplete \(max_output_tokens\)/,
  );
}));

test("Responses streaming forwards text deltas and returns final usage", () => withModelEnv({
  COORDINATOR_MODEL_PROVIDER: "Example Cloud",
  COORDINATOR_MODEL_BASE_URL: "https://example.test/v1",
  COORDINATOR_MODEL_API_KEY: "secret-value",
  COORDINATOR_MODEL_NAME: "example-model",
  COORDINATOR_MODEL_REASONING_EFFORT: "off",
}, async () => {
  const encoder = new TextEncoder();
  const chunks = [
    'data: {"type":"response.output_text.delta","delta":"你"}\n\n',
    'data: {"type":"response.output_text.delta","delta":"好"}\n\n',
    'data: {"type":"response.completed","response":{"usage":{"input_tokens":3,"output_tokens":2}}}\n\n',
    'data: [DONE]\n\n',
  ];
  const deltas = [];
  let body;
  const result = await modelResponseStream({ messages: [], maxTokens: 64, onText: value => deltas.push(value) },
    async (_url, options) => {
      body = JSON.parse(options.body);
      return new Response(new ReadableStream({ start(controller) {
        chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      } }), { headers: { "content-type": "text/event-stream" } });
    });
  assert.equal(result.text, "你好");
  assert.deepEqual(deltas, ["你", "好"]);
  assert.equal(result.data.usage.output_tokens, 2);
  assert.equal(body.stream, true);
  assert.deepEqual(body.reasoning, { effort: "none" });
}));

test("reasoning effort defaults to medium and rejects unknown values", () => withModelEnv({
  COORDINATOR_MODEL_PROVIDER: "Example",
  COORDINATOR_MODEL_BASE_URL: "https://example.test",
  COORDINATOR_MODEL_API_KEY: "secret-value",
  COORDINATOR_MODEL_NAME: "example-model",
  COORDINATOR_MODEL_REASONING_EFFORT: undefined,
}, () => {
  assert.equal(modelConfig().reasoningEffort, "medium");
  process.env.COORDINATOR_MODEL_REASONING_EFFORT = "off";
  assert.equal(modelConfig().reasoningEffort, "off");
  process.env.COORDINATOR_MODEL_REASONING_EFFORT = "extreme";
  assert.throws(() => modelConfig(), /MODEL_REASONING_EFFORT/);
}));
