import { randomUUID } from "node:crypto";
import { query, transaction } from "./db.js";

/** Gradually give existing active projects a status node without rewriting history. */
export async function queueMissingProjectStatus(db, projectId = null) {
  const [project] = await query(
    db,
    `SELECT p.id,p.created_by createdBy FROM projects p
     LEFT JOIN project_status_nodes s ON s.project_id=p.id
     WHERE p.archived_at IS NULL AND s.project_id IS NULL ${projectId ? "AND p.id=?" : ""}
     ORDER BY p.created_at,p.id LIMIT 1`,
    projectId ? [projectId] : [],
  );
  if (!project?.createdBy) return null;
  const { ensureProjectStatusNode } = await import("./project-status-node.js");
  await ensureProjectStatusNode(db, project.id, project.createdBy);
  return queueProjectStatusRecheck(db, project.id, true);
}

/** Recheck source records at most daily. Queueing and the check cursor commit together. */
export async function queueProjectStatusRecheck(db, projectId = null, force = false) {
  return transaction(db, async (conn) => {
    const [status] = await query(
      conn,
      `SELECT s.project_id projectId,s.page_id pageId FROM project_status_nodes s
       JOIN projects p ON p.id=s.project_id AND p.archived_at IS NULL
       WHERE ${projectId ? "s.project_id=? AND" : ""} ${force ? "1=1" : "(s.last_checked_at IS NULL OR s.last_checked_at<=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 DAY))"}
       AND NOT EXISTS (SELECT 1 FROM agent_project_memory_queue q WHERE q.project_id=s.project_id AND q.source_kind<>'message')
       ORDER BY s.last_checked_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
      projectId ? [projectId] : [],
    );
    if (!status) return null;
    let sources = await query(
      conn,
      `SELECT source_kind kind,source_id id,label FROM wiki_page_sources
       WHERE page_id=? AND source_kind IN ('milestone','iteration_context','archive','thread','task','document_version','memory_page')
       ORDER BY created_at DESC LIMIT 40`,
      [status.pageId],
    );
    if (!sources.length)
      sources = (
        await query(
          conn,
          "SELECT id FROM project_change_logs WHERE project_id=? AND action IN ('created','profile_updated') ORDER BY created_at DESC LIMIT 1",
          [status.projectId],
        )
      ).map((row) => ({ kind: "milestone", id: row.id, label: "项目现状核对" }));
    for (const source of sources)
      await query(
        conn,
        `INSERT INTO agent_project_memory_queue(id,project_id,source_kind,source_id,hint)
       VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE hint=VALUES(hint),signal_revision=signal_revision+1,
       available_at=LEAST(available_at,UTC_TIMESTAMP(3))`,
        [
          randomUUID(),
          status.projectId,
          source.kind,
          source.id,
          String(source.label || "项目现状核对").slice(0, 255),
        ],
      );
    await query(
      conn,
      "UPDATE project_status_nodes SET last_checked_at=UTC_TIMESTAMP(3) WHERE project_id=?",
      [status.projectId],
    );
    return sources.length ? status.projectId : null;
  });
}
