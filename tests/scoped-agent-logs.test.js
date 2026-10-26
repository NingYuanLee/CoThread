import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./database.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { createTask } from "../server/task-pool.js";

test("agent logs are isolated by project, iteration, and task without exposing raw payloads", async () => {
  const database = await testDatabase();
  try {
    const user = { id: randomUUID(), kind: "session" };
    const outsider = { id: randomUUID(), kind: "session" };
    for (const actor of [user, outsider])
      await query(
        database.db,
        "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,'unused')",
        [actor.id, `${actor.id}@test.com`, actor === user ? "成员" : "外部成员"],
      );
    const service = new Service(database.db);
    const project = await service.createProject(user, { name: "分层日志" });
    const thread = await service.createThread(user, project.id, { title: "当前迭代" });
    const message = await service.postMessage(user, thread.id, { body: "记录运行过程" });
    await query(
      database.db,
      "INSERT INTO agent_requests(message_id,status,dialogue_mode) VALUES(?,'completed','chat') " +
        "ON DUPLICATE KEY UPDATE status='completed',dialogue_mode=VALUES(dialogue_mode)",
      [message.id],
    );
    const xiaoxiangSessionId = randomUUID();
    // 小祥每次运行都会换 DSH 会话：轨迹必须按迭代聚合，不能只认 agent_sessions.session_id。
    const rotatedSessionId = randomUUID();
    const childSessionId = randomUUID();
    await query(
      database.db,
      "INSERT INTO agent_sessions(thread_id,session_id) VALUES(?,?) ON DUPLICATE KEY UPDATE session_id=VALUES(session_id)",
      [thread.id, xiaoxiangSessionId],
    );
    const taskA = await createTask(database.db, {
      projectId: project.id,
      originThreadId: thread.id,
      sourceType: "human_member",
      sourceUserId: user.id,
      sourceMessageId: message.id,
      createdByType: "xiaoxiang",
      createdById: xiaoxiangSessionId,
      taskType: "assist",
      title: "任务 A",
      goal: "读取资料",
      targetType: "xiaoxiang",
      targetId: xiaoxiangSessionId,
    });
    const taskB = await createTask(database.db, {
      projectId: project.id,
      originThreadId: thread.id,
      sourceType: "human_member",
      sourceUserId: user.id,
      sourceMessageId: message.id,
      createdByType: "xiaoxiang",
      createdById: xiaoxiangSessionId,
      taskType: "assist",
      title: "任务 B",
      goal: "写入资料",
      targetType: "xiaoxiang",
      targetId: xiaoxiangSessionId,
    });
    await query(
      database.db,
      `UPDATE agent_task_execution_runs SET executor_id=?,status='completed',
      started_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 10 SECOND),finished_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 5 SECOND)
      WHERE task_id=?`,
      [childSessionId, taskA.id],
    );
    await query(
      database.db,
      `UPDATE agent_task_execution_runs SET executor_id=?,status='running',started_at=UTC_TIMESTAMP(3)
      WHERE task_id=?`,
      [childSessionId, taskB.id],
    );
    await query(
      database.db,
      `INSERT INTO agent_events
      (message_id,agent_session_id,agent_task_id,tool,status,input,output,created_at,finished_at) VALUES
      (?,?,?,'list_agents','completed','{"scope":"children"}','private',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)),
      (?,?,NULL,'assistant_text','completed','{}','你好小祥',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)),
      (?,?,?,'sandbox_read','completed','{"path":"a.txt"}','private',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)),
      (?,?,?,'sandbox_write','completed','{"path":"b.txt"}','private',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)),
      (?,?,NULL,'list_documents','completed','{}','private',DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 7 SECOND),DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 6 SECOND)),
      (?,?,NULL,'thinking','completed','{}',NULL,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)),
      (?,?,?,'child_agent','completed','{"label":"任务 A"}','派给子 Agent',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,
      [
        message.id,
        xiaoxiangSessionId,
        taskA.id,
        message.id,
        xiaoxiangSessionId,
        message.id,
        childSessionId,
        taskA.id,
        message.id,
        childSessionId,
        taskB.id,
        message.id,
        childSessionId,
        message.id,
        rotatedSessionId,
        message.id,
        xiaoxiangSessionId,
        taskA.id,
      ],
    );
    await query(
      database.db,
      `INSERT INTO agent_project_events
      (project_id,agent_session_id,task,phase,status,finished_at) VALUES
      (?,?,?,'prepare_context','completed',UTC_TIMESTAMP(3)),
      (?,?,?,'model_run','completed',UTC_TIMESTAMP(3)),
      (?,?,?,'prepare_context','completed',DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 SECOND))`,
      [
        project.id,
        randomUUID(),
        "document_memory",
        project.id,
        randomUUID(),
        "document_memory",
        project.id,
        randomUUID(),
        "member_memory",
      ],
    );

    await assert.rejects(service.agentLogs(user, "project", project.id), { status: 400 });
    const laoweng = await service.agentLogs(user, "project", project.id, {
      task: "document_memory",
    });
    const laowengMember = await service.agentLogs(user, "project", project.id, {
      task: "member_memory",
    });
    const xiaoxiang = await service.agentLogs(user, "thread", thread.id);
    const child = await service.agentLogs(user, "task", taskA.id);
    assert.deepEqual(
      laoweng.events.map((event) => event.agentType),
      ["laoweng", "laoweng"],
    );
    assert.deepEqual(
      laoweng.events.map((event) => event.task),
      ["document_memory", "document_memory"],
    );
    assert.deepEqual(
      laoweng.events.map((event) => event.messageId),
      ["laoweng:1", "laoweng:1"],
    );
    assert.equal(laoweng.inputs.length, 1);
    assert.equal(laoweng.inputs[0].messageId, "laoweng:1");
    assert.equal(laoweng.inputs[0].preview, "文档摘要");
    assert.equal(laowengMember.inputs.length, 1);
    assert.equal(laowengMember.inputs[0].preview, "成员发言");
    assert.ok(laowengMember.events.every((event) => event.task === "member_memory"));
    // 小祥的轮次按迭代聚合：rotatedSessionId（另一次运行的会话）也进来；子 Agent 会话的
    // sandbox_read/sandbox_write/list_documents 被排除；小祥自己的 child_agent 派发记录保留。
    assert.deepEqual(
      xiaoxiang.events.map((event) => event.tool),
      ["child_agent", "thinking", "assistant_text", "list_agents"],
    );
    assert.equal(
      xiaoxiang.events.some((event) => event.tool === "sandbox_read"),
      false,
    );
    assert.equal(xiaoxiang.events.find((event) => event.tool === "child_agent").taskId, taskA.id);
    const reply = xiaoxiang.events.find((event) => event.tool === "assistant_text");
    assert.equal(reply.preview, "你好小祥");
    assert.equal(
      "preview" in xiaoxiang.events.find((event) => event.tool === "list_agents"),
      false,
    );
    // 轨迹补字段：三个作用域各自带同源的 systemPrompt 与可用工具名单；老翁维护任务只能调用 beijing_time。
    assert.match(laoweng.systemPrompt, /项目记忆维护/);
    assert.deepEqual(laoweng.tools, ["beijing_time"]);
    assert.match(xiaoxiang.systemPrompt, /小祥/);
    assert.ok(xiaoxiang.tools.includes("list_messages"));
    assert.equal(xiaoxiang.tools.includes("post_message"), false);
    assert.match(child.systemPrompt, /子 Agent/);
    assert.ok(child.tools.includes("sandbox_read"));
    assert.equal("usage" in reply, false);
    assert.deepEqual(
      new Set(child.events.map((event) => event.tool)),
      new Set(["sandbox_read", "list_documents"]),
    );
    assert.ok(child.events.every((event) => event.taskId === taskA.id));
    for (const result of [laoweng, xiaoxiang, child])
      for (const event of result.events) {
        assert.equal("input" in event, false);
        assert.equal("output" in event, false);
        assert.equal("reasoning" in event, false);
      }
    assert.equal(xiaoxiang.inputs.length, 1);
    assert.equal(xiaoxiang.inputs[0].messageId, message.id);
    assert.equal(xiaoxiang.inputs[0].preview, "记录运行过程");
    // 每个 input 带本轮对话模式；没有 agent_requests 记录的作用域为 null。
    assert.equal(xiaoxiang.inputs[0].dialogueMode, "chat");
    assert.equal(laoweng.inputs[0].dialogueMode, null);
    assert.ok(xiaoxiang.events.every((event) => event.messageId === message.id));
    // 用量：assistant_replies 的整轮 usage_stats 只落到收尾的 assistant_final 上，且只落一条，
    // 避免前端按事件累加 tokens 时把同一轮算多次。
    await query(
      database.db,
      "INSERT INTO assistant_replies(message_id,status,usage_stats) VALUES(?,'completed',?) " +
        "ON DUPLICATE KEY UPDATE status='completed',usage_stats=VALUES(usage_stats)",
      [
        message.id,
        JSON.stringify({
          inputTokens: 120,
          outputTokens: 45,
          totalTokens: 165,
          cacheReadTokens: 30,
          executionDurationMs: 900,
        }),
      ],
    );
    await query(
      database.db,
      `INSERT INTO agent_events(message_id,agent_session_id,tool,status,input,output,created_at,finished_at)
       VALUES(?,?,'assistant_final','completed','{}','记录好了',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,
      [message.id, xiaoxiangSessionId],
    );
    const withUsage = await service.agentLogs(user, "thread", thread.id);
    const finalEvent = withUsage.events.find((event) => event.tool === "assistant_final");
    // 事件用量按 eventUsageFromReply 白名单投影：cacheReadTokens 保留，executionDurationMs 不进事件用量。
    assert.deepEqual(finalEvent.usage, {
      inputTokens: 120,
      outputTokens: 45,
      totalTokens: 165,
      cacheReadTokens: 30,
    });
    assert.equal(withUsage.events.filter((event) => event.usage).length, 1);
    await assert.rejects(service.agentLogs(outsider, "project", project.id), { status: 403 });
    await assert.rejects(service.agentLogs(outsider, "thread", thread.id), { status: 403 });
    await assert.rejects(service.agentLogs(outsider, "task", taskA.id), { status: 403 });
  } finally {
    await database.close();
  }
});
