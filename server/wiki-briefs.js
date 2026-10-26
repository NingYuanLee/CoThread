import { randomUUID } from "node:crypto";
import { query } from "./db.js";

function briefText(title) {
  return ("《" + String(title || "记忆条目").trim() + "》有更新").slice(0, 160);
}

export async function refreshParticipantBriefs(conn, page) {
  const orgs = await query(
    conn,
    "SELECT org_id FROM project_org_links WHERE project_id=? AND role='participant'",
    [page.projectId],
  );
  const title = String(page.title || "记忆条目").slice(0, 160);
  const brief = briefText(title);
  for (const org of orgs) {
    const [existing] = await query(
      conn,
      "SELECT id FROM project_org_briefs WHERE org_id=? AND page_id=?",
      [org.org_id, page.id],
    );
    if (existing) {
      await query(conn, "UPDATE project_org_briefs SET title=?, brief=? WHERE id=?", [
        title,
        brief,
        existing.id,
      ]);
    } else {
      await query(
        conn,
        "INSERT INTO project_org_briefs(id,org_id,project_id,page_id,title,brief) VALUES(?,?,?,?,?,?)",
        [randomUUID(), org.org_id, page.projectId, page.id, title, brief],
      );
    }
  }
}

export async function backfillParticipantBriefs(conn, projectId, orgId) {
  const pages = await query(
    conn,
    "SELECT id, title FROM wiki_pages WHERE project_id=? AND status='current'",
    [projectId],
  );
  for (const page of pages) {
    const title = String(page.title || "记忆条目").slice(0, 160);
    await query(
      conn,
      "INSERT INTO project_org_briefs(id,org_id,project_id,page_id,title,brief) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE title=VALUES(title), brief=VALUES(brief)",
      [randomUUID(), orgId, projectId, page.id, title, briefText(title)],
    );
  }
}

export async function clearParticipantBriefs(conn, projectId, orgId) {
  await query(conn, "DELETE FROM project_org_briefs WHERE project_id=? AND org_id=?", [
    projectId,
    orgId,
  ]);
}
