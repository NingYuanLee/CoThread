import { test } from "node:test";
import assert from "node:assert/strict";
import { decideParticipation } from "../server/agent-participation.js";

test("unmentioned discussion reaches the model, which can choose silence or participation", async () => {
  const previous = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-only";
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
          assert.match(payload.messages[0].content, /没有明确 @/);
          assert.match(payload.messages[1].content, /有人知道如何解决吗/);
          assert.equal(payload.tools, undefined);
          return {
            ok: true,
            json: async () => ({
              choices: [{ message: { content: JSON.stringify({ respond }) } }],
            }),
          };
        },
      );
      assert.equal(result, respond);
      assert.equal(calls, 1);
    }
    await assert.rejects(
      decideParticipation({ messages: [] }, async () => ({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"respond":"yes"}' } }],
        }),
      })),
      /Invalid participation/,
    );
  } finally {
    if (previous === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previous;
  }
});
