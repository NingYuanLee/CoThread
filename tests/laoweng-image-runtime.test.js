import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { DeepSeekHarness } from "@deepseek-ai/dsh-sdk-client";
import sharp from "sharp";
import { dshModelPatch } from "../server/model-config.ts";

test(
  "老翁 runtime admits image bytes and sends an image to the model",
  { timeout: 60000 },
  async () => {
    const home = await mkdtemp(join(tmpdir(), "cothread-image-"));
    let requestBody;
    const server = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      requestBody = JSON.parse(Buffer.concat(chunks).toString());
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end(
        'data: {"type":"response.completed","response":{"id":"resp_test","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1}}}\n\n',
      );
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const modelPatch = join(home, "model.yml");
    await writeFile(
      modelPatch,
      dshModelPatch(
        {
          baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
          model: "test",
          apiKey: "fixture",
        },
        "knowledge",
        { imageInput: true },
      ),
    );
    const env = {};
    for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "COMSPEC", "PATHEXT"])
      if (process.env[key]) env[key] = process.env[key];
    Object.assign(env, { HOME: home, USERPROFILE: home, MODEL_API_KEY: "fixture" });
    const harness = new DeepSeekHarness({
      profile: "sdk-minimal",
      dshHome: home,
      cwd: home,
      processCwd: home,
      patches: [modelPatch, resolve("dsh-layer/laoweng-agent-patch.yml")],
      env,
      provider: "cothread-compatible",
      model: "test",
      initializeTimeoutMs: 30000,
      requestTimeoutMs: 30000,
    });
    try {
      await harness.start();
      const png = (
        await sharp({ create: { width: 4, height: 4, channels: 3, background: "#ff0000" } })
          .png()
          .toBuffer()
      ).toString("base64");
      await harness.run(
        [
          { type: "text", text: "描述图片" },
          { type: "image", data: png, mimeType: "image/png" },
        ],
        { sessionId: randomUUID() },
      );
      assert.ok(requestBody, "image must reach the provider");
      assert.match(JSON.stringify(requestBody), /input_image/);
      assert.ok((await readdir(join(home, "attachments/v1"))).length > 0);
    } finally {
      await harness.close().catch(() => {});
      await new Promise((done) => server.close(done));
      await rm(home, { recursive: true, force: true });
    }
  },
);
