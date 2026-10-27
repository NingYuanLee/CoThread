import { test } from "node:test";
import assert from "node:assert/strict";
import { assertMiaowenToken } from "../server/user-skill-credentials.js";
import {
  MIAOWEN_SKILL_VERSION,
  miaowenSkillLabel,
  runMiaowenChat,
  scrubMiaowenSecret,
} from "../server/miaowen-skill.js";

const TOKEN = "sk-mw-abc_DEF-1234";

test("妙问 API KEY 必须是 sk-mw- 开头，未配置时不访问网络", async () => {
  assert.equal(assertMiaowenToken(TOKEN), TOKEN);
  assert.throws(() => assertMiaowenToken("secret"), /sk-mw-/);
  let called = false;
  const missing = await runMiaowenChat({ query: "开户流程" }, "", {
    fetch: async () => {
      called = true;
      throw new Error("不应访问网络");
    },
  });
  assert.equal(called, false);
  assert.match(missing.text, /TOKEN_NOT_FOUND/);
  assert.match(missing.text, /环境变量/);
  assert.match(miaowenSkillLabel(), new RegExp(MIAOWEN_SKILL_VERSION));
  assert.equal(scrubMiaowenSecret(`泄漏 ${TOKEN}`).includes(TOKEN), false);
});

test("妙问在进程内解析流式回答，不把钥匙带回结果", async () => {
  const seen = {};
  const sse = [
    'data: {"event_type":"STREAM_BEGIN","session_id":"sess-1"}',
    'data: {"event_type":"MARKDOWN_DATA","data":"准备营业执照。"}',
    'data: {"event_type":"STREAM_END","answer_message_id":"msg-9"}',
    "",
  ].join("\n");
  const result = await runMiaowenChat({ query: "开户流程" }, TOKEN, {
    fetch: async (url, init) => {
      seen.url = url;
      seen.authorization = init.headers.Authorization;
      seen.body = JSON.parse(init.body);
      seen.version = init.headers["skill-version"];
      return new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } });
    },
  });
  assert.match(seen.url, /stream_chat$/);
  assert.equal(seen.authorization, `Bearer ${TOKEN}`);
  assert.equal(seen.body.query, "开户流程");
  assert.equal(seen.version, MIAOWEN_SKILL_VERSION);
  assert.match(result.text, /\[RESULT\]\n准备营业执照。/);
  assert.match(result.text, /sess-1/);
  assert.match(result.text, /msg-9/);
  assert.equal(result.text.includes(TOKEN), false);
});

test("妙问拒绝钥匙或过期协议时给出可操作的说明，并丢掉响应里的钥匙", async () => {
  const denied = await runMiaowenChat({ query: "报表" }, TOKEN, {
    fetch: async () => new Response(`bad ${TOKEN}`, { status: 401 }),
  });
  assert.match(denied.text, /环境变量/);
  assert.equal(denied.text.includes(TOKEN), false);

  const expired = await runMiaowenChat({ query: "报表" }, TOKEN, {
    fetch: async () =>
      new Response(JSON.stringify({ code: 140209, message: `请更新 ${TOKEN}` }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });
  assert.match(expired.text, /VERSION_EXPIRED/);
  assert.match(expired.text, /不要重新索取/);
  assert.equal(expired.text.includes(TOKEN), false);
});

test("妙问不读取本机附件，网络失败也不抛出钥匙", async () => {
  const local = await runMiaowenChat(
    { query: "预审", attachments: [{ content_type: "IMAGE", url: "C:\\素材.png" }] },
    TOKEN,
    {
      fetch: async () => {
        throw new Error("不应上传本机文件");
      },
    },
  );
  assert.match(local.text, /https/);
  assert.equal(local.text.includes(TOKEN), false);

  const timeout = Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" });
  const stalled = await runMiaowenChat({ query: "诊断" }, TOKEN, {
    fetch: async () => {
      throw timeout;
    },
  });
  assert.match(stalled.text, /NETWORK_ERROR/);
  assert.match(stalled.text, /10 分钟/);
});
