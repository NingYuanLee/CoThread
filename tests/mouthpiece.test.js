import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMouthpieceInput,
  decideMouthpieceMode,
  describeMouthpieceAttachment,
  draftMouthpiece,
  focusLatestOthers,
  focusReply,
  formatElderLines,
  formatGroupLines,
  formatReplyFocus,
  parseMouthpieceText,
} from "../server/mouthpiece.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const threadId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";
const user = { id: "44444444-4444-4444-8444-444444444444", name: "张三" };

const keys = ["MODEL_BASE_URL", "MODEL_API_KEY", "MODEL"];

async function withModelEnv(run) {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.MODEL_BASE_URL = "https://example.test/v1";
  process.env.MODEL_API_KEY = "test-key";
  process.env.MODEL = "mouthpiece-model";
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function modelRequest(text, capture, failFirst = false) {
  let calls = 0;
  return async (_url, options) => {
    calls += 1;
    const body = JSON.parse(options.body);
    capture.push(body);
    if (failFirst && calls === 1) {
      return {
        ok: false,
        status: 400,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => "no vision",
      };
    }
    return {
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({ output_text: text }),
    };
  };
}

function service(extra = {}) {
  return {
    member: async () => ({ role: "member" }),
    thread: async () => ({
      id: threadId,
      project_id: projectId,
      title: "登录改版",
      status: "active",
    }),
    version: async (_user, id, options = {}) => {
      assert.equal(id, versionId);
      const content = Buffer.from("# 明天发布\n先改登录页");
      if (options.includeContent === false)
        return {
          id,
          project_id: projectId,
          title: "说明",
          filename: "说明.md",
          mime: "text/markdown",
          byte_size: content.length,
        };
      return {
        id,
        project_id: projectId,
        title: "说明",
        filename: "说明.md",
        mime: "text/markdown",
        byte_size: content.length,
        content,
      };
    },
    listMessages: async () => {
      throw new Error("不应读取群聊");
    },
    listElderTurns: async () => {
      throw new Error("不应读取单聊");
    },
    ...extra,
  };
}

test("mouthpiece polishes when there is text or an attachment", () => {
  assert.equal(decideMouthpieceMode({ text: "  好的 ", versionCount: 0 }), "polish");
  assert.equal(decideMouthpieceMode({ text: " ", versionCount: 1 }), "polish");
  assert.equal(decideMouthpieceMode({ text: "", versionCount: 0 }), "suggest");
});

test("mouthpiece text drops a wrapping fence and quotes", () => {
  assert.equal(parseMouthpieceText("```markdown\n明天发\n```"), "明天发");
  assert.equal(parseMouthpieceText("「先看登录」"), "先看登录");
  assert.equal(parseMouthpieceText("张三：按钮先下移", "张三"), "按钮先下移");
});

test("recent lines keep the speaker and do not dump the whole history", () => {
  const group = formatGroupLines(
    [
      { body: "登录页太挤", author: "李四", author_id: "other", source: "human" },
      { body: "我先改一版", author: "张三", author_id: user.id, source: "human" },
      { body: "可以", author: "小祥", author_id: "agent", source: "assistant" },
      { body: "   ", author: "李四", source: "human" },
    ],
    user.id,
    "张三",
  );
  assert.equal(group, "李四：登录页太挤\n张三：我先改一版\n小祥：可以");
  const elder = formatElderLines(
    [
      { body: "上次决定了什么", answer: { body: "先改登录" } },
      { question_body: "那下一步呢", answer_body: "补验收" },
    ],
    "张三",
  );
  assert.match(elder, /张三：上次决定了什么\n老翁：先改登录/);
  assert.match(elder, /张三：那下一步呢\n老翁：补验收/);
});

test("an empty composer replies to the latest speech from other people", () => {
  const focus = focusLatestOthers([
    { self: false, line: "李四：登录页太挤" },
    { self: true, line: "张三：我先改一版" },
    { self: false, line: "王五：按钮下移会挡链接" },
    { self: false, line: "小祥：可以标在右侧" },
    { self: true, line: "张三：我再看看" },
  ]);
  assert.equal(focus.target, "王五：按钮下移会挡链接\n小祥：可以标在右侧");
  assert.match(focus.background, /李四：登录页太挤/);
  assert.match(focus.background, /张三：我先改一版/);
  assert.doesNotMatch(focus.target, /张三/);
  const many = [1, 2, 3, 4, 5].map((n) => ({ self: false, line: `李四：第${n}句` }));
  const latest = focusLatestOthers(many);
  assert.match(latest.target, /第5句/);
  assert.doesNotMatch(latest.target, /第2句/);
  assert.match(latest.background, /第2句/);
  assert.equal(focusLatestOthers([{ self: true, line: "张三：只有我" }]), null);
  const own = focusReply([
    { self: true, line: "张三：登录页太挤" },
    { self: true, line: "张三：我先改一版" },
  ]);
  assert.equal(own.basis, "self");
  assert.match(own.target, /我先改一版/);
  assert.match(formatReplyFocus(own), /改写或续写[\s\S]*我先改一版/);
  const text = formatReplyFocus(focus);
  assert.match(text, /别人刚说的[\s\S]*小祥：可以标在右侧/);
  assert.match(text, /只作背景[\s\S]*张三：我先改一版/);
});

test("polish prompt keeps mentions and reads the attachment", () => {
  const described = describeMouthpieceAttachment({
    title: "说明",
    filename: "说明.md",
    mime: "text/markdown",
    byte_size: 12,
    content: Buffer.from("明天发布"),
  });
  const messages = buildMouthpieceInput({
    scene: "group",
    mode: "polish",
    speaker: "张三",
    title: "登录改版",
    draft: "@李四 看下 /说明.md ，明天发",
    attachments: [described],
  });
  assert.match(messages[0].content, /不要新增/);
  assert.match(messages[1].content, /@李四/);
  assert.match(messages[1].content, /\/说明\.md/);
  assert.match(messages[1].content, /明天发布/);
  assert.match(messages[1].content, /群聊「登录改版」/);
});

test("draft uses 小祥 to polish text and attachments", () =>
  withModelEnv(async () => {
    const seen = [];
    const result = await draftMouthpiece(
      service(),
      user,
      projectId,
      { scene: "group", threadId, text: "明天发", versionIds: [versionId] },
      modelRequest("明天发布，先改登录页。", seen),
    );
    assert.equal(result.mode, "polish");
    assert.equal(result.text, "明天发布，先改登录页。");
    assert.equal(seen[0].model, "mouthpiece-model");
    assert.equal(seen[0].reasoning.effort, "none");
    const userMessage = seen[0].input.find((item) => item.role === "user").content;
    assert.match(userMessage, /明天发/);
    assert.match(userMessage, /明天发布/);
  }));

test("an empty group composer drafts from recent messages", () =>
  withModelEnv(async () => {
    const seen = [];
    let listed = 0;
    const result = await draftMouthpiece(
      service({
        listMessages: async (_user, id, input) => {
          listed += 1;
          assert.equal(id, threadId);
          assert.equal(input.limit, 8);
          return {
            messages: [
              {
                body: "登录页的按钮要不要下移",
                author: "李四",
                author_id: "other",
                source: "human",
              },
            ],
          };
        },
      }),
      user,
      projectId,
      { scene: "group", threadId, text: "  ", versionIds: [] },
      modelRequest("按钮先下移，我按这个改一版。", seen),
    );
    assert.equal(listed, 1);
    assert.equal(result.mode, "suggest");
    assert.equal(result.text, "按钮先下移，我按这个改一版。");
    const userMessage = seen[0].input.find((item) => item.role === "user").content;
    assert.match(userMessage, /别人刚说的[\s\S]*登录页的按钮/);
    assert.match(userMessage, /张三：$/);
    assert.match(seen[0].input[0].content, /你就是张三/);
    assert.match(seen[0].input[0].content, /优先接最后一条/);
    assert.doesNotMatch(userMessage, /建议/);
  }));

test("an empty elder composer drafts from the private chat", () =>
  withModelEnv(async () => {
    const seen = [];
    const result = await draftMouthpiece(
      service({
        listElderTurns: async () => [{ body: "登录改到哪了", answer: { body: "还差按钮位置" } }],
      }),
      user,
      projectId,
      { scene: "elder", text: "", versionIds: [] },
      modelRequest("按钮位置你建议怎么放？", seen),
    );
    assert.equal(result.mode, "suggest");
    assert.match(seen[0].input[0].content, /你就是张三/);
    assert.match(seen[0].input[0].content, /发给老翁/);
    assert.match(seen[0].input[1].content, /只作背景[\s\S]*张三：登录改到哪了/);
    assert.match(seen[0].input[1].content, /别人刚说的[\s\S]*还差按钮位置/);
    assert.match(seen[0].input[1].content, /张三：$/);
    assert.equal(result.text, "按钮位置你建议怎么放？");
  }));

test("with only the user's own messages, the draft rewrites or continues them", () =>
  withModelEnv(async () => {
    const seen = [];
    const result = await draftMouthpiece(
      service({
        listMessages: async () => ({
          messages: [
            { body: "登录页先不动", author: "张三", author_id: user.id, source: "human" },
            { body: "按钮我再调一下", author: "张三", author_id: user.id, source: "human" },
          ],
        }),
      }),
      user,
      projectId,
      { scene: "group", threadId, text: "", versionIds: [] },
      modelRequest("按钮我再往下挪一点。", seen),
    );
    assert.equal(result.basis, "self");
    const userMessage = seen[0].input.find((item) => item.role === "user").content;
    assert.match(userMessage, /改写或续写[\s\S]*按钮我再调一下/);
    assert.match(seen[0].input[0].content, /没有别人的新发言/);
    assert.doesNotMatch(seen[0].input[0].content, /优先接最后一条/);
    assert.equal(result.text, "按钮我再往下挪一点。");
  }));

test("an unanswered elder question is continued from the user's own words", () =>
  withModelEnv(async () => {
    const seen = [];
    const result = await draftMouthpiece(
      service({
        listElderTurns: async () => [{ body: "登录改到哪了" }],
      }),
      user,
      projectId,
      { scene: "elder", text: "", versionIds: [] },
      modelRequest("登录改到哪了？按钮位置也一起说一下。", seen),
    );
    assert.equal(result.basis, "self");
    assert.match(seen[0].input[0].content, /老翁还没答/);
    assert.match(seen[0].input[1].content, /改写或续写[\s\S]*登录改到哪了/);
    assert.equal(result.text, "登录改到哪了？按钮位置也一起说一下。");
  }));

test("with no messages at all, the draft is a greeting", () =>
  withModelEnv(async () => {
    const seen = [];
    const group = await draftMouthpiece(
      service({ listMessages: async () => ({ messages: [] }) }),
      user,
      projectId,
      { scene: "group", threadId, text: "", versionIds: [] },
      modelRequest("大家好，登录改版这边我先跟大家打个招呼。", seen),
    );
    assert.equal(group.basis, "greet");
    assert.match(seen[0].input[0].content, /打个招呼/);
    assert.match(seen[0].input[1].content, /还没有人说过话/);
    assert.match(seen[0].input[1].content, /登录改版/);
    assert.match(seen[0].input[1].content, /张三：$/);
    const elderSeen = [];
    const elder = await draftMouthpiece(
      service({ listElderTurns: async () => [] }),
      user,
      projectId,
      { scene: "elder", text: "", versionIds: [] },
      modelRequest("老翁，你好。", elderSeen),
    );
    assert.equal(elder.basis, "greet");
    assert.match(elderSeen[0].input[0].content, /向老翁打个招呼/);
    assert.equal(elder.text, "老翁，你好。");
  }));

test("attachments from another project are rejected", async () => {
  await assert.rejects(
    () =>
      draftMouthpiece(
        service({
          version: async () => ({
            id: versionId,
            project_id: "55555555-5555-4555-8555-555555555555",
            filename: "说明.md",
            mime: "text/markdown",
            byte_size: 4,
          }),
        }),
        user,
        projectId,
        { scene: "group", threadId, text: "看附件", versionIds: [versionId] },
        async () => {
          throw new Error("不应调用模型");
        },
      ),
    (error) => error.status === 403,
  );
});

test("a vision failure falls back to a text-only polish", () =>
  withModelEnv(async () => {
    const seen = [];
    const png = Buffer.from("png-bytes");
    const result = await draftMouthpiece(
      service({
        version: async (_user, id, options = {}) => {
          const meta = {
            id,
            project_id: projectId,
            title: "截图",
            filename: "截图.png",
            mime: "image/png",
            byte_size: png.length,
          };
          if (options.includeContent === false) return meta;
          return { ...meta, content: png };
        },
      }),
      user,
      projectId,
      { scene: "elder", text: "看下这张", versionIds: [versionId] },
      modelRequest("这张图我先按登录页来说。", seen, true),
    );
    assert.equal(seen.length, 2);
    assert.equal(seen[0].input[1].content[1].type, "input_image");
    assert.equal(typeof seen[1].input[1].content, "string");
    assert.equal(result.text, "这张图我先按登录页来说。");
  }));
