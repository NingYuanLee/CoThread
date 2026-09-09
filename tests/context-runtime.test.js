import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { DeepSeekHarness } from "@deepseek-ai/dsh-sdk-client";
import {
  contextUsage,
  pendingMessages,
  AUTO_COMPACT_AT,
} from "../shared/context.js";

test("context accounting excludes already retained discussion and native replies", () => {
  const messages = [
    { id: "old", sequence: "9007199254740993", body: "old" },
    { id: "reply", sequence: "9007199254740994", body: "native reply" },
    { id: "new", sequence: "9007199254740995", body: "new" },
  ];
  const replies = [{ reply_id: "reply" }];
  assert.deepEqual(
    pendingMessages(messages, "9007199254740993", replies).map((m) => m.id),
    ["new"],
  );
  const usage = contextUsage(
    {
      seen_sequence: "9007199254740993",
      context_stats: {
        used: 200,
        categories: { discussion: 100, summary: 50 },
      },
    },
    messages,
    replies,
  );
  assert.equal(usage.limit, 1_000_000);
  assert.equal(usage.autoCompactAt, 900_000);
  assert.ok(usage.used > 200);
  assert.equal(usage.categories.find((c) => c.key === "summary").tokens, 50);
  assert.equal(contextUsage(null, [], []).used, 0);
});

test(
  "native context survives resume, manual compaction reduces history, and 900K pressure auto-compacts",
  { timeout: 120000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), "cothread-context-test-"));
    const requests = [];
    let holdNext;
    const server = createServer(async (req, res) => {
      let text = "";
      for await (const chunk of req) text += chunk;
      const body = JSON.parse(text);
      requests.push(body);
      if (holdNext) {
        const gate = holdNext;
        holdNext = undefined;
        gate.entered.resolve();
        await gate.release.promise;
      }
      const content = "已保留关键结论：项目代号 ALPHA，接下来验证方案。";
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(
        `data: ${JSON.stringify({ id: "fixture", choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }] })}\n\n`,
      );
      res.write(
        `data: ${JSON.stringify({ id: "fixture", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: Math.ceil(JSON.stringify(body.messages).length / 4), completion_tokens: 20, total_tokens: Math.ceil(JSON.stringify(body.messages).length / 4) + 20 } })}\n\n`,
      );
      res.end("data: [DONE]\n\n");
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const patch = join(home, "test.yml");
    await writeFile(
      patch,
      `- id: sdk-jsonrpc-server\n  disabled: true\n- insert:\n    - id: test-sdk-server\n      name: ${JSON.stringify(pathToFileURL(resolve("runtime/sdk-resume.mjs")).href)}\n      inject: [sdkAppStartup, loader]\n    - id: project-tools\n      name: ${JSON.stringify(pathToFileURL(resolve("runtime/cothread-tools.mjs")).href)}\n- id: llm-deepseek\n  config:\n    baseURL: 'http://127.0.0.1:${server.address().port}/v1'\n    apiKeyEnv: COTHREAD_TEST_KEY\n    defaultContextWindow: 1000000\n    models: [{id: context-test, contextWindow: 1000000}]\n`,
    );
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
    ])
      if (process.env[key]) env[key] = process.env[key];
    const make = (resume = "") =>
      new DeepSeekHarness({
        profile: "sdk-minimal",
        dshHome: home,
        cwd: home,
        processCwd: home,
        patches: [resolve("runtime/agent-patch.yml"), patch],
        env: {
          ...env,
          HOME: home,
          USERPROFILE: home,
          COTHREAD_TEST_KEY: "fixture",
          COTHREAD_RESUME_SESSION: resume,
        },
        model: "context-test",
        initializeTimeoutMs: 30000,
        requestTimeoutMs: 60000,
      });
    let harness = make();
    const sessionId = randomUUID();
    const request = (method, params = {}) =>
      harness.client.request(
        `cothread/${method}`,
        { sessionId, ...params },
        60000,
      );
    try {
      await harness.start();
      await request("observe", {
        messages: [
          "项目代号 ALPHA。" + "old discussion ".repeat(24000),
          "最新问题：验证方案。",
        ],
      });
      const before = await request("context");
      assert.ok(before.used > 64000);
      assert.equal(requests.length, 0, "observation must not call a model");
      const noAutomatic = await request("compact", { automatic: true });
      assert.equal(noAutomatic.changed, false);
      const compressed = await request("compact");
      assert.equal(compressed.changed, true);
      assert.ok(compressed.after < compressed.before);
      const compacted = await request("context");
      assert.equal(compacted.compactions, 1);
      assert.ok(compacted.categories.summary > 0);
      await harness.close();
      harness = make(sessionId);
      await harness.start();
      const restored = await request("context");
      assert.equal(restored.used, compacted.used);
      assert.equal(restored.compactions, 1);
      const isolated = await harness.client.request("cothread/context", {
        sessionId: randomUUID(),
      });
      assert.equal(isolated.used, 0);

      await request("observe", {
        messages: Array.from(
          { length: 21 },
          (_, i) => `${i}: ` + "history ".repeat(22500),
        ),
      });
      const pressure = await request("context");
      assert.ok(pressure.used >= AUTO_COMPACT_AT, String(pressure.used));
      const automatic = await request("compact", { automatic: true });
      assert.equal(automatic.changed, true);
      const result = await harness.run("继续验证方案", { sessionId });
      assert.ok(result.finalResponse.includes("ALPHA"));
      const after = await request("context");
      assert.ok(after.compactions > restored.compactions);
      assert.ok(after.used < AUTO_COMPACT_AT);
      assert.ok(after.categories.system > 0);
      assert.ok(after.categories.tools > 0);
      assert.ok(after.categories.assistant > 0);
      const lastRequest = JSON.stringify(requests.at(-1).messages);
      assert.ok(lastRequest.includes("ALPHA"));
      assert.ok(
        lastRequest.length < 1_000_000,
        "compacted history must be used on the next model call",
      );
      await request("observe", {
        messages: Array.from({ length: 21 }, () =>
          "more history ".repeat(15000),
        ),
      });
      assert.ok((await request("context")).used >= AUTO_COMPACT_AT);
      await harness.run("继续第二轮", { sessionId });
      const next = await request("context");
      assert.ok(
        next.compactions > after.compactions,
        "native pre-step must also auto-compact after a request envelope exists",
      );
      assert.ok(next.used < AUTO_COMPACT_AT);
      // Exercise the pinned DSH runtime itself: steering must be consumed before
      // this run becomes idle, not queued as a second ordinary follow-up.
      const gate = { entered: Promise.withResolvers(), release: Promise.withResolvers() };
      holdNext = gate;
      const running = harness.run("处理可更新的任务", { sessionId });
      void running.catch(gate.entered.reject);
      await gate.entered.promise;
      try {
        const payload = { mode: "steer", messages: [{ id: "correction-1", text: "LATEST_REQUIREMENT_B" }] };
        assert.deepEqual((await request("updates", payload)).accepted, ["correction-1"]);
        assert.deepEqual((await request("updates", payload)).accepted, ["correction-1"]);
      } finally { gate.release.resolve(); }
      await running;
      const steeredRequest = JSON.stringify(requests.at(-1).messages);
      assert.ok(steeredRequest.includes("LATEST_REQUIREMENT_B"));
      assert.equal(steeredRequest.split("LATEST_REQUIREMENT_B").length - 1, 1);
      assert.deepEqual((await request("updates", { mode: "steer", messages: [{ id: "late-idle", text: "late" }] })).accepted, []);
      const childId = randomUUID();
      await harness.client.request("cothread/seed", {
        sessionId: childId, messages: await request("history"),
      });
      const childHistory = await harness.client.request("cothread/history", { sessionId: childId });
      assert.ok(JSON.stringify(childHistory).includes("ALPHA"), "child inherits the retained summary without rereading the discussion");
      await request("observe", {
        autoCompact: true,
        messages: Array.from({ length: 21 }, () => "member discussion ".repeat(12000)),
      });
      assert.ok((await request("context")).used < AUTO_COMPACT_AT,
        "observing new member messages triggers compaction before any reply is requested");
    } finally {
      await harness.close();
      await new Promise((done) => server.close(done));
      // mkdtemp returned this task-specific directory; no computed parent deletion.
      if (!home.startsWith(join(tmpdir(), "cothread-context-test-")))
        throw new Error("Unexpected test directory");
      await rm(home, { recursive: true, force: true });
    }
  },
);
