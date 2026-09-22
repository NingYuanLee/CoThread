import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { acceptTask, acknowledgeTaskRejection, answerTaskQuestion, askTaskQuestion, bindDshL3Execution, cancelTask, composeTaskInstruction, createTask, ensureDshL3CanUpdate, getTask, inspectIterationTask, listTaskExecutionRuns, listTaskStatusEvents, listTasks, reassignTask, recoverAbnormalTask, recoverInterruptedDshL3Executions, reconcileEndedTaskRuns, rejectTask, reopenRejectedTask, settleDshL3Execution, taskRejectionReview, updateTask } from "../server/task-pool.js";
import { testDatabase } from "./database.js";

let database, db, service, project, thread, users, l2SessionId, reportHostId;

before(async () => {
  database = await testDatabase();
  db = database.db;
  service = new Service(db);
  users = Array.from({ length: 3 }, (_, index) => ({ id: randomUUID(), kind: "session", name: `成员${index + 1}` }));
  for (const user of users) await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
    [user.id, `${user.id}@task.test`, user.name, "unused"]);
  project = await service.createProject(users[0], { name: "任务池测试" });
  for (const user of users.slice(1)) await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'member')", [project.id, user.id]);
  thread = await service.createThread(users[0], project.id, { title: "任务池迭代" });
  l2SessionId = randomUUID();
  await query(db, "INSERT INTO agent_sessions(thread_id,session_id) VALUES(?,?)", [thread.id, l2SessionId]);
  reportHostId = randomUUID();
  await query(db, "INSERT INTO messages(id,thread_id,author_id,source,body,refs) VALUES(?,?,?,'human','host','[]')",
    [reportHostId, thread.id, users[0].id]);
});

after(async () => { await database?.close(); });

const reportL3 = (childId, summary, status = "completed") => query(db,
  `INSERT INTO agent_events(message_id,agent_session_id,tool,status,input) VALUES(?,?,?,'completed',?)`,
  [reportHostId, childId, "report_task", JSON.stringify({ status, summary })]);

const formalTask = (targetId, overrides = {}) => createTask(db, {
  projectId: project.id,
  originThreadId: thread.id,
  sourceType: "human_member",
  sourceUserId: users[0].id,
  createdByType: "l2_session",
  createdById: l2SessionId,
  authorizedByUserId: users[0].id,
  taskType: "formal",
  title: "完成验收任务",
  goal: "完成实现并给出验证结果",
  targetType: "human_member",
  targetId,
  ...overrides,
});

test("task source, creator, target, claimant and executor remain separate", async () => {
  const task = await formalTask(users[1].id);
  assert.equal(task.source_user_id, users[0].id);
  assert.equal(task.created_by_type, "l2_session");
  assert.equal(task.created_by_id, l2SessionId);
  assert.equal(task.target_id, users[1].id);
  assert.equal(task.claimed_by_id, null);
  assert.equal(task.execution_agent_type, null);

  const accepted = await acceptTask(db, task.id, { type: "human_member", id: users[1].id }, "human_direct");
  assert.equal(accepted.claimed_by_id, users[1].id);
  assert.equal(accepted.execution_agent_type, "human_self");
  assert.equal(accepted.execution_agent_id, users[1].id);
});

test("only the current target can accept, update or reassign", async () => {
  const task = await formalTask(users[1].id);
  await assert.rejects(acceptTask(db, task.id, { type: "human_member", id: users[2].id }, "human_direct"), { status: 403 });
  await assert.rejects(reassignTask(db, task.id, { type: "human_member", id: users[2].id }, { type: "human_member", id: users[0].id }), { status: 403 });
  const accepted = await acceptTask(db, task.id, { type: "human_member", id: users[1].id }, "human_direct");
  await assert.rejects(updateTask(db, task.id, { type: "human_member", id: users[2].id }, { status: "completed" }), { status: 403 });
});

test("online connector is the automatic executor and creates an adapter", async () => {
  const connectorId = randomUUID();
  await query(db, `INSERT INTO connectors(id,user_id,name,platform,version,token_hash,last_seen_at)
    VALUES(?,?,?,'windows','1.0.0',?,UTC_TIMESTAMP(3))`, [connectorId, users[1].id, "本机 Agent", randomUUID()]);
  await query(db, "INSERT INTO connector_projects(connector_id,project_id,policy,allow_git_push) VALUES(?,?,'unrestricted',FALSE)", [connectorId, project.id]);
  const task = await formalTask(users[1].id, { title: "连接器任务" });
  const accepted = await acceptTask(db, task.id, { type: "human_member", id: users[1].id }, "auto");
  assert.equal(accepted.execution_agent_type, "human_connector");
  assert.equal(accepted.execution_agent_id, connectorId);
  const [adapter] = await query(db, "SELECT agent_task_id,message_id,requested_by,assigned_to,status FROM connector_tasks WHERE agent_task_id=?", [task.id]);
  assert.equal(adapter.agent_task_id, task.id);
  assert.equal(adapter.message_id, null);
  assert.equal(adapter.requested_by, users[0].id);
  assert.equal(adapter.assigned_to, users[1].id);
  assert.equal(adapter.status, "queued");
});

test("human self execution follows the task instead of cancelling as an unbound L3", async () => {
  const direct = await formalTask(users[1].id, { title: "本人直接完成" });
  const accepted = await acceptTask(db, direct.id, { type: "human_member", id: users[1].id }, "human_direct");
  assert.equal(accepted.status, "running");
  const finished = await updateTask(db, direct.id, { type: "human_member", id: users[1].id }, {
    status: "completed", resultSummary: "验收材料已提交",
  });
  assert.equal(finished.status, "completed");
  const [directRun] = await query(db, "SELECT executor_type,executor_id,status,error,result_summary FROM agent_task_execution_runs WHERE task_id=?", [direct.id]);
  assert.equal(directRun.executor_type, "human_self");
  assert.equal(directRun.executor_id, users[1].id);
  assert.equal(directRun.status, "completed");
  assert.equal(directRun.error, null);
  assert.equal(directRun.result_summary, "验收材料已提交");

  const started = await formalTask(users[1].id, { title: "本人先开始再完成" });
  await acceptTask(db, started.id, { type: "human_member", id: users[1].id }, "human_direct");
  const [liveRun] = await query(db, "SELECT status FROM agent_task_execution_runs WHERE task_id=?", [started.id]);
  assert.equal(liveRun.status, "running");
  await updateTask(db, started.id, { type: "human_member", id: users[1].id }, { status: "completed", resultSummary: "已交付" });
  const [doneRun] = await query(db, "SELECT status,error,result_summary FROM agent_task_execution_runs WHERE task_id=?", [started.id]);
  assert.equal(doneRun.status, "completed");
  assert.equal(doneRun.error, null);
  assert.equal(doneRun.result_summary, "已交付");
});

test("historical human runs cancelled as unbound L3 are repaired to the task outcome", async () => {
  const completed = await formalTask(users[1].id, { title: "历史误标完成" });
  await acceptTask(db, completed.id, { type: "human_member", id: users[1].id }, "human_direct");
  await query(db, `UPDATE agent_tasks SET status='completed',result_summary='本人已交付',
    finished_at=UTC_TIMESTAMP(3) WHERE id=?`, [completed.id]);
  await query(db, `UPDATE agent_task_execution_runs SET status='cancelled',error='任务已结束，L3 未启动',
    result_summary=NULL WHERE task_id=?`, [completed.id]);
  const cancelled = await formalTask(users[1].id, { title: "历史误标取消" });
  await acceptTask(db, cancelled.id, { type: "human_member", id: users[1].id }, "human_direct");
  await query(db, `UPDATE agent_tasks SET status='cancelled',finished_at=UTC_TIMESTAMP(3) WHERE id=?`, [cancelled.id]);
  await query(db, `UPDATE agent_task_execution_runs SET status='cancelled',error='任务已结束，L3 未启动' WHERE task_id=?`,
    [cancelled.id]);
  assert.ok(await reconcileEndedTaskRuns(db));
  const [fixedCompleted] = await query(db, "SELECT status,error,result_summary FROM agent_task_execution_runs WHERE task_id=?", [completed.id]);
  assert.equal(fixedCompleted.status, "completed");
  assert.equal(fixedCompleted.error, null);
  assert.equal(fixedCompleted.result_summary, "本人已交付");
  const [fixedCancelled] = await query(db, "SELECT status,error FROM agent_task_execution_runs WHERE task_id=?", [cancelled.id]);
  assert.equal(fixedCancelled.status, "cancelled");
  assert.equal(fixedCancelled.error, null);
});

test("bound connector is the automatic executor even if recently seen stale", async () => {
  await query(db, "UPDATE connectors SET last_seen_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 2 MINUTE) WHERE user_id=?", [users[1].id]);
  const task = await formalTask(users[1].id, { title: "离线任务" });
  const accepted = await acceptTask(db, task.id, { type: "human_member", id: users[1].id }, "auto");
  assert.equal(accepted.execution_agent_type, "human_connector");
  assert.equal(accepted.status, "pending_start");
});

test("explicit connector mode explains what blocks it", async () => {
  const actor = { type: "human_member", id: users[2].id };
  const unpaired = await formalTask(users[2].id, { title: "无连接器" });
  await assert.rejects(acceptTask(db, unpaired.id, actor, "member_connector"), { status: 409, message: /没有已授权的本机连接器/ });
  const connectorId = randomUUID();
  await query(db, `INSERT INTO connectors(id,user_id,name,platform,version,token_hash,last_seen_at)
    VALUES(?,?,?,'windows','1.0.0',?,DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 2 MINUTE))`, [connectorId, users[2].id, "本机 Agent", randomUUID()]);
  await assert.rejects(acceptTask(db, unpaired.id, actor, "member_connector"), { status: 409, message: /连接器当前离线/ });
  await query(db, "UPDATE connectors SET last_seen_at=UTC_TIMESTAMP(3) WHERE id=?", [connectorId]);
  await assert.rejects(acceptTask(db, unpaired.id, actor, "member_connector"), { status: 409, message: /尚未绑定当前项目/ });
  await query(db, "INSERT INTO connector_projects(connector_id,project_id,policy,allow_git_push) VALUES(?,?,'unrestricted',FALSE)", [connectorId, project.id]);
  const accepted = await acceptTask(db, unpaired.id, actor, "member_connector");
  assert.equal(accepted.execution_agent_type, "human_connector");
  assert.equal(accepted.execution_agent_id, connectorId);
  await query(db, "DELETE FROM connector_projects WHERE connector_id=?", [connectorId]);
  await query(db, "DELETE FROM connectors WHERE id=?", [connectorId]);
});

test("current human target can transfer a task to the iteration L2", async () => {
  const task = await formalTask(users[1].id, { title: "转给小祥" });
  const reassigned = await reassignTask(db, task.id, { type: "human_member", id: users[1].id }, { type: "l2_session", id: l2SessionId }, "交给小祥处理");
  assert.equal(reassigned.target_type, "l2_session");
  assert.equal(reassigned.target_id, l2SessionId);
  assert.equal(reassigned.claimed_by_id, l2SessionId);
  assert.equal(reassigned.status, "running");
  const runs = await query(db, "SELECT status,executor_id FROM agent_task_execution_runs WHERE task_id=?", [task.id]);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, "queued");
  assert.equal(runs[0].executor_id, null);
});

test("L2 can transfer formal work but cannot hand an assist task to a human", async () => {
  const formal = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "formal", title: "L2 转交正式任务",
    goal: "交给成员执行", targetType: "l2_session", targetId: l2SessionId,
  });
  const transferred = await reassignTask(db, formal.id, { type: "l2_session", id: l2SessionId, authorizedByUserId: users[0].id },
    { type: "human_member", id: users[2].id }, "更适合由成员完成");
  assert.equal(transferred.target_id, users[2].id);
  assert.equal(transferred.status, "awaiting_acceptance");

  const assist = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "task", sourceTaskId: formal.id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "assist_l2", title: "不可外转的辅助任务",
    goal: "保持 L2 私有", targetType: "l2_session", targetId: l2SessionId,
  });
  await assert.rejects(reassignTask(db, assist.id, { type: "l2_session", id: l2SessionId },
    { type: "human_member", id: users[1].id }), { status: 403 });
});

test("assist tasks start running and return a compact result to their source task", async () => {
  const formal = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "formal", title: "L2 正式任务",
    goal: "汇总辅助分析", targetType: "l2_session", targetId: l2SessionId,
  });
  const assist = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "task", sourceTaskId: formal.id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "assist_l2", title: "查验资料",
    goal: "只返回关键结论", targetType: "l2_session", targetId: l2SessionId,
  });
  const childId = randomUUID();
  const running = await bindDshL3Execution(db, l2SessionId, childId, assist.id);
  assert.equal(running.status, "running");
  assert.equal(running.execution_agent_id, childId);
  await reportL3(childId, "结论与验证结果");
  const completed = await settleDshL3Execution(db, l2SessionId, childId, {
    status: "ok", stopReason: "completed", lastAssistantMessage: [{ type: "text", text: "结论与验证结果" }],
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.result_summary, "结论与验证结果");
  const [wakeup] = await query(db, "SELECT kind,status FROM coordinator_events WHERE task_id=?", [assist.id]);
  assert.equal(wakeup.kind, "child_result");
  assert.equal(wakeup.status, "queued");
  const [source] = await query(db, "SELECT progress FROM agent_tasks WHERE id=?", [formal.id]);
  assert.equal(source.progress, "辅助 L3 已返回结果，等待 L2 汇总");
  const [update] = await query(db, "SELECT body FROM agent_task_pool_updates WHERE task_id=? ORDER BY created_at DESC LIMIT 1", [formal.id]);
  assert.match(update.body, /结论与验证结果/);
});

test("L3 that stops without report_task is settled as failed and still wakes L2", async () => {
  const assist = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "assist_l2", title: "未交活",
    goal: "必须失败", targetType: "l2_session", targetId: l2SessionId,
  });
  const childId = randomUUID();
  await bindDshL3Execution(db, l2SessionId, childId, assist.id);
  const settled = await settleDshL3Execution(db, l2SessionId, childId, {
    status: "ok", stopReason: "completed", lastAssistantMessage: [{ type: "text", text: "我其实没干完" }],
  });
  assert.equal(settled.status, "failed");
  assert.equal(settled.result_summary, "我其实没干完");
  const [event] = await query(db, "SELECT payload FROM coordinator_events WHERE task_id=? AND kind='child_result'", [assist.id]);
  const payload = typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload;
  assert.equal(payload.status, "failed");
});

test("assist work is running before a DSH L3 child is bound", async () => {
  const assist = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "assist_l2", title: "尚未启动的辅助任务",
    goal: "创建后即为执行中", targetType: "l2_session", targetId: l2SessionId,
  });
  const queuedMonitor = await service.agentMonitor(users[0], project.id);
  const pool = queuedMonitor.taskPool.find((row) => row.task_id === assist.id);
  assert.equal(pool.task_status, "running");
  assert.equal(pool.run_status, "queued");
  assert.equal(pool.executor_id, null);
  assert.equal(queuedMonitor.executors.some((row) => row.task_id === assist.id && row.execution_active), false);

  const childId = randomUUID();
  await bindDshL3Execution(db, l2SessionId, childId, assist.id);
  const live = await service.agentMonitor(users[0], project.id);
  const bound = live.executors.find((row) => row.task_id === assist.id);
  assert.equal(bound.executor_id, childId);
  assert.equal(!!bound.execution_active, true);
  assert.equal(bound.status, "running");
});

test("blocked L3 report keeps task blocked and does not mark the workflow completed", async () => {
  const formal = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "formal", title: "等待源码",
    goal: "没有仓库则阻塞", targetType: "l2_session", targetId: l2SessionId,
  });
  const childId = randomUUID();
  await bindDshL3Execution(db, l2SessionId, childId, formal.id);
  await updateTask(db, formal.id, { type: "dsh_l3", id: childId }, {
    status: "blocked", resultSummary: "等源码", progress: "L3 已阻塞",
  });
  const [closedRun] = await query(db, "SELECT status FROM agent_task_execution_runs WHERE task_id=? ORDER BY created_at DESC LIMIT 1", [formal.id]);
  assert.equal(closedRun.status, "completed");
  await reportL3(childId, "等源码", "blocked");
  const blocked = await settleDshL3Execution(db, l2SessionId, childId, {
    status: "ok", stopReason: "completed", lastAssistantMessage: [{ type: "text", text: "等源码" }],
  });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.result_summary, "等源码");
  const monitor = await service.agentMonitor(users[0], project.id);
  const pool = monitor.taskPool.find((row) => row.task_id === formal.id);
  const executor = monitor.executors.find((row) => row.task_id === formal.id);
  assert.equal(pool.task_status, "blocked");
  assert.equal(pool.run_status, "completed");
  assert.equal(executor.status, "blocked");
  assert.equal(!!executor.execution_active, false);
});

test("L2 can inspect a live L3 run and is told how to ask or replace it", async () => {
  const assist = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "assist_l2", title: "追问进度",
    goal: "执行中可询问", targetType: "l2_session", targetId: l2SessionId,
  });
  const childId = randomUUID();
  await bindDshL3Execution(db, l2SessionId, childId, assist.id);
  await query(db, `INSERT INTO agent_events(message_id,agent_session_id,tool,status,input,output)
    VALUES(?,?,?,'completed',?,'wrote file')`, [reportHostId, childId, "sandbox_write", JSON.stringify({ path: "a.md" })]);
  const snapshot = await inspectIterationTask(db, assist.id, { type: "l2_session", id: l2SessionId });
  assert.equal(snapshot.live, true);
  assert.equal(snapshot.askVia.agentId, childId);
  assert.equal(snapshot.suggestedNext, "ask");
  assert.equal(snapshot.replaceVia.interruptAgentId, childId);
  assert.equal(snapshot.lastEvents.some((event) => event.tool === "sandbox_write"), true);
});

test("a formal task owned by L2 can run on a resumable DSH child", async () => {
  const formal = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "formal", title: "正式云端执行",
    goal: "由 L2 的 DSH L3 完成", targetType: "l2_session", targetId: l2SessionId,
  });
  const childId = randomUUID();
  const running = await bindDshL3Execution(db, l2SessionId, childId, formal.id);
  assert.equal(running.status, "running");
  assert.equal(running.task_type, "formal");
  assert.equal(running.execution_agent_id, childId);
  const [run] = await query(db, "SELECT task_revision,executor_type,executor_id,status FROM agent_task_execution_runs WHERE task_id=?", [formal.id]);
  assert.deepEqual(run, { task_revision: formal.revision, executor_type: "dsh_l3", executor_id: childId, status: "running" });

  await reportL3(childId, "正式任务结果摘要");
  const completed = await settleDshL3Execution(db, l2SessionId, childId, {
    status: "ok", stopReason: "completed", lastAssistantMessage: [{ type: "text", text: "正式任务结果摘要" }],
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.result_summary, "正式任务结果摘要");
  const [finishedRun] = await query(db, "SELECT status,result_summary,executor_id FROM agent_task_execution_runs WHERE task_id=?", [formal.id]);
  assert.deepEqual(finishedRun, { status: "completed", result_summary: "正式任务结果摘要", executor_id: childId });

  const related = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "formal", title: "同来源后续任务",
    goal: "优先续接熟悉该成员的 L3", targetType: "l2_session", targetId: l2SessionId,
  });
  const listed = await listTasks(db, project.id, { limit: 200 });
  assert.equal(listed.find((task) => task.id === related.id).preferred_execution_agent_id, childId);
});

test("the latest human transferor can acknowledge or revise a rejected task", async () => {
  const task = await formalTask(users[1].id, { title: "拒绝后处理" });
  const transferred = await reassignTask(db, task.id, { type: "human_member", id: users[1].id },
    { type: "human_member", id: users[2].id }, "请成员三处理");
  assert.equal(transferred.source_user_id, users[0].id);
  await rejectTask(db, task.id, { type: "human_member", id: users[2].id }, "验收目标不够明确");
  const review = await taskRejectionReview(db, task.id);
  assert.deepEqual(review, { rejected: true, resolved: false, reviewer_type: "human_member", reviewer_id: users[1].id });
  await assert.rejects(acknowledgeTaskRejection(db, task.id, { type: "human_member", id: users[0].id }), { status: 403 });
  const reopened = await reopenRejectedTask(db, task.id, { type: "human_member", id: users[1].id }, {
    goal: "补充清晰验收标准后重新执行", constraints: "全部测试通过", reason: "已补充验收标准",
  });
  assert.equal(reopened.status, "awaiting_acceptance");
  assert.equal(reopened.goal, "补充清晰验收标准后重新执行");
  assert.equal(reopened.source_user_id, users[0].id);
  assert.equal(reopened.created_by_id, l2SessionId);
  assert.equal((await taskRejectionReview(db, task.id)).resolved, true);

  const acknowledgedTask = await formalTask(users[1].id, { title: "仅确认拒绝" });
  await rejectTask(db, acknowledgedTask.id, { type: "human_member", id: users[1].id }, "当前无法承担");
  await acknowledgeTaskRejection(db, acknowledgedTask.id, { type: "l2_session", id: l2SessionId, authorizedByUserId: users[0].id });
  assert.equal((await taskRejectionReview(db, acknowledgedTask.id)).resolved, true);
});

test("every status transition is logged with who changed it and why", async () => {
  const task = await formalTask(users[1].id, { title: "状态轨迹" });
  await reassignTask(db, task.id, { type: "human_member", id: users[1].id }, { type: "human_member", id: users[2].id }, "请成员三处理");
  await rejectTask(db, task.id, { type: "human_member", id: users[2].id }, "验收目标不够明确");
  await reopenRejectedTask(db, task.id, { type: "human_member", id: users[1].id }, { goal: "补充验收标准", reason: "已补充验收标准" });
  await acceptTask(db, task.id, { type: "human_member", id: users[2].id }, "human_direct");
  await updateTask(db, task.id, { type: "human_member", id: users[2].id }, { status: "completed", resultSummary: "已完成" });
  const events = await listTaskStatusEvents(db, task.id);
  assert.deepEqual(events.map((event) => [event.from_status, event.to_status, event.actor_type, event.actor_id, event.reason]), [
    [null, "awaiting_acceptance", "l2_session", l2SessionId, "任务创建"],
    ["awaiting_acceptance", "rejected", "human_member", users[2].id, "验收目标不够明确"],
    ["rejected", "awaiting_acceptance", "human_member", users[1].id, "已补充验收标准"],
    ["awaiting_acceptance", "running", "human_member", users[2].id, "成员接受任务，由本人完成"],
    ["running", "completed", "human_member", users[2].id, "已完成"],
  ]);
});

test("only the latest source member can answer an L2 task question", async () => {
  const task = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "formal", title: "需要澄清",
    goal: "等待来源人确认", targetType: "l2_session", targetId: l2SessionId,
  });
  const question = await askTaskQuestion(db, task.id, { type: "l2_session", id: l2SessionId }, "验收标准是什么？", users[0].id);
  await assert.rejects(answerTaskQuestion(db, question.id, { type: "human_member", id: users[1].id }, "由我回答"), { status: 403 });
  const answered = await answerTaskQuestion(db, question.id, { type: "human_member", id: users[0].id }, "测试全部通过");
  assert.equal(answered.status, "answered");
  assert.equal(answered.answer, "测试全部通过");
});

test("the latest human transferor answers questions without overwriting the original source", async () => {
  const task = await formalTask(users[1].id, { title: "转交后澄清" });
  const transferred = await reassignTask(db, task.id, { type: "human_member", id: users[1].id },
    { type: "l2_session", id: l2SessionId }, "由小祥继续");
  assert.equal(transferred.source_user_id, users[0].id);
  const question = await askTaskQuestion(db, task.id, { type: "l2_session", id: l2SessionId }, "由谁确认？", users[0].id);
  assert.equal(question.source_user_id, users[1].id);
  await assert.rejects(answerTaskQuestion(db, question.id, { type: "human_member", id: users[0].id }, "原始来源回答"), { status: 403 });
  const answered = await answerTaskQuestion(db, question.id, { type: "human_member", id: users[1].id }, "最近转交者回答");
  assert.equal(answered.status, "answered");
});

test("service recovery requeues interrupted L3 work without repeating completed tasks", async () => {
  const runningAssist = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "assist_l2", title: "中断任务",
    goal: "恢复后重新评估", targetType: "l2_session", targetId: l2SessionId,
  });
  await bindDshL3Execution(db, l2SessionId, randomUUID(), runningAssist.id);
  const runningFormal = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "formal", title: "可续接的中断任务",
    goal: "恢复原 DSH L3", targetType: "l2_session", targetId: l2SessionId,
  });
  const formalChild = randomUUID();
  await bindDshL3Execution(db, l2SessionId, formalChild, runningFormal.id);
  const completedAssist = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "assist_l2", title: "已完成任务",
    goal: "不能重复", targetType: "l2_session", targetId: l2SessionId,
  });
  const completedChild = randomUUID();
  await bindDshL3Execution(db, l2SessionId, completedChild, completedAssist.id);
  await reportL3(completedChild, "已完成");
  await settleDshL3Execution(db, l2SessionId, completedChild, {
    status: "ok", stopReason: "completed", lastAssistantMessage: [{ type: "text", text: "已完成" }],
  });
  assert.ok(await recoverInterruptedDshL3Executions(db) >= 2);
  const recoveredRuns = await query(db, "SELECT status,task_revision FROM agent_task_execution_runs WHERE task_id=? ORDER BY created_at,id", [runningAssist.id]);
  const [recoveredTask] = await query(db, "SELECT status,revision,execution_agent_id FROM agent_tasks WHERE id=?", [runningAssist.id]);
  const [stillCompleted] = await query(db, "SELECT status,result_summary FROM agent_tasks WHERE id=?", [completedAssist.id]);
  assert.equal(recoveredRuns.filter((run) => run.status === "interrupted").length, 1);
  assert.equal(recoveredRuns.filter((run) => run.status === "queued").length, 0);
  assert.equal(recoveredTask.status, "pending_assignment");
  assert.equal(recoveredTask.execution_agent_id, null);
  const [recoveredFormal] = await query(db, "SELECT status,execution_agent_id FROM agent_tasks WHERE id=?", [runningFormal.id]);
  const formalRuns = await query(db, "SELECT status,executor_id FROM agent_task_execution_runs WHERE task_id=? ORDER BY created_at,id", [runningFormal.id]);
  assert.deepEqual(recoveredFormal, { status: "pending_assignment", execution_agent_id: formalChild });
  assert.equal(formalRuns.filter((run) => run.status === "interrupted").length, 1);
  assert.equal(formalRuns.filter((run) => run.status === "queued" && run.executor_id === null).length, 0);
  const recoveredListing = await listTasks(db, project.id, { limit: 200 });
  assert.equal(recoveredListing.find((task) => task.id === runningFormal.id).preferred_execution_agent_id, formalChild);
  assert.deepEqual(stillCompleted, { status: "completed", result_summary: "已完成" });
});

test("updating a queued assist task cancels stale revisions and only binds the current run", async () => {
  const assist = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "assist_l2", title: "修订后执行",
    goal: "只允许最新 revision 执行", targetType: "l2_session", targetId: l2SessionId,
  });
  const [oldRun] = await query(db, "SELECT id,task_revision FROM agent_task_execution_runs WHERE task_id=?", [assist.id]);
  const revised = await updateTask(db, assist.id, { type: "l2_session", id: l2SessionId }, {
    status: "queued", progress: "约束已更新",
  });
  const runs = await query(db, "SELECT id,status,task_revision,executor_id FROM agent_task_execution_runs WHERE task_id=? ORDER BY created_at,id", [assist.id]);
  const stale = runs.find((run) => run.id === oldRun.id);
  const current = runs.find((run) => run.status === "queued");
  assert.equal(stale.status, "cancelled");
  assert.equal(current.task_revision, revised.revision);
  assert.notEqual(current.id, oldRun.id);

  const childId = randomUUID();
  const bound = await bindDshL3Execution(db, l2SessionId, childId, assist.id);
  assert.equal(bound.execution_agent_id, childId);
  assert.equal(bound.revision, revised.revision, "binding runtime state must not create another task input revision");
  const refreshedRuns = await query(db, "SELECT id,status,executor_id FROM agent_task_execution_runs WHERE task_id=?", [assist.id]);
  assert.deepEqual(refreshedRuns.find((run) => run.id === oldRun.id), {
    id: oldRun.id, status: "cancelled", executor_id: null,
  });
  assert.equal(refreshedRuns.find((run) => run.id === current.id).executor_id, childId);
});

test("completing an assist task without an L3 voids the task instead of keeping it completed", async () => {
  const assist = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "assist_l2", title: "L2 直接完成",
    goal: "不启动 L3", targetType: "l2_session", targetId: l2SessionId,
  });
  const closed = await updateTask(db, assist.id, { type: "l2_session", id: l2SessionId }, {
    status: "completed", progress: "已由 L2 关闭", resultSummary: "无需 L3",
  });
  assert.equal(closed.status, "cancelled");
  const [run] = await query(db, "SELECT status,error,executor_id FROM agent_task_execution_runs WHERE task_id=?", [assist.id]);
  assert.equal(run.status, "cancelled");
  assert.equal(run.executor_id, null);
  assert.match(run.error, /L3 未启动/);
});

test("an unbound L3 can claim a queued assist task when writing completion", async () => {
  const assist = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "assist_l2", title: "完成后补绑定",
    goal: "L3 先干活再回写", targetType: "l2_session", targetId: l2SessionId,
  });
  const childId = randomUUID();
  await ensureDshL3CanUpdate(db, l2SessionId, childId, assist.id);
  const completed = await updateTask(db, assist.id, { type: "l2_session", id: l2SessionId }, {
    status: "completed", progress: "产物已提交", resultSummary: "文档已入库",
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.execution_agent_id, childId);
  const [run] = await query(db, "SELECT status,executor_id FROM agent_task_execution_runs WHERE task_id=? ORDER BY created_at DESC LIMIT 1", [assist.id]);
  assert.equal(run.executor_id, childId);
  assert.equal(run.status, "completed");
});

test("L2 can restart failed, stuck queued and stuck running tasks in this iteration", async () => {
  const actor = { type: "l2_session", id: l2SessionId };
  const failed = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "assist_l2", title: "失败后重启",
    goal: "必须重跑", targetType: "l2_session", targetId: l2SessionId,
  });
  const failedChild = randomUUID();
  await bindDshL3Execution(db, l2SessionId, failedChild, failed.id);
  await settleDshL3Execution(db, l2SessionId, failedChild, {
    status: "ok", stopReason: "completed", lastAssistantMessage: [{ type: "text", text: "没交活" }],
  });
  const restartedFailed = await recoverAbnormalTask(db, failed.id, actor, { action: "restart", reason: "失败重跑" });
  assert.equal(restartedFailed.status, "running");
  assert.equal(restartedFailed.interruptedAgentId, failedChild);
  const rebound = await bindDshL3Execution(db, l2SessionId, randomUUID(), failed.id);
  assert.equal(rebound.status, "running");

  const queued = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "assist_l2", title: "排队卡住",
    goal: "重新派发", targetType: "l2_session", targetId: l2SessionId,
  });
  const restartedQueued = await recoverAbnormalTask(db, queued.id, actor, { action: "restart" });
  assert.equal(restartedQueued.status, "running");
  const runs = await listTaskExecutionRuns(db, queued.id);
  assert.equal(runs[0].status, "queued");
  assert.ok(runs.some((run) => run.status === "cancelled"));

  const running = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "assist_l2", title: "执行卡住",
    goal: "打断后重跑", targetType: "l2_session", targetId: l2SessionId,
  });
  const runningChild = randomUUID();
  await bindDshL3Execution(db, l2SessionId, runningChild, running.id);
  const restartedRunning = await recoverAbnormalTask(db, running.id, actor, { action: "restart" });
  assert.equal(restartedRunning.status, "running");
  assert.equal(restartedRunning.interruptedAgentId, runningChild);
  const stale = await settleDshL3Execution(db, l2SessionId, runningChild, {
    status: "error", stopReason: "aborted", lastAssistantMessage: [{ type: "text", text: "旧进程结束" }],
  });
  assert.equal(stale, null);
  assert.equal((await getTask(db, running.id)).status, "running");
});

test("repeated platform failures block before another executor is dispatched", async () => {
  const task = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "assist_l2", title: "平台错误恢复",
    goal: "验证同一执行者恢复与平台错误阻塞", targetType: "l2_session", targetId: l2SessionId,
  });
  const childId = randomUUID();
  await bindDshL3Execution(db, l2SessionId, childId, task.id);
  const platformEvent = () => query(db,
    `INSERT INTO agent_events(message_id,agent_session_id,agent_task_id,tool,status,input,output)
     VALUES(?,?,?,'publish_artifact','failed','{}','任务已停止或迭代已归档')`,
    [reportHostId, childId, task.id]);

  await platformEvent();
  const first = await settleDshL3Execution(db, l2SessionId, childId, {
    status: "error", stopReason: "error", lastAssistantMessage: [{ type: "text", text: "发布失败" }],
  });
  assert.equal(first.status, "failed");
  assert.equal(first.failure_class, "platform_blocked");
  assert.equal(first.retry_count, 1);

  const blocked = await recoverAbnormalTask(db, task.id, { type: "l2_session", id: l2SessionId }, {
    action: "restart", reason: "平台错误再次出现",
  });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.interruptedAgentId, childId);
  assert.equal((await listTaskExecutionRuns(db, task.id)).filter((run) => run.executor_id).length, 1);

  await assert.rejects(
    recoverAbnormalTask(db, task.id, { type: "l2_session", id: l2SessionId }, { action: "restart" }),
    { status: 409, message: /外部条件恢复|environmentChanged/ },
  );
});

test("an executor failure resumes the same L3 before replacement is considered", async () => {
  const task = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "assist_l2", title: "同执行者恢复",
    goal: "验证先恢复原 L3", targetType: "l2_session", targetId: l2SessionId,
  });
  const childId = randomUUID();
  await bindDshL3Execution(db, l2SessionId, childId, task.id);
  await settleDshL3Execution(db, l2SessionId, childId, {
    status: "error", stopReason: "error", lastAssistantMessage: [{ type: "text", text: "执行失败" }],
  });
  const recovered = await recoverAbnormalTask(db, task.id, { type: "l2_session", id: l2SessionId }, { action: "restart" });
  assert.equal(recovered.recovery.strategy, "resume_same_executor_first");
  assert.equal(recovered.recovery.executorId, childId);
  const rebound = await bindDshL3Execution(db, l2SessionId, childId, task.id);
  assert.equal(rebound.execution_agent_id, childId);
  assert.equal(rebound.executor_switch_count, 0);
});

test("retry budget exhaustion blocks before another executor can be dispatched", async () => {
  const task = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "assist_l2", title: "预算耗尽",
    goal: "达到预算后停止调度", targetType: "l2_session", targetId: l2SessionId,
  });
  await query(db, "UPDATE agent_tasks SET max_retry_count=1 WHERE id=?", [task.id]);
  const childId = randomUUID();
  await bindDshL3Execution(db, l2SessionId, childId, task.id);
  const failed = await settleDshL3Execution(db, l2SessionId, childId, {
    status: "error", stopReason: "error", lastAssistantMessage: [{ type: "text", text: "执行失败" }],
  });
  assert.equal(failed.status, "blocked");
  assert.match(failed.resume_condition, /外部条件恢复|人工确认/);
  await assert.rejects(
    recoverAbnormalTask(db, task.id, { type: "l2_session", id: l2SessionId }, { action: "restart" }),
    { status: 409, message: /外部条件恢复|重试预算/ },
  );
});

test("a rotated L2 session recasts queued assist work so dsh_l3 can bind", async () => {
  const staleSession = randomUUID();
  const assist = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "assist_l2", title: "旧会话排队",
    goal: "会话轮换后仍能开工", targetType: "l2_session", targetId: l2SessionId,
  });
  await query(db, "UPDATE agent_tasks SET target_id=?,claimed_by_id=?,created_by_id=? WHERE id=?",
    [staleSession, staleSession, staleSession, assist.id]);
  const created = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "assist_l2", title: "创建时写了旧目标",
    goal: "应落到当前 L2", targetType: "l2_session", targetId: staleSession,
  });
  assert.equal(created.target_id, l2SessionId);
  assert.equal(created.needsDispatch, true);
  assert.equal(created.started, false);

  await assert.rejects(createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: staleSession, taskType: "assist_l2", title: "陈旧 L2 禁止建单",
    goal: "caller 与 DB 不一致时应拒绝", targetType: "l2_session", targetId: staleSession,
  }), { status: 409, message: /会话已轮换/ });

  const recovered = await recoverAbnormalTask(db, assist.id, { type: "l2_session", id: l2SessionId }, { action: "restart" });
  assert.equal(recovered.status, "running");
  assert.equal(recovered.target_id, l2SessionId);
  assert.equal(recovered.claimed_by_id, l2SessionId);
  assert.equal(recovered.needsDispatch, true);
  assert.match(recovered.progress, /尚未绑定 L3/);

  const childId = randomUUID();
  const bound = await bindDshL3Execution(db, l2SessionId, childId, assist.id);
  assert.equal(bound.status, "running");
  assert.equal(bound.target_id, l2SessionId);
  assert.equal(bound.execution_agent_id, childId);
  const again = await bindDshL3Execution(db, l2SessionId, childId, assist.id);
  assert.equal(again.execution_agent_id, childId);
  const assignment = await query(db, "SELECT event_type,reason FROM agent_task_assignment_events WHERE task_id=? ORDER BY id", [assist.id]);
  assert.equal(assignment.every((event) => event.event_type !== "transferred"), true);
  await updateTask(db, assist.id, { type: "dsh_l3", id: childId }, { status: "failed", progress: "L3 交活失败", resultSummary: "提交被拒" });
  const status = await listTaskStatusEvents(db, assist.id);
  assert.equal(status.at(-1).actor_type, "dsh_l3");
  assert.equal(status.at(-1).actor_id, childId);
  assert.equal(status.at(-1).to_status, "failed");
  assert.match(status.at(-1).reason, /交活失败|提交被拒/);
});

test("L2 can arrange member-owned tasks in this iteration but not other iterations", async () => {
  const actor = { type: "l2_session", id: l2SessionId, authorizedByUserId: users[0].id };
  const humanTask = await formalTask(users[1].id, { title: "成员卡住的任务" });
  await acceptTask(db, humanTask.id, { type: "human_member", id: users[1].id }, "human_direct");
  await updateTask(db, humanTask.id, { type: "human_member", id: users[1].id }, { progress: "卡住了" });
  const restarted = await recoverAbnormalTask(db, humanTask.id, actor, { action: "restart", reason: "请成员重新确认" });
  assert.equal(restarted.status, "awaiting_acceptance");
  assert.equal(restarted.target_id, users[1].id);

  const cancelled = await recoverAbnormalTask(db, humanTask.id, actor, { action: "cancel", reason: "本迭代不再做" });
  assert.equal(cancelled.status, "cancelled");

  const otherThread = await service.createThread(users[0], project.id, { title: "另一迭代" });
  const otherL2 = randomUUID();
  await query(db, "INSERT INTO agent_sessions(thread_id,session_id) VALUES(?,?)", [otherThread.id, otherL2]);
  const foreign = await createTask(db, {
    projectId: project.id, originThreadId: otherThread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: otherL2, taskType: "assist_l2", title: "外迭代任务",
    goal: "不能被本迭代 L2 改", targetType: "l2_session", targetId: otherL2,
  });
  await assert.rejects(recoverAbnormalTask(db, foreign.id, actor, { action: "restart" }), { status: 403, message: /本迭代锁定/ });
  await assert.rejects(reassignTask(db, foreign.id, actor, { type: "human_member", id: users[1].id }, "跨迭代转交"), { status: 403 });
  const scoped = await listTasks(db, project.id, { originThreadId: thread.id, limit: 200 });
  assert.equal(scoped.some((task) => task.id === foreign.id), false);
  assert.equal(scoped.some((task) => task.id === humanTask.id), true);
});

test("L2 needs an executable human member account this turn to touch foreign work", async () => {
  const own = { type: "l2_session", id: l2SessionId };
  const authorized = { type: "l2_session", id: l2SessionId, authorizedByUserId: users[2].id };
  const agentAccount = { type: "l2_session", id: l2SessionId, authorizedByUserId: "agent-assistant" };
  const humanTask = await formalTask(users[1].id, { title: "需授权的成员任务" });
  await acceptTask(db, humanTask.id, { type: "human_member", id: users[1].id }, "human_direct");

  await assert.rejects(inspectIterationTask(db, humanTask.id, own), { status: 403, message: /人类成员账号明确授权/ });
  await assert.rejects(recoverAbnormalTask(db, humanTask.id, own, { action: "restart" }), { status: 403, message: /人类成员账号明确授权/ });
  await assert.rejects(askTaskQuestion(db, humanTask.id, own, "做到哪了？", users[0].id), { status: 403, message: /人类成员账号明确授权/ });
  await assert.rejects(createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "formal", title: "未授权派给人",
    goal: "不能派", targetType: "human_member", targetId: users[1].id,
  }), { status: 403, message: /指派给人类成员/ });
  const ownFormal = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "formal", title: "自己的正式任务",
    goal: "转给人类也要授权", targetType: "l2_session", targetId: l2SessionId,
  });
  await assert.rejects(reassignTask(db, ownFormal.id, own, { type: "human_member", id: users[1].id }, "未授权转人"),
    { status: 403, message: /指派给人类成员/ });
  await assert.rejects(recoverAbnormalTask(db, humanTask.id, agentAccount, { action: "restart" }),
    { status: 403, message: /人类成员账号明确授权/ });

  const viewerId = randomUUID();
  await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)", [viewerId, `${viewerId}@task.test`, "旁观", "unused"]);
  await query(db, "INSERT INTO members(project_id,user_id,role) VALUES(?,?,'viewer')", [project.id, viewerId]);
  await assert.rejects(inspectIterationTask(db, humanTask.id, { type: "l2_session", id: l2SessionId, authorizedByUserId: viewerId }),
    { status: 403, message: /人类成员账号明确授权/ });

  const snapshot = await inspectIterationTask(db, humanTask.id, authorized);
  assert.equal(snapshot.task.id, humanTask.id);
  const asked = await askTaskQuestion(db, humanTask.id, authorized, "进度如何？", users[0].id);
  assert.equal(asked.status, "open");
  await query(db, "UPDATE agent_task_questions SET status='cancelled' WHERE id=?", [asked.id]);
  await query(db, "UPDATE agent_tasks SET status='running' WHERE id=?", [humanTask.id]);
  const restarted = await recoverAbnormalTask(db, humanTask.id, authorized, { action: "restart" });
  assert.equal(restarted.status, "awaiting_acceptance");
  const created = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, authorizedByUserId: users[2].id,
    taskType: "formal", title: "授权后派给人", goal: "成员确认", targetType: "human_member", targetId: users[1].id,
  });
  assert.equal(created.target_type, "human_member");
  const handed = await reassignTask(db, ownFormal.id, authorized, { type: "human_member", id: users[1].id }, "授权后转人");
  assert.equal(handed.target_id, users[1].id);
});

test("assist tasks cannot be created when every L3 is busy", async () => {
  const occupy = async () => {
    const task = await createTask(db, {
      projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
      createdByType: "l2_session", createdById: l2SessionId, taskType: "assist_l2", title: "占住 L3",
      goal: "占槽", targetType: "l2_session", targetId: l2SessionId,
    });
    await bindDshL3Execution(db, l2SessionId, randomUUID(), task.id);
    return task;
  };
  const busy = [];
  for (;;) {
    try { busy.push(await occupy()); }
    catch (error) { if (error.status === 409) break; throw error; }
  }
  await assert.rejects(createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "assist_l2", title: "第 8 个辅助",
    goal: "应当失败", targetType: "l2_session", targetId: l2SessionId,
  }), { status: 409, message: /没有空闲 L3/ });
  const pending = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "formal", title: "沙箱待指派",
    goal: "没有空闲也可以创建", targetType: "l2_session", targetId: l2SessionId,
  });
  assert.equal(pending.status, "pending_assignment");
  assert.equal(pending.needsDispatch, true);
  const [live] = await query(db, `SELECT r.executor_id FROM agent_task_execution_runs r
    JOIN agent_tasks t ON t.id=r.task_id
    WHERE t.target_id=? AND r.executor_type='dsh_l3' AND r.status IN ('running','waiting')
    ORDER BY r.created_at LIMIT 1`, [l2SessionId]);
  await settleDshL3Execution(db, l2SessionId, live.executor_id, {
    status: "ok", stopReason: "completed", lastAssistantMessage: [{ type: "text", text: "让出槽位" }],
  });
  const [idleEvent] = await query(db, "SELECT kind,payload FROM coordinator_events WHERE kind='l3_idle' AND thread_id=? ORDER BY created_at DESC LIMIT 1", [thread.id]);
  assert.equal(idleEvent.kind, "l3_idle");
  const payload = typeof idleEvent.payload === "string" ? JSON.parse(idleEvent.payload) : idleEvent.payload;
  assert.ok(payload.pendingAssignment >= 1);
  const bound = await bindDshL3Execution(db, l2SessionId, randomUUID(), pending.id);
  assert.equal(bound.status, "running");
});

test("the source member can cancel a waiting confirmation and the target can reject it", async () => {
  const cancellable = await formalTask(users[1].id, { title: "来源取消" });
  const cancelled = await cancelTask(db, cancellable.id, { type: "human_member", id: users[0].id });
  assert.equal(cancelled.status, "cancelled");
  await assert.rejects(cancelTask(db, cancellable.id, { type: "human_member", id: users[0].id }), { status: 409 });

  const rejectable = await formalTask(users[1].id, { title: "目标拒绝" });
  await assert.rejects(cancelTask(db, rejectable.id, { type: "human_member", id: users[1].id }), { status: 403 });
  const rejected = await rejectTask(db, rejectable.id, { type: "human_member", id: users[1].id }, "现在做不了");
  assert.equal(rejected.status, "rejected");
});

test("human tasks can only reference official document versions", async () => {
  const cache = await service.submitVersion(users[0], thread.id, {
    title: "缓存说明",
    filename: "cache.md",
    mime: "text/markdown",
    contentBase64: Buffer.from("# 缓存", "utf8").toString("base64"),
  }, undefined, undefined, true);
  await assert.rejects(formalTask(users[1].id, { title: "无效引用", documentRefs: [randomUUID()] }),
    { status: 400, message: /正式文件/ });
  await assert.rejects(formalTask(users[1].id, { title: "缓存不可引用", documentRefs: [cache.id] }),
    { status: 400, message: /正式文件/ });
  const [officialRoot] = await query(db,
    "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' AND parent_id IS NULL LIMIT 1",
    [project.id]);
  const uploaded = await service.uploadOfficialDocument(users[0], project.id, {
    folderId: officialRoot.id,
    title: "验收说明",
    filename: "spec.md",
    mime: "text/markdown",
    contentBase64: Buffer.from("# 验收", "utf8").toString("base64"),
  });
  const created = await formalTask(users[1].id, { title: "按文档验收", documentRefs: [uploaded.id, uploaded.id] });
  assert.deepEqual(created.document_refs, [uploaded.id]);
  const snapshot = await inspectIterationTask(db, created.id, { type: "l2_session", id: l2SessionId, authorizedByUserId: users[0].id });
  assert.deepEqual(snapshot.task.document_refs, [uploaded.id]);
  assert.match(composeTaskInstruction(created, [{ title: "验收说明", version: 1 }]), /引用文档：\n- 验收说明 · v1/);

  const folderId = randomUUID();
  await query(db, "INSERT INTO document_folders(id,project_id,parent_id,name,folder_kind) VALUES(?,?,?,?,'project_official')",
    [folderId, project.id, officialRoot.id, "验收资料"]);
  await service.uploadOfficialDocument(users[0], project.id, {
    folderId, title: "清单", filename: "list.md", mime: "text/markdown",
    contentBase64: Buffer.from("# 清单", "utf8").toString("base64"),
  });
  const [cacheRoot] = await query(db,
    "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_cache' AND parent_id IS NULL LIMIT 1",
    [project.id]);
  await assert.rejects(formalTask(users[1].id, { title: "缓存文件夹", folderRefs: [cacheRoot.id] }),
    { status: 400, message: /文件夹/ });
  const withFolder = await formalTask(users[1].id, { title: "按目录验收", folderRefs: [folderId, folderId] });
  assert.deepEqual(withFolder.folder_refs, [folderId]);
  const folderSnapshot = await inspectIterationTask(db, withFolder.id, { type: "l2_session", id: l2SessionId, authorizedByUserId: users[0].id });
  assert.deepEqual(folderSnapshot.task.folder_refs, [folderId]);
  assert.match(composeTaskInstruction(withFolder, [], [{ title: "正式文件 / 验收资料" }]),
    /引用文件夹：\n- 正式文件 \/ 验收资料[\s\S]*子目录和文件/);
  assert.doesNotMatch(composeTaskInstruction(withFolder, [], [{ title: "正式文件 / 验收资料" }]), /引用文档/);

  const nestedDoc = await service.uploadOfficialDocument(users[0], project.id, {
    folderId, title: "细则", filename: "detail.md", mime: "text/markdown",
    contentBase64: Buffer.from("# 细则", "utf8").toString("base64"),
  });
  const outsideFolder = randomUUID();
  await query(db, "INSERT INTO document_folders(id,project_id,parent_id,name,folder_kind) VALUES(?,?,?,?,'project_official')",
    [outsideFolder, project.id, officialRoot.id, "另册"]);
  const outsideDoc = await service.uploadOfficialDocument(users[0], project.id, {
    folderId: outsideFolder, title: "另册说明", filename: "other.md", mime: "text/markdown",
    contentBase64: Buffer.from("# 另册", "utf8").toString("base64"),
  });
  const stripped = await formalTask(users[1].id, {
    title: "目录优先",
    folderRefs: [folderId],
    documentRefs: [nestedDoc.id, outsideDoc.id, uploaded.id],
  });
  assert.deepEqual(stripped.folder_refs, [folderId]);
  assert.deepEqual(stripped.document_refs, [outsideDoc.id, uploaded.id]);
  assert.equal(stripped.document_refs.includes(nestedDoc.id), false);
});
