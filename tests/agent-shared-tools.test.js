import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { createAgentTools } from "../server/agent-tools.js";
import { createTask, bindChildAgentExecution } from "../server/task-pool.js";

test("小祥 can execute shared sandbox tools while member and Chat permissions remain enforced", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    const viewer = { id: randomUUID(), kind: "session" };
    for (const member of [user, viewer]) {
      await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
        member.id,
        `${member.id}@example.test`,
        "共享工具测试",
      ]);
    }
    const service = new Service(db);
    const project = await service.createProject(user, { name: "共享工具" });
    await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'viewer')", [
      project.id,
      viewer.id,
    ]);
    const thread = await service.createThread(user, project.id, { title: "共享插件" });
    const message = await service.postMessage(user, thread.id, { body: "共享工具回归测试" });
    const job = { message_id: message.id, thread_id: thread.id };
    let calls = 0;
    const options = {
      role: "coordinator",
      xiaoxiangSessionId: thread.id,
      getSandbox: async () => ({
        commands: {
          run: async () => {
            calls++;
            return { exitCode: 0, stdout: "verified", stderr: "" };
          },
        },
      }),
    };
    const output = await createAgentTools(
      service,
      user,
      job,
      options,
    )("sandbox_command", { command: "fixture" }, { sessionId: thread.id });
    assert.equal(output.stdout, "verified");
    assert.equal(calls, 1);
    await assert.rejects(
      createAgentTools(
        service,
        user,
        { ...job, kind: "child_result", author_id: user.id },
        options,
      )(
        "create_task",
        {
          taskType: "formal",
          targetType: "human_member",
          targetId: user.id,
          title: "未经授权的指派",
          goal: "必须拒绝",
        },
        { sessionId: randomUUID() },
      ),
      (error) => error.status === 403,
    );
    const [created] = await query(db, "SELECT COUNT(*) count FROM agent_tasks WHERE project_id=?", [
      project.id,
    ]);
    assert.equal(Number(created.count), 0);
    await assert.rejects(
      createAgentTools(service, viewer, job, options)("sandbox_command", { command: "fixture" }),
      (error) => error.status === 403,
    );
    await assert.rejects(
      createAgentTools(
        service,
        user,
        { ...job, dialogue_mode: "chat" },
        options,
      )("sandbox_command", { command: "fixture" }),
      (error) => error.status === 403,
    );
    assert.equal(calls, 1);
  } finally {
    await database.close();
  }
});

test("shared task tools allow a bound child to inspect its work without borrowing human authorization", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@example.test`,
      "任务范围",
    ]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "共享任务插件" });
    const thread = await service.createThread(user, project.id, { title: "任务归属" });
    const sessionId = randomUUID(),
      childId = randomUUID();
    await query(db, "INSERT INTO agent_sessions(thread_id,session_id) VALUES(?,?)", [
      thread.id,
      sessionId,
    ]);
    const message = await service.postMessage(user, thread.id, { body: "仅用于独立测试库" });
    const taskInput = {
      projectId: project.id,
      originThreadId: thread.id,
      sourceType: "human_member",
      sourceUserId: user.id,
      createdByType: "xiaoxiang",
      createdById: sessionId,
      taskType: "formal",
      title: "执行工作",
      goal: "检查范围",
      targetType: "xiaoxiang",
      targetId: sessionId,
    };
    const own = await createTask(db, taskInput);
    await bindChildAgentExecution(db, sessionId, childId, own.id);
    const other = await createTask(db, { ...taskInput, title: "其他工作" });
    const call = createAgentTools(
      service,
      user,
      { thread_id: thread.id, message_id: message.id, author_id: user.id },
      { role: "coordinator", xiaoxiangSessionId: sessionId },
    );
    const caller = { sessionId: childId };
    const inspected = await call("inspect_task", { taskId: own.id }, caller);
    assert.ok(inspected);
    await assert.rejects(
      call("inspect_task", { taskId: other.id }, caller),
      (error) => error.status === 403,
    );
    await assert.rejects(
      call(
        "create_task",
        {
          taskType: "formal",
          targetType: "human_member",
          targetId: user.id,
          title: "未授权指派",
          goal: "禁止借用父调用的授权",
        },
        caller,
      ),
      (error) => error.status === 403,
    );
    const followup = await call(
      "create_task",
      {
        taskType: "formal",
        targetType: "xiaoxiang",
        targetId: sessionId,
        title: "关联后续工作",
        goal: "保持任务来源",
      },
      caller,
    );
    const [stored] = await query(
      db,
      "SELECT source_type,source_task_id,created_by_type FROM agent_tasks WHERE id=?",
      [followup.id],
    );
    assert.equal(stored.source_type, "task");
    assert.equal(stored.source_task_id, own.id);
    assert.equal(stored.created_by_type, "xiaoxiang");
  } finally {
    await database.close();
  }
});

test("a child keeps the dialogue mode pinned at bind time after the shared job changes", async () => {
  const database = await testDatabase();
  const db = database.db;
  try {
    const user = { id: randomUUID(), kind: "session" };
    await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')", [
      user.id,
      `${user.id}@example.test`,
      "模式钉住",
    ]);
    const service = new Service(db);
    const project = await service.createProject(user, { name: "模式钉住" });
    const thread = await service.createThread(user, project.id, { title: "只读来源" });
    const sessionId = randomUUID();
    const childId = randomUUID();
    await query(db, "INSERT INTO agent_sessions(thread_id,session_id) VALUES(?,?)", [
      thread.id,
      sessionId,
    ]);
    const message = await service.postMessage(user, thread.id, {
      body: "@小祥 只读问答",
    });
    await query(db, "UPDATE agent_requests SET dialogue_mode='chat' WHERE message_id=?", [
      message.id,
    ]);
    const task = await createTask(db, {
      projectId: project.id,
      originThreadId: thread.id,
      sourceType: "human_member",
      sourceUserId: user.id,
      sourceMessageId: message.id,
      createdByType: "xiaoxiang",
      createdById: sessionId,
      taskType: "formal",
      title: "只读来源任务",
      goal: "不能因为父会话切到 default 就写入",
      targetType: "xiaoxiang",
      targetId: sessionId,
    });
    await bindChildAgentExecution(db, sessionId, childId, task.id);
    const [pinned] = await query(
      db,
      "SELECT source_message_id,dialogue_mode FROM agent_task_execution_runs WHERE executor_id=?",
      [childId],
    );
    assert.equal(pinned.source_message_id, message.id);
    assert.equal(pinned.dialogue_mode, "chat");
    const job = { thread_id: thread.id, message_id: message.id, dialogue_mode: "chat" };
    const call = createAgentTools(service, user, job, {
      role: "coordinator",
      xiaoxiangSessionId: sessionId,
      getSandbox: async () => ({
        commands: { run: async () => ({ exitCode: 0, stdout: "wrote", stderr: "" }) },
      }),
    });
    job.dialogue_mode = "default";
    await assert.rejects(
      call("sandbox_command", { command: "fixture" }, { sessionId: childId }),
      (error) => error.status === 403 && /Chat 只读/.test(error.message),
    );
  } finally {
    await database.close();
  }
});
