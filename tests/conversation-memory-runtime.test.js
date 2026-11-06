import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { DeepSeekHarness } from "@deepseek-ai/dsh-sdk-client";
import { dshModelPatch } from "../server/model-config.ts";
import { elderRuntimePatch } from "../server/dsh-runtime-config.ts";

test("真实 DSH runtime 注册受限的只读工具并转发调用", { timeout: 300000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "cothread-conversation-runtime-"));
  let requests = 0;
  let toolCall = null;
  let firstRequest = null;
  const bridge = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    toolCall = JSON.parse(body);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify("来源内容"));
  });
  await new Promise((done) => bridge.listen(0, "127.0.0.1", done));
  const provider = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const data = JSON.parse(body);
    requests++;
    if (!firstRequest) firstRequest = data;
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const event = (value) => res.write(`data: ${JSON.stringify(value)}\n\n`);
    if (requests === 1) {
      const item = {
        id: "fc_1",
        type: "function_call",
        call_id: "call_1",
        name: "read_message",
        arguments: '{"messageId":"fixture"}',
        status: "completed",
      };
      event({
        type: "response.output_item.added",
        output_index: 0,
        item: { ...item, arguments: "", status: "in_progress" },
      });
      event({
        type: "response.function_call_arguments.delta",
        item_id: "fc_1",
        output_index: 0,
        delta: item.arguments,
      });
      event({
        type: "response.function_call_arguments.done",
        item_id: "fc_1",
        output_index: 0,
        arguments: item.arguments,
      });
      event({ type: "response.output_item.done", output_index: 0, item });
      event({
        type: "response.completed",
        response: {
          id: "resp_1",
          status: "completed",
          output: [item],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      });
    } else {
      event({ type: "response.output_text.delta", delta: "已读取" });
      event({
        type: "response.completed",
        response: {
          id: "resp_2",
          status: "completed",
          output: [
            {
              type: "message",
              id: "msg_1",
              role: "assistant",
              status: "completed",
              content: [{ type: "output_text", text: "已读取", annotations: [] }],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      });
    }
    res.end();
  });
  await new Promise((done) => provider.listen(0, "127.0.0.1", done));
  const modelPatch = join(home, "model.yml");
  const runtimePatch = join(home, "runtime.yml");
  await writeFile(
    modelPatch,
    dshModelPatch(
      {
        baseUrl: `http://127.0.0.1:${provider.address().port}/v1`,
        model: "test",
        apiKey: "fixture",
      },
      "knowledge",
    ),
  );
  await writeFile(runtimePatch, elderRuntimePatch());
  const env = {};
  for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC", "PATHEXT"])
    if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, {
    HOME: home,
    USERPROFILE: home,
    MODEL_API_KEY: "fixture",
    COTHREAD_BRIDGE_URL: `http://127.0.0.1:${bridge.address().port}`,
    COTHREAD_BRIDGE_TOKEN: "fixture",
    COTHREAD_ALLOWED_TOOLS: JSON.stringify(["read_message"]),
    COTHREAD_MCP_TOOLS: JSON.stringify([
      {
        name: "read_message",
        description: "只读消息",
        parameters: { messageId: { type: "string", required: true } },
      },
    ]),
  });
  const harness = new DeepSeekHarness({
    profile: "sdk-minimal",
    dshHome: home,
    cwd: home,
    processCwd: home,
    patches: [modelPatch, resolve("dsh-layer/laoweng-agent-patch.yml"), runtimePatch],
    env,
    provider: "cothread-compatible",
    model: "test",
    // 同 context-runtime：并行跑时 DSH profile 初始化会被拖长，放宽初始化上限。
    initializeTimeoutMs: 120000,
    requestTimeoutMs: 30000,
  });
  try {
    await harness.start();
    await harness.run("请读取消息", { sessionId: randomUUID() });
    assert.ok(firstRequest);
    assert.match(JSON.stringify(firstRequest.tools), /read_message/);
    assert.doesNotMatch(JSON.stringify(firstRequest.tools), /post_message/);
    assert.equal(toolCall?.name, "read_message");
    assert.equal(toolCall?.args?.messageId, "fixture");
  } finally {
    await harness.close().catch(() => {});
    await new Promise((done) => provider.close(done));
    await new Promise((done) => bridge.close(done));
    await rm(home, { recursive: true, force: true });
  }
});
