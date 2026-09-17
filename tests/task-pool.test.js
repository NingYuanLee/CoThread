import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { acceptTask, acknowledgeTaskRejection, answerTaskQuestion, askTaskQuestion, bindDshL3Execution, createTask, ensureDshL3CanUpdate, listTasks, reassignTask, recoverInterruptedDshL3Executions, rejectTask, reopenRejectedTask, settleDshL3Execution, taskRejectionReview, updateTask } from "../server/task-pool.js";
import { testDatabase } from "./database.js";

let database, db, service, project, thread, users, l2SessionId;

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
});

after(async () => { await database?.close(); });

const formalTask = (targetId, overrides = {}) => createTask(db, {
  projectId: project.id,
  originThreadId: thread.id,
  sourceType: "human_member",
  sourceUserId: users[0].id,
  createdByType: "l2_session",
  createdById: l2SessionId,
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
  await acceptTask(db, task.id, { type: "human_member", id: users[1].id }, "human_direct");
  await assert.rejects(updateTask(db, task.id, { type: "human_member", id: users[2].id }, { status: "running" }), { status: 403 });
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

test("offline connector falls back to human self", async () => {
  await query(db, "UPDATE connectors SET last_seen_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 2 MINUTE) WHERE user_id=?", [users[1].id]);
  const task = await formalTask(users[1].id, { title: "离线任务" });
  const accepted = await acceptTask(db, task.id, { type: "human_member", id: users[1].id }, "auto");
  assert.equal(accepted.execution_agent_type, "human_self");
  assert.equal(accepted.execution_agent_id, users[1].id);
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
  const runs = await query(db, "SELECT id FROM agent_task_execution_runs WHERE task_id=?", [task.id]);
  assert.equal(runs.length, 0, "L2 owns the task before it decides whether an L3 is needed");
});

test("L2 can transfer formal work but cannot hand an assist task to a human", async () => {
  const formal = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "human_member", createdById: users[0].id, taskType: "formal", title: "L2 转交正式任务",
    goal: "交给成员执行", targetType: "l2_session", targetId: l2SessionId,
  });
  const transferred = await reassignTask(db, formal.id, { type: "l2_session", id: l2SessionId },
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

test("assist tasks bind to the real DSH child and return a compact result to their source task", async () => {
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
  const completed = await settleDshL3Execution(db, l2SessionId, childId, {
    status: "ok", stopReason: "completed", lastAssistantMessage: [{ type: "text", text: "结论与验证结果" }],
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.result_summary, "结论与验证结果");
  const [source] = await query(db, "SELECT progress FROM agent_tasks WHERE id=?", [formal.id]);
  assert.equal(source.progress, "辅助 L3 已返回结果，等待 L2 汇总");
  const [update] = await query(db, "SELECT body FROM agent_task_pool_updates WHERE task_id=? ORDER BY created_at DESC LIMIT 1", [formal.id]);
  assert.match(update.body, /结论与验证结果/);
});

test("queued assist work stays pending until a DSH L3 child is bound", async () => {
  const assist = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "assist_l2", title: "尚未启动的辅助任务",
    goal: "创建后仍在排队", targetType: "l2_session", targetId: l2SessionId,
  });
  const queuedMonitor = await service.agentMonitor(users[0], project.id);
  const pool = queuedMonitor.taskPool.find((row) => row.task_id === assist.id);
  assert.equal(pool.task_status, "queued");
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

test("a formal task owned by L2 can run on a resumable DSH child", async () => {
  const formal = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: users[0].id,
    createdByType: "human_member", createdById: users[0].id, taskType: "formal", title: "正式云端执行",
    goal: "由 L2 的 DSH L3 完成", targetType: "l2_session", targetId: l2SessionId,
  });
  const childId = randomUUID();
  const running = await bindDshL3Execution(db, l2SessionId, childId, formal.id);
  assert.equal(running.status, "running");
  assert.equal(running.task_type, "formal");
  assert.equal(running.execution_agent_id, childId);
  const [run] = await query(db, "SELECT task_revision,executor_type,executor_id,status FROM agent_task_execution_runs WHERE task_id=?", [formal.id]);
  assert.deepEqual(run, { task_revision: formal.revision, executor_type: "dsh_l3", executor_id: childId, status: "running" });

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
  await acknowledgeTaskRejection(db, acknowledgedTask.id, { type: "l2_session", id: l2SessionId });
  assert.equal((await taskRejectionReview(db, acknowledgedTask.id)).resolved, true);
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
  await settleDshL3Execution(db, l2SessionId, completedChild, {
    status: "ok", stopReason: "completed", lastAssistantMessage: [{ type: "text", text: "已完成" }],
  });
  assert.equal(await recoverInterruptedDshL3Executions(db), 2);
  const recoveredRuns = await query(db, "SELECT status,task_revision FROM agent_task_execution_runs WHERE task_id=? ORDER BY created_at,id", [runningAssist.id]);
  const [recoveredTask] = await query(db, "SELECT status,revision,execution_agent_id FROM agent_tasks WHERE id=?", [runningAssist.id]);
  const [stillCompleted] = await query(db, "SELECT status,result_summary FROM agent_tasks WHERE id=?", [completedAssist.id]);
  assert.equal(recoveredRuns.filter((run) => run.status === "interrupted").length, 1);
  assert.equal(recoveredRuns.filter((run) => run.status === "queued").length, 1);
  assert.equal(recoveredRuns.find((run) => run.status === "queued").task_revision, recoveredTask.revision);
  assert.equal(recoveredTask.status, "queued");
  assert.equal(recoveredTask.execution_agent_id, null);
  const [recoveredFormal] = await query(db, "SELECT status,execution_agent_id FROM agent_tasks WHERE id=?", [runningFormal.id]);
  const formalRuns = await query(db, "SELECT status,executor_id FROM agent_task_execution_runs WHERE task_id=? ORDER BY created_at,id", [runningFormal.id]);
  assert.deepEqual(recoveredFormal, { status: "queued", execution_agent_id: formalChild });
  assert.equal(formalRuns.filter((run) => run.status === "interrupted").length, 1);
  assert.equal(formalRuns.filter((run) => run.status === "queued" && run.executor_id === null).length, 1);
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
