/**
 * 项目进程信号的扫描器。
 *
 * 业务事件不再直接写队列，只把事实落在各业务日志里（项目变更、迭代目标背景变更、
 * 迭代归档、任务状态事件）；这里按项目维护每个来源的游标，定期扫描增量、过滤出
 * 「值得进入项目进程」的信号再写队列。文档版本不进入项目进程（有独立的文件索引作业）。
 *
 * 与成员发言一致：先落进度/事实，再由扫描生成待处理单元；不再在业务事务里写队列。
 */
import { query, transaction } from "./db.ts";
import type { Pool } from "mysql2/promise";
import type { Db } from "./types.ts";
import {
  isImportantIteration,
  isImportantTask,
  isTaskMilestoneTransition,
} from "./memory-signal-filter.ts";
import { maybeQueueProjectMemoryRun, noteProjectMemorySignal } from "./project-memory.ts";

/** 单个来源的扫描游标：扫到哪一条（时间 + 同时间的 id 断点）。 */
type ScanCursor = { at: string; id: string };

/** 项目变更行的最小形状（只用于 `lastCursor` 取末条游标）。 */
type CursorRow = Record<string, unknown>;

/** 项目级变更里值得进入项目进程的动作；与 service.projectChange 的调用方一致。 */
const MILESTONE_ACTIONS = Object.freeze([
  "created",
  "profile_updated",
  "archived",
  "restored",
  "member_added",
  "member_removed",
  "member_role_changed",
  "leader_transferred",
  "leader_migration_resolved",
  "admin_added",
  "admin_removed",
]);
const SCAN_BATCH = 200;

function marshalCursor(value: unknown): ScanCursor | null {
  if (!value) return null;
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  const record = parsed as { at?: unknown; id?: unknown } | null;
  if (!record?.at || !record?.id) return null;
  const at = String(record.at);
  return { at, id: String(record.id) };
}

function cursorClause(
  column: string,
  alias: string,
  cursor: ScanCursor | null,
): { sql: string; params: unknown[] } {
  if (!cursor) return { sql: "", params: [] };
  return {
    sql: ` AND (${column} > ? OR (${column} = ? AND ${alias} > ?))`,
    params: [cursor.at, cursor.at, cursor.id],
  };
}

function lastCursor(rows: CursorRow[], atKey: string, idKey: string): ScanCursor | null {
  const row = rows.at(-1);
  if (!row) return null;
  const at = row[atKey];
  return { at: at instanceof Date ? at.toISOString() : String(at), id: String(row[idKey]) };
}

const MARKS = (list: readonly unknown[]) => list.map(() => "?").join(",");

async function latestCursor(conn: Db, sql: string, params: unknown[]): Promise<ScanCursor | null> {
  const [row] = await query(conn, sql, params);
  return row ? { at: String(row.at), id: String(row.id) } : null;
}

/** 首次扫描只建立水位，不回放历史事实（历史由一次性回填负责）。 */
async function initializeCursor(conn: Db, projectId: string) {
  const [taskRow] = await query(
    conn,
    `SELECT COALESCE(MAX(e.id),0) maxId FROM agent_task_status_events e
     JOIN agent_tasks t ON t.id=e.task_id WHERE t.project_id=?`,
    [projectId],
  );
  return {
    taskEventId: Number(taskRow?.maxId || 0),
    milestone: await latestCursor(
      conn,
      `SELECT l.created_at at,l.id FROM project_change_logs l
       WHERE l.project_id=? ORDER BY l.created_at DESC,l.id DESC LIMIT 1`,
      [projectId],
    ),
    iterationContext: await latestCursor(
      conn,
      `SELECT c.created_at at,c.id FROM iteration_context_changes c
       JOIN threads t ON t.id=c.thread_id
       WHERE t.project_id=? ORDER BY c.created_at DESC,c.id DESC LIMIT 1`,
      [projectId],
    ),
    archive: await latestCursor(
      conn,
      `SELECT w.finished_at at,w.id FROM iteration_archive_workflows w
       JOIN threads t ON t.id=w.thread_id
       WHERE t.project_id=? AND w.status='completed' AND w.finished_at IS NOT NULL
       ORDER BY w.finished_at DESC,w.id DESC LIMIT 1`,
      [projectId],
    ),
  };
}

async function scanMilestones(conn: Db, projectId: string, cursor: ScanCursor | null) {
  const after = cursorClause("l.created_at", "l.id", cursor);
  const rows = await query(
    conn,
    `SELECT l.id,l.created_at at,l.action,l.details FROM project_change_logs l
     WHERE l.project_id=? AND l.action IN (${MARKS(MILESTONE_ACTIONS)})${after.sql}
     ORDER BY l.created_at,l.id LIMIT ?`,
    [projectId, ...MILESTONE_ACTIONS, ...after.params, SCAN_BATCH],
  );
  for (const row of rows) {
    const details = typeof row.details === "string" ? row.details : JSON.stringify(row.details);
    await noteProjectMemorySignal(
      conn,
      projectId,
      "milestone",
      row.id,
      `${row.action}：${details.slice(0, 220)}`,
      { urgent: true },
    );
  }
  return { inserted: rows.length, cursor: lastCursor(rows, "at", "id") };
}

async function scanIterationContexts(conn: Db, projectId: string, cursor: ScanCursor | null) {
  const after = cursorClause("c.created_at", "c.id", cursor);
  const rows = await query(
    conn,
    `SELECT c.id,c.created_at at,c.thread_id threadId,t.title FROM iteration_context_changes c
     JOIN threads t ON t.id=c.thread_id
     WHERE t.project_id=?${after.sql}
     ORDER BY c.created_at,c.id LIMIT ?`,
    [projectId, ...after.params, SCAN_BATCH],
  );
  for (const row of rows)
    await noteProjectMemorySignal(
      conn,
      projectId,
      "iteration_context",
      row.id,
      `迭代「${row.title || row.threadId}」变更目标或背景`,
      { urgent: true },
    );
  return { inserted: rows.length, cursor: lastCursor(rows, "at", "id") };
}

async function scanArchives(conn: Db, projectId: string, cursor: ScanCursor | null) {
  const after = cursorClause("w.finished_at", "w.id", cursor);
  const rows = await query(
    conn,
    `SELECT w.id,w.finished_at at,w.thread_id threadId,t.title,t.archive_snapshot snapshot
     FROM iteration_archive_workflows w JOIN threads t ON t.id=w.thread_id
     WHERE t.project_id=? AND w.status='completed' AND w.finished_at IS NOT NULL${after.sql}
     ORDER BY w.finished_at,w.id LIMIT ?`,
    [projectId, ...after.params, SCAN_BATCH],
  );
  let inserted = 0;
  for (const row of rows) {
    if (!(await isImportantIteration(conn, row.threadId))) continue;
    let snapshot = row.snapshot;
    if (typeof snapshot === "string") {
      try {
        snapshot = JSON.parse(snapshot);
      } catch {
        snapshot = {};
      }
    }
    const conclusion = String(snapshot?.conclusion || "");
    await noteProjectMemorySignal(
      conn,
      projectId,
      "archive",
      row.id,
      `归档迭代「${row.title || row.threadId}」；结论：${conclusion.slice(0, 220)}`,
      { urgent: true },
    );
    inserted++;
  }
  return { inserted, cursor: lastCursor(rows, "at", "id") };
}

async function scanTaskTransitions(conn: Db, projectId: string, cursor: { id?: unknown } | null) {
  const rows = await query(
    conn,
    `SELECT e.id,e.task_id taskId,e.from_status fromStatus,e.to_status toStatus,t.title
     FROM agent_task_status_events e JOIN agent_tasks t ON t.id=e.task_id
     WHERE t.project_id=? AND e.id>? ORDER BY e.id LIMIT ?`,
    [projectId, Number(cursor?.id || 0) || 0, SCAN_BATCH],
  );
  let inserted = 0;
  for (const row of rows) {
    if (!isTaskMilestoneTransition(row.fromStatus ?? null, row.toStatus)) continue;
    if (!(await isImportantTask(conn, projectId, row.taskId))) continue;
    await noteProjectMemorySignal(
      conn,
      projectId,
      "task",
      row.taskId,
      `${row.title || ""} → ${row.toStatus}`,
      { urgent: true },
    );
    inserted++;
  }
  return {
    inserted,
    cursor: rows.length ? { at: "", id: String(rows.at(-1).id) } : null,
  };
}

/** 新项目：先建空水位，让「项目初创」等首批事实在下一轮扫描中作为信号入队。 */
export async function startProjectMemoryScanState(db: Db, projectId: string) {
  await query(
    db,
    "INSERT IGNORE INTO project_memory_scan_state(project_id,scan_cursor,scanned_at) VALUES(?,?,NULL)",
    [
      projectId,
      JSON.stringify({
        taskEventId: 0,
        milestone: null,
        iterationContext: null,
        archive: null,
      }),
    ],
  );
}

/** 扫一个项目的增量；首次只建水位。 */
export async function scanProjectMemorySignals(db: Db, projectId: string) {
  if (!projectId) return { initialized: false, inserted: 0 };
  return transaction(db as Pool, async (conn) => {
    const [state] = await query(
      conn,
      "SELECT scan_cursor scanCursor FROM project_memory_scan_state WHERE project_id=? FOR UPDATE",
      [projectId],
    );
    if (!state) {
      const cursor = await initializeCursor(conn, projectId);
      await query(
        conn,
        `INSERT INTO project_memory_scan_state(project_id,scan_cursor,scanned_at) VALUES(?,?,UTC_TIMESTAMP(3))
         ON DUPLICATE KEY UPDATE scan_cursor=VALUES(scan_cursor),scanned_at=VALUES(scanned_at)`,
        [projectId, JSON.stringify(cursor)],
      );
      return { initialized: true, inserted: 0 };
    }
    const cursor = {
      taskEventId: 0,
      milestone: null,
      iterationContext: null,
      archive: null,
      ...(typeof state.scanCursor === "string"
        ? JSON.parse(state.scanCursor)
        : state.scanCursor || {}),
    };
    const milestones = await scanMilestones(conn, projectId, marshalCursor(cursor.milestone));
    const contexts = await scanIterationContexts(
      conn,
      projectId,
      marshalCursor(cursor.iterationContext),
    );
    const archives = await scanArchives(conn, projectId, marshalCursor(cursor.archive));
    const tasks = await scanTaskTransitions(conn, projectId, {
      id: cursor.taskEventId || 0,
    });
    const inserted = milestones.inserted + contexts.inserted + archives.inserted + tasks.inserted;
    const next = {
      taskEventId: Number(tasks.cursor?.id || cursor.taskEventId || 0),
      milestone: milestones.cursor || cursor.milestone,
      iterationContext: contexts.cursor || cursor.iterationContext,
      archive: archives.cursor || cursor.archive,
    };
    await query(
      conn,
      "UPDATE project_memory_scan_state SET scan_cursor=?,scanned_at=UTC_TIMESTAMP(3) WHERE project_id=?",
      [JSON.stringify(next), projectId],
    );
    if (inserted) await maybeQueueProjectMemoryRun(conn, projectId, true);
    return { initialized: false, inserted };
  });
}

/** 维护循环用：每次挑一个到期项目做增量扫描（新项目先建水位）。 */
export async function scanNextProjectMemoryProject(db: Db) {
  const [row] = await query(
    db,
    `SELECT p.id FROM projects p
     LEFT JOIN project_memory_scan_state s ON s.project_id=p.id
     WHERE p.archived_at IS NULL AND (
       s.project_id IS NULL OR s.scanned_at IS NULL
       OR s.scanned_at <= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 30 SECOND)
     )
     ORDER BY s.scanned_at IS NOT NULL,s.scanned_at,p.created_at LIMIT 1`,
  );
  if (!row) return false;
  await scanProjectMemorySignals(db, row.id);
  return true;
}
