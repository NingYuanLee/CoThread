import { test } from "node:test";
import assert from "node:assert/strict";
import { describeAgentAction as label } from "../shared/agent-label.js";
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
