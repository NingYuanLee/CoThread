import { test } from "node:test";
import assert from "node:assert/strict";
import { decideParticipation } from "../server/agent-participation.js";

test("unmentioned discussion reaches the model, which can choose silence or participation", async () => {
  const keys = ["COORDINATOR_MODEL_PROVIDER", "COORDINATOR_MODEL_BASE_URL", "COORDINATOR_MODEL_API_KEY", "COORDINATOR_MODEL_NAME", "COORDINATOR_MODEL_REASONING_EFFORT"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    COORDINATOR_MODEL_PROVIDER: "Test Provider",
    COORDINATOR_MODEL_BASE_URL: "https://model.test/v1",
    COORDINATOR_MODEL_API_KEY: "test-only",
    COORDINATOR_MODEL_NAME: "test-model",
  });
  try {
    for (const respond of [false, true]) {
      let calls = 0;
      const result = await decideParticipation(
        {
          title: "讨论",
          messages: [
            { author: "成员", source: "human", body: "有人知道如何解决吗？" },
          ],
        },
        async (url, options) => {
          calls++;
          const payload = JSON.parse(options.body);
          assert.match(payload.input[0].content, /没有明确 @/);
          assert.match(payload.input[1].content, /有人知道如何解决吗/);
          assert.equal(payload.tools, undefined);
          return {
            ok: true,
            headers: new Headers({ "content-type": "application/json" }),
            text: async () => JSON.stringify({ output_text: JSON.stringify({ respond }) }),
          };
        },
      );
      assert.equal(result, respond);
      assert.equal(calls, 1);
    }
    await assert.rejects(
      decideParticipation({ messages: [] }, async () => ({
        ok: true,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify({ output_text: '{"respond":"yes"}' }),
      })),
      /Invalid participation/,
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
