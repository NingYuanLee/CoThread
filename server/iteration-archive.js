import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { lockIteration } from "./iteration-state.js";
import { latestVersionsByFolderRoots } from "./documents/index.js";
import { modelResponse, responseText } from "./model-config.js";
import { publishWork } from "./work-events.js";
import { nativeHistoryFromLiveHome } from "./l3-session.js";
import { sessionLockName } from "./session-lock.js";

const ended = new Set(["completed", "failed", "cancelled", "rejected", "abandoned", "superseded"]);

async function archiveAdmission(db, threadId, operation) {
  const conn = await db.getConnection();
  let acquired = false;
  try {
    const [lock] = await query(conn, "SELECT GET_LOCK(?,0) acquired", [sessionLockName(threadId)]);
    acquired = Number(lock.acquired) === 1;
    if (!acquired)
      throw new HttpError(409, "当前迭代上下文或 Agent 仍在运行，请等待执行结束后再归档");
    await conn.beginTransaction();
    const result = await operation(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    try {
      if (acquired) await query(conn, "SELECT RELEASE_LOCK(?)", [sessionLockName(threadId)]);
    } finally {
      conn.release();
    }
  }
}
export const archiveJson = (value) => (typeof value === "string" ? JSON.parse(value) : value);

function archiveText(value, maximum) {
  const text = Array.isArray(value)
    ? value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).filter(Boolean).join("\n")
    : String(value ?? "");
  return Array.from(text.trim()).slice(0, maximum).join("");
}

/** 未完成事项：勾选后作为新迭代的任务交接过去。 */
function archivePriority(value) {
  const raw = String(value?.priority ?? value?.rank ?? value?.level ?? "").trim().toLowerCase();
  if (["1", "高", "high", "p1"].includes(raw)) return 1;
  if (["3", "低", "low", "p3"].includes(raw)) return 3;
  const number = Number(raw);
  if (number === 1 || number === 2 || number === 3) return number;
  return 2;
}

function archiveItems(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const normalized = typeof item === "string"
        ? { title: archiveText(item, 240), detail: "" }
        : {
            title: archiveText(item?.title ?? item?.item ?? item?.name, 240),
            detail: archiveText(item?.detail ?? item?.note ?? item?.description, 2000),
            choice: itemChoice(item),
            priority: archivePriority(item),
          };
      return { ...normalized, suggestion: normalized.choice || "archive" };
    })
    .filter((item) => item.title);
}

function archiveDisposition(value) {
  const raw = String(value?.disposition ?? value?.decision ?? "").trim().toLowerCase();
  if (["background", "背景", "录入新背景", "录入新迭代背景"].includes(raw)) return "background";
  if (["retain", "留档", "keep", "archive", "仅归档结束", "仅归档"].includes(raw)) return "retain";
  if (["handoff", "交接", "transfer", "task", "生成新任务", "生成新迭代任务"].includes(raw)) return "handoff";
  // 模型漏给或给了无法识别的取值时按 retain 兜底（与 taskChoices 的默认一致），
  // 否则整份草案会被 schema 拒绝并无限重试；人类仍会在确认阶段调整。
  return "retain";
}

function itemChoice(item) {
  const raw = String(item?.choice ?? "").trim().toLowerCase();
  if (["task", "handoff", "生成新任务", "生成新迭代任务"].includes(raw)) return "task";
  if (["background", "录入新背景", "录入新迭代背景", "背景"].includes(raw)) return "background";
  if (["archive", "retain", "仅归档结束", "仅归档", "留档"].includes(raw)) return "archive";
  if (item?.include === true) return "task";
  if (item?.include === false) return "archive";
  return "archive";
}

function appendBackgroundEntries(background, entries) {
  const missing = entries.filter((item) => item.title && !String(background || "").includes(item.title));
  if (!missing.length) return background || "";
  const block = missing
    .map((item) => (item.detail ? "- " + item.title + "：" + item.detail : "- " + item.title))
    .join("\n");
  const base = String(background || "").trim();
  return (base ? base + "\n\n" : "") + "由归档转入背景：\n" + block;
}

export function normalizeArchivePlan(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const next = value.nextIteration;
  return {
    ...value,
    conclusion: archiveText(value.conclusion, 20000),
    notes: archiveText(value.notes, 20000),
    nextIteration: next && typeof next === "object" && !Array.isArray(next) ? {
      title: archiveText(next.title, 160),
      background: archiveText(next.background, 20000),
      goal: archiveText(next.goal, 20000),
      items: archiveItems(next.items),
    } : next,
    taskDecisions: Array.isArray(value.taskDecisions) ? value.taskDecisions.map((item) => {
      const disposition = archiveDisposition(item);
      const suggestion = itemChoice({ choice: item?.suggestion }) === "archive" && item?.suggestion == null
        ? (disposition === "handoff" ? "task" : disposition === "background" ? "background" : "archive")
        : itemChoice({ choice: item?.suggestion || (disposition === "handoff" ? "task" : disposition) });
      return {
        ...item,
        disposition,
        reason: archiveText(item?.reason, 2000),
        priority: archivePriority(item),
        suggestion,
      };
    }) : value.taskDecisions,
  };
}

const archiveItemSchema = z.object({
  title: z.string().trim().min(1).max(240),
  detail: z.string().max(2000).default(""),
  choice: z.enum(["archive", "background", "task"]).optional(),
  suggestion: z.enum(["archive", "background", "task"]).optional(),
  priority: z.number().int().min(1).max(3).optional(),
  assigneeUserId: z.string().uuid().optional(),
});

const archiveNextIterationSchema = z.object({
  title: z.string().max(160),
  background: z.string().max(20000),
  goal: z.string().max(20000),
  items: z.array(archiveItemSchema).max(50).default([]),
});

export const archivePlanSchema = z.object({
  conclusion: z.string().trim().min(1).max(20000),
  taskDecisions: z
    .array(
      z.object({
        taskId: z.string().uuid(),
        disposition: z.enum(["retain", "handoff", "background"]),
        reason: z.string().max(2000).default(""),
        priority: z.number().int().min(1).max(3).optional(),
        suggestion: z.enum(["archive", "background", "task"]).optional(),
        assigneeUserId: z.string().uuid().optional(),
      }),
    )
    .max(10000),
  notes: z.string().max(20000).default(""),
  nextIteration: archiveNextIterationSchema,
});

export const archivePlanDraftSchema = z.preprocess(normalizeArchivePlan, archivePlanSchema);

async function canManage(conn, user, thread) {
  if (user.kind !== "session") return false;
  const [member] = await query(
    conn,
    `SELECT p.project_leader_id FROM members m
    JOIN projects p ON p.id=m.project_id WHERE m.project_id=? AND m.user_id=? AND p.archived_at IS NULL`,
    [thread.project_id, user.id],
  );
  return !!member && (thread.created_by === user.id || member.project_leader_id === user.id);
}

async function authorized(service, conn, user, thread) {
  await service.member(user, thread.project_id, false, conn);
  // A locking read observes current membership and leadership after concurrent changes.
  const [authority] = await query(
    conn,
    `SELECT p.project_leader_id FROM projects p JOIN members m ON m.project_id=p.id
     WHERE p.id=? AND m.user_id=? AND p.archived_at IS NULL FOR UPDATE`,
    [thread.project_id, user.id],
  );
  if (
    user.kind !== "session" ||
    !authority ||
    (thread.created_by !== user.id && authority.project_leader_id !== user.id)
  )
    throw new HttpError(403, "仅迭代创建人或项目负责人可以操作迭代归档");
}

export async function archiveBlockers(conn, threadId) {
  const checks = [
    [
      "任务",
      "SELECT id,title FROM agent_tasks WHERE origin_thread_id=? AND status='running' LIMIT 10",
    ],
    [
      "任务执行",
      `SELECT r.id,t.title FROM agent_task_execution_runs r JOIN agent_tasks t ON t.id=r.task_id
      WHERE t.origin_thread_id=? AND r.status IN ('running','waiting') LIMIT 10`,
    ],
    [
      "沙箱执行",
      "SELECT id,kind title FROM sandbox_runs WHERE thread_id=? AND status='running' LIMIT 10",
    ],
    [
      "助手执行",
      `SELECT r.message_id id,'助手正在运行' title FROM assistant_replies r JOIN messages m ON m.id=r.message_id
      WHERE m.thread_id=? AND (r.status='running' OR r.execution_active=TRUE) LIMIT 10`,
    ],
    [
      "调度请求",
      `SELECT q.message_id id,'消息正在处理' title FROM agent_requests q JOIN messages m ON m.id=q.message_id WHERE m.thread_id=? AND q.status='running' LIMIT 10`,
    ],
    [
      "调度事件",
      "SELECT id,kind title FROM coordinator_events WHERE thread_id=? AND status='running' LIMIT 10",
    ],
    [
      "本地执行器",
      `SELECT id,instruction title FROM connector_tasks WHERE thread_id=? AND status IN ('running','paused','completed_pending_notification','failed_pending_notification') LIMIT 10`,
    ],
    [
      "工具调用",
      `SELECT e.id,e.tool title FROM agent_events e JOIN messages m ON m.id=e.message_id WHERE m.thread_id=? AND e.status='running' LIMIT 10`,
    ],
    [
      "上下文压缩",
      "SELECT thread_id id,'上下文压缩' title FROM agent_sessions WHERE thread_id=? AND compact_status='running' LIMIT 1",
    ],
  ];
  const blockers = [];
  for (const [kind, sql] of checks)
    for (const row of await query(conn, sql, [threadId]))
      blockers.push({ kind, id: row.id, title: String(row.title || "").slice(0, 120) });
  return blockers;
}

async function assertIdle(conn, threadId) {
  const blockers = await archiveBlockers(conn, threadId);
  if (blockers.length)
    throw new HttpError(
      409,
      `当前迭代仍有进行中的工作，暂不能归档：${blockers.map((item) => `${item.kind}「${item.title || item.id}」`).join("；")}`,
    );
}

async function enqueue(conn, thread, workflow, phase, userId) {
  const id = randomUUID();
  await query(
    conn,
    `INSERT INTO agent_l1_runs(id,project_id,thread_id,task,trigger_source,requested_by,archive_workflow_id,archive_token,archive_phase)
    VALUES(?,?,?,'iteration_archive','user',?,?,?,?)`,
    [id, thread.project_id, thread.id, userId, workflow.id, workflow.run_token, phase],
  );
}

function taskChoices(snapshot, plan) {
  const choices = new Map((plan?.taskDecisions || []).map((item) => [item.taskId, item]));
  return (snapshot.tasks || [])
    .filter((task) => !ended.has(task.status))
    .map((task) => ({
      taskId: task.id,
      title: task.title,
      status: task.status,
      disposition: choices.get(task.id)?.disposition || "retain",
      reason: choices.get(task.id)?.reason || "",
      priority: choices.get(task.id)?.priority,
      suggestion: choices.get(task.id)?.suggestion,
    }));
}

/**
 * 草案是否已经无人接手：工作流已等过久，且没有正在跑的 run。
 * 排队中的 run 只在前 5 分钟算「有人接手」——正常情况下请求返回时就该被认领，
 * 排队超过 5 分钟说明唤醒链路卡死了，落到 failed 让「重新梳理」可用。
 */
async function archiveDraftOrphaned(db, workflowId) {
  const [stale] = await query(
    db,
    `SELECT (updated_at < DATE_SUB(NOW(), INTERVAL 45 SECOND)) old FROM iteration_archive_workflows
    WHERE id=? AND status='preparing'`,
    [workflowId],
  );
  if (!stale || !Number(stale.old)) return false;
  const [live] = await query(
    db,
    `SELECT id FROM agent_l1_runs WHERE archive_workflow_id=?
    AND (status='running' OR (status='queued' AND created_at > DATE_SUB(NOW(), INTERVAL 300 SECOND)))
    LIMIT 1`,
    [workflowId],
  );
  if (live) return false;
  const result = await query(
    db,
    `UPDATE iteration_archive_workflows SET status='failed',error=?,finished_at=UTC_TIMESTAMP(3)
    WHERE id=? AND status='preparing'`,
    ["归档整理未启动或已中断，请重新梳理。", workflowId],
  );
  return Number(result?.affectedRows || 0) > 0;
}

export async function readArchiveWorkflow(service, user, threadId) {
  const thread = await service.thread(user, threadId);
  const [row] = await query(
    service.db,
    "SELECT * FROM iteration_archive_workflows WHERE thread_id=? ORDER BY created_at DESC,id DESC LIMIT 1",
    [threadId],
  );
  if (!row) return null;
  const plan = archiveJson(row.plan) || {},
    snapshot = archiveJson(row.snapshot) || {};
  // 草案 run 可能丢在重启/认领失败里：没有任何排队或运行中的 run 且已等待过久时，
  // 把工作流落到 failed，让「重新梳理」按钮出现，而不是永远停在「梳理中」。
  if (row.status === "preparing" && (await archiveDraftOrphaned(service.db, row.id))) {
    row.status = "failed";
    row.error = "归档整理未启动或已中断，请重新梳理。";
  }
  return {
    id: row.id,
    status: row.status,
    canManage: await canManage(service.db, user, thread),
    conclusion: plan.conclusion || "",
    taskDecisions: taskChoices(snapshot, plan),
    notes: plan.notes || "",
    nextIteration: plan.nextIteration || { title: "", background: "", goal: "" },
    error: row.error || null,
    nextThreadId: row.next_thread_id || null,
    session: await archiveSessionView(service.db, thread, row),
    members: await query(
      service.db,
      "SELECT u.id,u.name FROM members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? AND m.role<>'viewer' ORDER BY u.name,u.id",
      [thread.project_id],
    ),
  };
}

const ARCHIVE_PHASES = {
  prepare_context: "正在准备本轮上下文",
  start_harness: "正在启动整理会话",
  compact_context: "正在压缩上下文",
  model_run: "正在整理归档方案",
  validate_result: "正在校验整理结果",
  save_checkpoint: "正在保存会话",
};

async function archiveSessionView(db, thread, workflow) {
  const phases = await query(
    db,
    `SELECT phase,status,error FROM agent_project_events
     WHERE project_id=? AND task='iteration_archive' AND thread_id=? AND created_at>=?
     ORDER BY id ASC LIMIT 40`,
    [thread.project_id, thread.id, workflow.created_at],
  ).catch(() => []);
  const [session] = await query(
    db,
    "SELECT session_id FROM agent_project_sessions WHERE project_id=? AND task='iteration_archive' AND scope_id=?",
    [thread.project_id, thread.project_id],
  ).catch(() => []);
  let messages = [];
  if (session?.session_id) {
    try {
      messages = await nativeHistoryFromLiveHome("l1-iteration_archive-" + thread.project_id, session.session_id);
    } catch {
      messages = [];
    }
  }
  const latest = phases.at(-1);
  return {
    phase: latest ? ARCHIVE_PHASES[latest.phase] || latest.phase : "",
    messages: messages.slice(-24).map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      text: String(item.text || "").slice(0, 4000),
    })),
  };
}

export async function beginIterationArchive(service, user, threadId) {
  let projectId = null;
  await archiveAdmission(service.db, threadId, async (conn) => {
    const thread = await lockIteration(conn, threadId);
    projectId = thread.project_id;
    await authorized(service, conn, user, thread);
    if (thread.status !== "active")
      throw new HttpError(409, "此迭代已进入归档流程，请查看当前归档方案");
    await assertIdle(conn, threadId);
    const context = await service.context(user, threadId, conn);
    const folderIds = [
      ...new Set(context.messages.flatMap((message) => message.folder_refs || [])),
    ];
    const folderVersions = await latestVersionsByFolderRoots(conn, thread.project_id, folderIds);
    const versionIds = [
      ...new Set([
        ...context.messages.flatMap((message) => message.refs || []),
        ...[...folderVersions.values()].flatMap((rows) => rows.map((row) => row.version_id)),
      ]),
    ];
    const versions = [];
    for (const versionId of versionIds) {
      const [version] = await query(
        conn,
        "SELECT id,artifact_id,version,filename,sha256,byte_size FROM versions WHERE id=?",
        [versionId],
      );
      if (version)
        versions.push({
          ...version,
          reviews: await query(
            conn,
            "SELECT * FROM reviews WHERE version_id=? ORDER BY created_at,id",
            [versionId],
          ),
        });
    }
    const snapshot = {
      schemaVersion: 2,
      projectId: thread.project_id,
      threadId,
      title: thread.title,
      background: thread.background || "",
      goal: thread.goal || "",
      frozenAt: new Date().toISOString(),
      messages: context.messages,
      versions,
      reviews: context.reviews,
      runs: context.runs,
      tasks: await query(
        conn,
        "SELECT * FROM agent_tasks WHERE origin_thread_id=? ORDER BY created_at,id",
        [threadId],
      ),
    };
    const workflow = { id: randomUUID(), run_token: randomUUID() };
    await query(
      conn,
      "INSERT INTO iteration_archive_workflows(id,thread_id,run_token,snapshot,requested_by) VALUES(?,?,?,?,?)",
      [workflow.id, threadId, workflow.run_token, JSON.stringify(snapshot), user.id],
    );
    await query(conn, "UPDATE threads SET status='archiving' WHERE id=?", [threadId]);
    await enqueue(conn, thread, workflow, "draft", user.id);
  });
  publishWork(service.db, threadId);
  const workflow = await readArchiveWorkflow(service, user, threadId);
  return { ...workflow, workflowId: workflow.id, status: "archiving" };
}

/**
 * 请求自己把草案领走并开跑，不等后台车道。
 * 只等认领提交，模型调用在后台继续，HTTP 不会被梳理拖住。
 */
export async function kickArchiveDraft(service, projectId) {
  try {
    const { startIterationArchive } = await import("./project-memory.js");
    await startIterationArchive(service.db, projectId);
  } catch (error) {
    console.error("Archive draft kick failed", {
      type: error?.name || "Error",
      message: String(error?.message || error).slice(0, 300),
    });
  }
}

const continuationSchema = z.object({
  conclusion: z.string().max(20000).default(""),
  notes: z.string().max(20000).default(""),
  nextIteration: z.object({
    title: z.string().max(160).default(""),
    background: z.string().max(20000).default(""),
    goal: z.string().max(20000).default(""),
  }),
  decisions: z.array(z.object({
    title: z.string().max(240),
    detail: z.string().max(2000).default(""),
    choice: z.enum(["archive", "background", "task"]),
  })).max(200),
});

function fallbackContinuation(input) {
  const backgroundEntries = input.decisions.filter((item) => item.choice === "background");
  return {
    title: input.nextIteration.title,
    background: appendBackgroundEntries(input.nextIteration.background, backgroundEntries),
    goal: input.nextIteration.goal,
  };
}

export async function suggestArchiveContinuation(service, user, threadId, input, request = fetch) {
  const workflow = await readArchiveWorkflow(service, user, threadId);
  if (!workflow?.canManage) throw new HttpError(403, "仅迭代创建人或项目负责人可以操作迭代归档");
  if (workflow.status !== "ready") throw new HttpError(409, "归档方案尚未就绪");
  const data = continuationSchema.parse(input);
  const carried = data.decisions.filter((item) => item.choice !== "archive");
  if (!carried.length) return fallbackContinuation(data);
  try {
    const raw = await modelResponse({
      scope: "knowledge",
      maxTokens: 1200,
      reasoningEffort: "none",
      signal: AbortSignal.timeout(20000),
      messages: [
        {
          role: "system",
          content: "你在整理迭代归档的承接方案。根据本轮结论和人类对未完成项的选择，改写下一迭代的名称、背景、目标。choice=archive 的项不要写入下一轮。choice=background 的项要自然写进 background，保留关键事实。choice=task 的项要体现在 goal，说明下一轮要完成这些事，不要写成已经完成。保留原草案里仍然有效的信息。只返回 JSON：{\"title\":\"\",\"background\":\"\",\"goal\":\"\"}。title 不超过 40 个字。",
        },
        {
          role: "user",
          content: JSON.stringify({
            conclusion: data.conclusion,
            notes: data.notes,
            current: data.nextIteration,
            decisions: data.decisions,
          }),
        },
      ],
    }, request);
    const text = responseText(raw) || "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const parsed = JSON.parse(start >= 0 ? text.slice(start, end + 1) : text);
    return {
      title: archiveText(parsed.title || data.nextIteration.title, 160),
      background: archiveText(parsed.background || data.nextIteration.background, 20000),
      goal: archiveText(parsed.goal || data.nextIteration.goal, 20000),
    };
  } catch (error) {
    console.error("Archive continuation suggestion failed", {
      type: error?.name || "Error",
      message: String(error?.message || error).slice(0, 300),
    });
    return fallbackContinuation(data);
  }
}

const prioritySchema = z.object({
  conclusion: z.string().max(20000).default(""),
  decisions: z.array(z.object({
    key: z.string().max(80),
    title: z.string().max(240),
    detail: z.string().max(2000).default(""),
    kind: z.enum(["task", "item"]),
  })).max(200),
});

export async function suggestArchivePriorities(service, user, threadId, input, request = fetch) {
  const workflow = await readArchiveWorkflow(service, user, threadId);
  if (!workflow?.canManage) throw new HttpError(403, "仅迭代创建人或项目负责人可以操作迭代归档");
  if (workflow.status !== "ready") throw new HttpError(409, "归档方案尚未就绪");
  const data = prioritySchema.parse(input);
  if (!data.decisions.length) return { decisions: [] };
  const fallback = data.decisions.map((item, index) => ({
    key: item.key,
    priority: index < 3 ? 1 : index < 6 ? 2 : 3,
    suggestion: "archive",
  }));
  try {
    const raw = await modelResponse({
      scope: "knowledge",
      maxTokens: 1200,
      reasoningEffort: "none",
      signal: AbortSignal.timeout(20000),
      messages: [
        {
          role: "system",
          content: "你在帮人类决定未完成项怎么交接。把每项分成 priority 1高、2中、3低，并给 suggestion：archive仅归档结束、background录入新背景、task生成新任务。高优先是阻塞下一轮或必须继续做的；中优先应该承接但不是阻塞；低优先可以随本轮结束，或只值得记进背景。必须继续执行、有验收口径的建议 task；只是约束、决定或事实的建议 background；已过时或不值得下一轮的建议 archive。必须覆盖每个 key，不要新增。只返回 JSON：{\"decisions\":[{\"key\":\"\",\"priority\":1,\"suggestion\":\"task\"}]}",
        },
        { role: "user", content: JSON.stringify({ conclusion: data.conclusion, decisions: data.decisions }) },
      ],
    }, request);
    const text = responseText(raw) || "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const parsed = JSON.parse(start >= 0 ? text.slice(start, end + 1) : text);
    const byKey = new Map((parsed.decisions || []).map((item) => [item.key, item]));
    return {
      decisions: data.decisions.map((item) => {
        const hit = byKey.get(item.key) || {};
        const suggestion = itemChoice({ choice: hit.suggestion });
        return { key: item.key, priority: archivePriority(hit), suggestion };
      }),
    };
  } catch (error) {
    console.error("Archive priority suggestion failed", {
      type: error?.name || "Error",
      message: String(error?.message || error).slice(0, 300),
    });
    return { decisions: fallback };
  }
}

export async function reviseArchiveSummary(service, user, threadId, input, request = fetch) {
  const data = z.object({
    workflowId: z.string().uuid(),
    comment: z.string().trim().min(1).max(4000),
  }).parse(input);
  const workflow = await readArchiveWorkflow(service, user, threadId);
  if (!workflow?.canManage) throw new HttpError(403, "仅迭代创建人或项目负责人可以操作迭代归档");
  if (workflow.status !== "ready" || workflow.id !== data.workflowId) throw new HttpError(409, "归档方案尚未就绪");
  let conclusion = workflow.conclusion;
  try {
    const raw = await modelResponse({
      scope: "knowledge",
      maxTokens: 2000,
      reasoningEffort: "none",
      signal: AbortSignal.timeout(25000),
      messages: [
        {
          role: "system",
          content: "你在按人类修改意见改写迭代总结。输出 Markdown 正文，不要代码围栏。保留仍有效的事实，按意见增删改，不要把未完成写成已完成。",
        },
        { role: "user", content: JSON.stringify({ summary: workflow.conclusion, comment: data.comment }) },
      ],
    }, request);
    const text = (responseText(raw) || "").replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/, "").trim();
    if (text) conclusion = text.slice(0, 20000);
  } catch (error) {
    console.error("Archive summary revise failed", {
      type: error?.name || "Error",
      message: String(error?.message || error).slice(0, 300),
    });
    conclusion = (workflow.conclusion + "\n\n## 修改意见\n" + data.comment).slice(0, 20000);
  }
  const [row] = await query(service.db, "SELECT plan FROM iteration_archive_workflows WHERE id=?", [data.workflowId]);
  const plan = archiveJson(row?.plan) || {};
  plan.conclusion = conclusion;
  await query(service.db, "UPDATE iteration_archive_workflows SET plan=? WHERE id=?", [JSON.stringify(plan), data.workflowId]);
  return { conclusion };
}

async function workflowFor(conn, threadId, workflowId) {
  const [workflow] = await query(
    conn,
    "SELECT * FROM iteration_archive_workflows WHERE id=? AND thread_id=? FOR UPDATE",
    [workflowId, threadId],
  );
  if (!workflow) throw new HttpError(409, "归档方案已变化，请重新打开");
  return workflow;
}

export async function cancelIterationArchive(service, user, threadId, input) {
  const { workflowId } = z.object({ workflowId: z.string().uuid() }).parse(input);
  return transaction(service.db, async (conn) => {
    const thread = await lockIteration(conn, threadId);
    await authorized(service, conn, user, thread);
    const workflow = await workflowFor(conn, threadId, workflowId);
    if (
      thread.status !== "archiving" ||
      !["preparing", "ready", "failed"].includes(workflow.status)
    )
      throw new HttpError(409, "本次归档已经结束，不能撤回");
    await query(
      conn,
      "UPDATE iteration_archive_workflows SET status='cancelled',run_token=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?",
      [randomUUID(), workflowId],
    );
    await query(conn, "UPDATE threads SET status='active' WHERE id=?", [threadId]);
    await query(
      conn,
      "UPDATE agent_l1_runs SET status='failed',error='归档已撤回',finished_at=UTC_TIMESTAMP(3) WHERE archive_workflow_id=? AND status='queued'",
      [workflowId],
    );
    return { status: "active" };
  }).then((result) => {
    publishWork(service.db, threadId);
    return result;
  });
}

export async function retryIterationArchive(service, user, threadId, input) {
  const { workflowId } = z.object({ workflowId: z.string().uuid() }).parse(input);
  let projectId = null;
  await transaction(service.db, async (conn) => {
    const thread = await lockIteration(conn, threadId);
    projectId = thread.project_id;
    await authorized(service, conn, user, thread);
    const workflow = await workflowFor(conn, threadId, workflowId);
    if (thread.status !== "archiving" || workflow.status !== "failed")
      throw new HttpError(409, "当前归档方案不能重试");
    workflow.run_token = randomUUID();
    await query(
      conn,
      "UPDATE iteration_archive_workflows SET status='preparing',run_token=?,plan=NULL,error=NULL WHERE id=?",
      [workflow.run_token, workflowId],
    );
    await enqueue(conn, thread, workflow, "draft", user.id);
  });
  publishWork(service.db, threadId);
  return readArchiveWorkflow(service, user, threadId);
}

export async function confirmIterationArchive(service, user, threadId, input) {
  const data = archivePlanSchema
    .extend({
      workflowId: z.string().uuid(),
      createNextIteration: z.boolean(),
      taskDecisions: z
        .array(
          z.object({
            taskId: z.string().uuid(),
            disposition: z.enum(["retain", "handoff", "background"]),
            reason: z.string().max(2000).default(""),
            assigneeUserId: z.string().uuid().optional(),
          }),
        )
        .max(10000),
      nextIteration: archiveNextIterationSchema.extend({
        items: z
          .array(
            archiveItemSchema.extend({
              include: z.boolean().optional(),
              choice: z.enum(["archive", "background", "task"]).optional(),
            }),
          )
          .max(50)
          .default([]),
      }),
    })
    .parse(input);
  const taskItems = data.nextIteration.items.filter((item) => itemChoice(item) === "task");
  const backgroundItems = data.nextIteration.items.filter((item) => itemChoice(item) === "background");
  const result = await transaction(service.db, async (conn) => {
    const thread = await lockIteration(conn, threadId);
    await authorized(service, conn, user, thread);
    const workflow = await workflowFor(conn, threadId, data.workflowId);
    if (thread.status === "archived" && workflow.status === "completed")
      return { status: "archived", nextThreadId: workflow.next_thread_id || null };
    if (thread.status !== "archiving" || workflow.status !== "ready")
      throw new HttpError(409, "归档方案尚未就绪或已失效");
    await assertIdle(conn, threadId);
    const tasks = await query(
      conn,
      "SELECT * FROM agent_tasks WHERE origin_thread_id=? ORDER BY created_at,id FOR UPDATE",
      [threadId],
    );
    const open = tasks.filter((task) => !ended.has(task.status));
    const choices = new Map(data.taskDecisions.map((choice) => [choice.taskId, choice]));
    if (
      choices.size !== data.taskDecisions.length ||
      choices.size !== open.length ||
      open.some((task) => !choices.has(task.id))
    )
      throw new HttpError(400, "请为每个未完成项选择去向，不得包含其他任务");
    const backgroundTasks = open.filter((task) => choices.get(task.id)?.disposition === "background");
    if (
      !data.createNextIteration &&
      (data.taskDecisions.some((choice) => choice.disposition === "handoff" || choice.disposition === "background") ||
        taskItems.length ||
        backgroundItems.length)
    )
      throw new HttpError(400, "录入新迭代背景或生成新迭代任务需要创建承接迭代");
    let nextThreadId = null,
      nextSessionId = null;
    const carriedBackground = appendBackgroundEntries(data.nextIteration.background, [
      ...backgroundTasks.map((task) => ({
        title: task.title,
        detail: choices.get(task.id)?.reason || "",
      })),
      ...backgroundItems,
    ]);
    if (data.createNextIteration) {
      if (!data.nextIteration.title.trim() || !carriedBackground.trim() || !data.nextIteration.goal.trim())
        throw new HttpError(400, "请填写承接迭代的名称、背景与目标");
      nextThreadId = randomUUID();
      nextSessionId = randomUUID();
      await query(
        conn,
        "INSERT INTO threads(id,project_id,title,background,goal,created_by) VALUES(?,?,?,?,?,?)",
        [
          nextThreadId,
          thread.project_id,
          data.nextIteration.title.trim(),
          carriedBackground,
          data.nextIteration.goal,
          user.id,
        ],
      );
      await query(conn, "INSERT INTO agent_sessions(thread_id,session_id) VALUES(?,?)", [
        nextThreadId,
        nextSessionId,
      ]);
    }
    let number = 0,
      l2Handoffs = 0;
    for (const task of open) {
      const choice = choices.get(task.id);
      await query(
        conn,
        "UPDATE agent_task_execution_runs SET status='cancelled',error='迭代归档，未启动的执行已收口',finished_at=UTC_TIMESTAMP(3) WHERE task_id=? AND status='queued'",
        [task.id],
      );
      if (choice.disposition !== "handoff") {
        await query(conn, "UPDATE agent_tasks SET retained_at=UTC_TIMESTAMP(3) WHERE id=?", [
          task.id,
        ]);
      } else {
        await query(
          conn,
          "INSERT INTO agent_task_iteration_moves(id,task_id,workflow_id,from_thread_id,to_thread_id,decided_by,reason) VALUES(?,?,?,?,?,?,?)",
          [randomUUID(), task.id, workflow.id, threadId, nextThreadId, user.id, choice.reason],
        );
        await query(
          conn,
          "UPDATE agent_tasks SET original_thread_id=COALESCE(original_thread_id,origin_thread_id),origin_thread_id=?,thread_number=?,retained_at=NULL,revision=revision+1 WHERE id=?",
          [nextThreadId, ++number, task.id],
        );
        await query(
          conn,
          "UPDATE connector_tasks SET thread_id=? WHERE agent_task_id=? AND status IN ('queued','awaiting_approval')",
          [nextThreadId, task.id],
        );
        if (choice.assigneeUserId) {
          const [member] = await query(
            conn,
            "SELECT user_id FROM members WHERE project_id=? AND user_id=? AND role<>'viewer'",
            [thread.project_id, choice.assigneeUserId],
          );
          if (!member) throw new HttpError(400, "指派的人不是当前项目的可执行成员");
          await query(
            conn,
            "UPDATE agent_tasks SET target_type='human_member',target_id=?,status='awaiting_acceptance',claimed_by_type=NULL,claimed_by_id=NULL,execution_agent_id=NULL WHERE id=?",
            [choice.assigneeUserId, task.id],
          );
        } else if (task.target_type === "l2_session") {
          l2Handoffs++;
          await query(
            conn,
            "UPDATE agent_tasks SET target_id=?,claimed_by_id=?,execution_agent_id=NULL,status='pending_assignment' WHERE id=?",
            [nextSessionId, nextSessionId, task.id],
          );
        }
      }
    }
    // 勾选的未完成事项作为新迭代的正式任务交接过去，去向与 handoff 任务一致：
    // 目标为该迭代的 L2 会话，状态待指派，执行者留给 L2 决定。
    let itemNumber = Number(
      (
        await query(
          conn,
          "SELECT COALESCE(MAX(thread_number),0) n FROM agent_tasks WHERE origin_thread_id=?",
          [nextThreadId],
        )
      )[0]?.n || 0,
    );
    for (const item of taskItems) {
      const itemTaskId = randomUUID();
      itemNumber += 1;
      const assignee = item.assigneeUserId || "";
      if (assignee) {
        const [member] = await query(
          conn,
          "SELECT user_id FROM members WHERE project_id=? AND user_id=? AND role<>'viewer'",
          [thread.project_id, assignee],
        );
        if (!member) throw new HttpError(400, "指派的人不是当前项目的可执行成员");
      }
      await query(
        conn,
        `INSERT INTO agent_tasks(id,project_id,origin_thread_id,thread_number,original_thread_id,
        source_type,source_user_id,created_by_type,created_by_id,task_type,title,goal,
        document_refs,folder_refs,target_type,target_id,status,claimed_by_type,claimed_by_id,
        execution_mode,execution_agent_type)
        VALUES(?,?,?,?,?,'human_member',?,'human_member',?,'formal',?,?,'[]','[]',?,?,
        ?,?,?,?,'dsh_l3','dsh_l3')`,
        [
          itemTaskId,
          thread.project_id,
          nextThreadId,
          itemNumber,
          nextThreadId,
          user.id,
          user.id,
          item.title.slice(0, 240),
          (item.detail || item.title).slice(0, 20000),
          assignee ? "human_member" : "l2_session",
          assignee || nextSessionId,
          assignee ? "awaiting_acceptance" : "pending_assignment",
          assignee ? null : "l2_session",
          assignee ? null : nextSessionId,
        ],
      );
      await query(
        conn,
        "INSERT INTO agent_task_iteration_moves(id,task_id,workflow_id,from_thread_id,to_thread_id,decided_by,reason) VALUES(?,?,?,?,?,?,?)",
        [
          randomUUID(),
          itemTaskId,
          workflow.id,
          threadId,
          nextThreadId,
          user.id,
          `归档勾选事项：${item.title}`.slice(0, 2000),
        ],
      );
    }
    const snapshot = archiveJson(workflow.snapshot);
    snapshot.conclusion = data.conclusion;
    snapshot.notes = data.notes;
    snapshot.taskDecisions = taskChoices(snapshot, data);
    snapshot.nextThreadId = nextThreadId;
    snapshot.archivedBy = user.id;
    snapshot.archivedAt = new Date().toISOString();
    snapshot.workflowId = workflow.id;
    const plan = {
      conclusion: data.conclusion,
      taskDecisions: data.taskDecisions,
      notes: data.notes,
      nextIteration: { ...data.nextIteration, background: carriedBackground },
    };
    await query(
      conn,
      "UPDATE threads SET status='archived',archive_snapshot=?,archived_at=UTC_TIMESTAMP(3) WHERE id=?",
      [JSON.stringify(snapshot), threadId],
    );
    await query(
      conn,
      "UPDATE iteration_archive_workflows SET status='completed',plan=?,next_thread_id=?,decided_by=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?",
      [JSON.stringify(plan), nextThreadId, user.id, workflow.id],
    );
    await query(
      conn,
      "UPDATE assistant_replies r JOIN messages m ON m.id=r.message_id SET r.status='cancelled',r.finished_at=UTC_TIMESTAMP(3) WHERE m.thread_id=? AND r.status='queued'",
      [threadId],
    );
    await query(
      conn,
      "UPDATE agent_requests q JOIN messages m ON m.id=q.message_id SET q.status='failed',q.error='迭代已归档' WHERE m.thread_id=? AND q.status='queued'",
      [threadId],
    );
    await query(
      conn,
      "UPDATE coordinator_events SET status='failed',error='迭代已归档',finished_at=UTC_TIMESTAMP(3) WHERE thread_id=? AND status='queued'",
      [threadId],
    );
    await query(
      conn,
      "UPDATE connector_tasks SET status='cancelled',finished_at=UTC_TIMESTAMP(3),error='迭代已归档，任务留档' WHERE thread_id=? AND status IN ('queued','awaiting_approval')",
      [threadId],
    );
    await enqueue(conn, thread, workflow, "memory", user.id);
    if (l2Handoffs)
      await query(
        conn,
        "INSERT INTO coordinator_events(id,thread_id,kind,status,payload) VALUES(?,?,'l3_idle','queued',?)",
        [
          randomUUID(),
          nextThreadId,
          JSON.stringify({
            reason: "迭代归档交接",
            sourceThreadId: threadId,
            background: data.nextIteration.background,
            goal: data.nextIteration.goal,
          }),
        ],
      );
    return { status: "archived", nextThreadId };
  });
  publishWork(service.db, threadId);
  if (result.nextThreadId) publishWork(service.db, result.nextThreadId);
  return result;
}
