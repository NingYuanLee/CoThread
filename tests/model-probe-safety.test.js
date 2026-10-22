import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { modelConfigFromEnvironment, probeModelCompatibility } from "../server/model-config.js";

const config = modelConfigFromEnvironment("coordinator", {
  MODEL_BASE_URL: "https://model.example.test/v1",
  MODEL_API_KEY: "probe-secret-never-return",
  MODEL: "probe-model@low",
});
const normal = (text = "ok") =>
  new Response(
    JSON.stringify({
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text }] }],
    }),
    { headers: { "content-type": "application/json" } },
  );
const stream = (events) =>
  new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
    headers: { "content-type": "text/event-stream" },
  });

test("compatibility validation rejects a stream cut off before completion", async () => {
  await assert.rejects(
    probeModelCompatibility(config, async (_url, options) => {
      const input = JSON.parse(options.body);
      if (input.stream) return stream([{ type: "response.output_text.delta", delta: "ok" }]);
      return normal(input.text ? '{"ok":true}' : "ok");
    }),
    /流式|stream|complet/iu,
  );
});

test("compatibility validation redacts provider error echoes of the candidate key", async () => {
  await assert.rejects(
    probeModelCompatibility(
      config,
      async () => new Response(`upstream refused ${config.apiKey}`, { status: 503 }),
    ),
    (error) => {
      assert.match(error.message, /503/);
      assert.ok(!error.message.includes(config.apiKey));
      return true;
    },
  );
});

test("compatibility validation budget also covers a stalled response body", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write('{"status":');
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const route = {
      ...config,
      responsesUrl: `http://127.0.0.1:${server.address().port}/responses`,
    };
    const started = Date.now();
    await assert.rejects(
      probeModelCompatibility(route, fetch, { budgetMs: 100 }),
      /超时|abort|timeout/iu,
    );
    assert.ok(Date.now() - started < 2000, "stalled provider exceeded the validation deadline");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
