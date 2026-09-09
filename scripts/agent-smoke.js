import { createDatabase, query } from "../server/db.js";
import { Service } from "../server/service.js";
import { generateAgentReply } from "../server/agent.js";
const db = await createDatabase();
try {
  const [record] = await query(db, "SELECT id FROM users WHERE email=?", [
    process.env.ADMIN_EMAIL,
  ]);
  const user = { ...record, kind: "session" };
  const service = new Service(db);
  const project = (await service.projects(user))[0];
  const existing = (await service.project(user, project.id)).threads.find(
    (t) => t.title === "Agent 能力验收" && t.status === "active",
  );
  const thread =
    existing ||
    (await service.createThread(user, project.id, { title: "Agent 能力验收" }));
  const body = process.argv.includes("--resume")
    ? "会话恢复检查：简短说出之前生成的文档名称，不调用工具，不修改文档。"
    : process.argv.includes("--followup")
      ? "继续刚才的工作：从文档库读取你提交的 Python 文件，修改为支持任意个整数求和，再在 ACS 中运行测试，作为原文档的新版本保存。明确报告 v2 的文档 ID。"
      : "这是 Agent 能力验收：先读取本项目的文档目录并读取一份真实文档，然后在 ACS 中创建 sum_check.py，实现 sum_two(a,b)，用断言测试 2+3=5 和 -1+1=0，实际运行 Python 测试。将脚本作为文档「Agent 求和示例」提交到项目文档库，最后报告真实执行结果和保存的版本 ID。不要只给代码片段。";
  const message = await service.postMessage(user, thread.id, { body });
  await query(
    db,
    "INSERT INTO assistant_replies(message_id,status) VALUES(?,'running')",
    [message.id],
  );
  const context = await service.context(user, thread.id);
  const job = {
    message_id: message.id,
    thread_id: thread.id,
    author_id: user.id,
    sequence: context.messages.at(-1).sequence,
  };
  console.log("Agent validation started", {
    threadId: thread.id,
    messageId: message.id,
  });
  try {
    const text = await generateAgentReply(context, { db, job, user });
    const reply = await service.insertMessage(
      db,
      user,
      thread.id,
      text,
      [],
      "assistant",
    );
    await query(
      db,
      "UPDATE assistant_replies SET status='completed',reply_id=?,finished_at=UTC_TIMESTAMP(3) WHERE message_id=?",
      [reply.id, message.id],
    );
    console.log("Agent validation succeeded:", text);
  } catch (error) {
    await query(
      db,
      "UPDATE assistant_replies SET status='failed',error='Agent 验收失败，正在修复',finished_at=UTC_TIMESTAMP(3) WHERE message_id=?",
      [message.id],
    );
    let detail = String(error.stack || error);
    for (const key of ["DEEPSEEK_API_KEY", "E2B_API_KEY"])
      if (process.env[key])
        detail = detail.split(process.env[key]).join("[REDACTED]");
    console.error(detail);
    process.exitCode = 1;
  }
} finally {
  await db.end();
}
