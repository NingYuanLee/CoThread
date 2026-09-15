import { test } from "node:test";
import assert from "node:assert/strict";
import { describeAgentAction as label } from "../shared/agent-label.js";
import { coordinatorLogButtonLabel } from "../web/agent-label.ts";
import { trackThinking } from "../server/agent-thinking.js";

test("action labels distinguish scripts from shell commands without inventing web tools", () => {
  for (const command of [
    "python3 test.py",
    'python -u "my script.py"',
    "node src/main.mjs",
    "bash ./build.sh",
    "./test.py",
  ])
    assert.equal(
      label("sandbox_command", { command }).action,
      "运行脚本",
      command,
    );
  for (const command of [
    "pip install pandas",
    "python3 -m pytest",
    'python3 -c "print(1)"',
    "python3 test.py && echo done",
    "python3 test.py\nls",
    "curl https://example.com",
    "python3 - <<PY\nprint(1)\nPY",
  ])
    assert.equal(
      label("sandbox_command", { command }).action,
      "运行命令",
      command,
    );
  const path =
    "/workspace/a-very-long-project-directory/src/deeply/nested/report.test.py";
  assert.deepEqual(label("sandbox_read", { path }), {
    action: "读取文件",
    target: "…/report.test.py",
    full: path,
  });
  assert.equal(
    label("sandbox_command", { command: `python3 ${path}` }).full,
    `python3 ${path}`,
  );
  assert.equal(
    label("read_document", {}, { filename: "README.md", version: 2 }).target,
    "README.md · v2",
  );
  assert.deepEqual(label("web_fetch", { url: "https://example.com/page" }), {
    action: "读取网页",
    target: "https://example.com/page",
    full: "https://example.com/page",
  });
  assert.equal(label("post_message").action, "发言");
  assert.equal(label("list_project_tasks").action, "查看任务");
  assert.equal(label("finish_turn").action, "结束本轮");
  assert.equal(label("thinking").action, "思考");
});

test("thinking lifecycle records phases once, omits content, and closes interruptions", async () => {
  const writes = [];
  let id = 0;
  const db = {
    async execute(sql, params) {
      writes.push({ sql, params });
      return [{ affectedRows: 1, insertId: ++id }];
    },
  };
  const tracker = trackThinking(db, "message", "session");
  const notify = (type, sessionId = "session") =>
    tracker.notify({
      method: "session.event",
      params: {
        sessionId,
        event: { type, data: { text: "private reasoning must not be logged" } },
      },
    });
  notify("step/start", "other");
  notify("step/start");
  notify("step/start");
  notify("assistant/chunk");
  notify("assistant/message");
  await tracker.flush();
  assert.equal(writes.filter((x) => x.sql.startsWith("INSERT INTO agent_events")).length, 1);
  assert.equal(
    writes.filter((x) => x.sql.startsWith("UPDATE agent_events SET status"))[0].params[0],
    "completed",
  );
  notify("step/start");
  await tracker.close("failed");
  assert.equal(writes.filter(x => x.sql.startsWith('UPDATE agent_events SET status')).at(-1).params[0], "failed");
  assert.ok(!JSON.stringify(writes).includes("private reasoning"));
});

test("each completed assistant text return is published, thinking is not", async () => {
  const db = {
    async execute() {
      return [{ affectedRows: 1, insertId: 1 }];
    },
  };
  const published = [];
  const tracker = trackThinking(db, "message", "session", { onVisibleText: async (text) => published.push(text) });
  const notify = (type, data = {}) => tracker.notify({
    method: "session.event",
    params: { sessionId: "session", event: { type, data } },
  });
  const chunk = (type, text) => notify("assistant/chunk", { chunk: { type, text } });
  notify("step/start");
  chunk("reasoning-delta", "内部思考");
  chunk("text-delta", "第一句给成员看。");
  notify("tool/call");
  notify("step/start");
  chunk("text-delta", "第二句给成员看。");
  notify("assistant/message");
  await tracker.close("completed", "第二句给成员看。");
  assert.deepEqual(published, ["第一句给成员看。", "第二句给成员看。"]);
});

test("wait/finish companion text is thinking, not a group post", async () => {
  const writes = [];
  const db = {
    async execute(sql, params) {
      writes.push({ sql, params });
      return [{ affectedRows: 1, insertId: writes.length }];
    },
  };
  const published = [];
  const tracker = trackThinking(db, "message", "session", { onVisibleText: async (text) => published.push(text) });
  const notify = (type, data = {}) => tracker.notify({
    method: "session.event",
    params: { sessionId: "session", event: { type, data } },
  });
  const chunk = (type, text) => notify("assistant/chunk", { chunk: { type, text } });
  notify("step/start");
  chunk("text-delta", "给成员看。");
  notify("assistant/message");
  notify("step/start");
  chunk("text-delta", "已进入等待。");
  notify("tool/call", { name: "wait_for_updates" });
  await tracker.close("completed");
  assert.deepEqual(published, ["给成员看。"]);
  assert.ok(writes.some((write) => write.params?.[2] === "thinking" && write.params?.[1] === "已进入等待。"));
});

test("conversation log button follows the live L2 event name", () => {
  const replies = [{ message_id: "m1", parent_message_id: null, status: "completed", progress: null }];
  assert.equal(coordinatorLogButtonLabel({ replies, events: [] }), "轨迹");
  replies[0].status = "running";
  replies[0].progress = "正在准备上下文";
  assert.equal(coordinatorLogButtonLabel({ replies, events: [] }), "正在准备上下文");
  assert.equal(coordinatorLogButtonLabel({
    replies, events: [{ id: "1", message_id: "m1", tool: "thinking", status: "running" }],
  }), "正在思考");
  assert.equal(coordinatorLogButtonLabel({
    replies, events: [
      { id: "1", message_id: "m1", tool: "thinking", status: "completed" },
      { id: "2", message_id: "m1", tool: "list_project_tasks", status: "running" },
    ],
  }), "查看任务");
  assert.equal(coordinatorLogButtonLabel({
    replies, events: [{ id: "2", message_id: "m1", tool: "post_message", status: "running" }],
  }), "发言");
  assert.equal(coordinatorLogButtonLabel({
    replies, events: [], liveOutput: { m1: { reasoning: "…" } },
  }), "正在思考");
  assert.equal(coordinatorLogButtonLabel({
    replies: [{ message_id: "m1", parent_message_id: null, status: "completed", progress: null }],
    events: [], compactStatus: "running",
  }), "正在整理上下文");
});
