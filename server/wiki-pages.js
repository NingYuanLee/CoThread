import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { refreshParticipantBriefs } from "./wiki-briefs.js";
import { projectArchived } from "./memory-timeline.js";
import { visibleFileIndexSql, visibleFileSourceSql } from "./file-index-visibility.js";
import {
  intactConversationMemorySql,
  readableConversationMemorySql,
} from "./conversation-memory-integrity.js";
import { hydrateFileIndexRoots } from "./file-index-roots.js";
import { hydrateFileIndexGroups } from "./file-index-groups.js";
import { hydrateFileIndexPaths } from "./file-index-path.js";

const sourceKinds = ["message", "document_version", "task", "archive"];
const pageId = z.string().uuid();
const pageSelect = [
  "p.id,p.project_id projectId,p.subject_type subject,p.memory_subtype subtype,p.title,p.body,p.status,",
  "p.created_by createdBy,p.updated_by updatedBy,p.created_at createdAt,p.updated_at updatedAt",
].join(" ");

function mapPage(row) {
  return {
    id: row.id,
    projectId: row.projectId,
    subject: row.subject || null,
    subtype: row.subtype || null,
    title: row.title,
    body: row.body,
    status: row.status,
    sourceNeedsReview: Boolean(row.sourceNeedsReview),
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function access(service, user, projectId, write) {
  const member = await service.member(user, projectId, write);
  return { canWrite: member.role !== "viewer" };
}

export async function listWikiPages(service, user, projectId, q = "") {
  const gate = await access(service, user, projectId, false);
  const text = String(q || "").trim();
  const rows = text
    ? await query(
        service.db,
        `SELECT ${pageSelect} FROM wiki_pages p
          WHERE p.project_id=? AND ${visibleFileIndexSql("p")} AND ${readableConversationMemorySql("p")} AND MATCH(p.title, p.body) AGAINST (? IN NATURAL LANGUAGE MODE)
          ORDER BY MATCH(p.title, p.body) AGAINST (? IN NATURAL LANGUAGE MODE) DESC, p.updated_at DESC`,
        [projectId, text, text],
      )
    : await query(
        service.db,
        `SELECT ${pageSelect} FROM wiki_pages p WHERE p.project_id=? AND ${visibleFileIndexSql("p")} AND ${readableConversationMemorySql("p")} ORDER BY p.updated_at DESC, p.id`,
        [projectId],
      );
  const rootPages = await hydrateFileIndexRoots(service.db, projectId, rows);
  const groupPages = await hydrateFileIndexGroups(service.db, projectId, rootPages);
  return {
    pages: (await hydrateFileIndexPaths(service.db, projectId, groupPages)).map(mapPage),
    canWrite: gate.canWrite,
  };
}

export async function getWikiPage(service, user, projectId, id) {
  if (typeof service.db.getConnection === "function")
    return transaction(service.db, (conn) =>
      getWikiPage(Object.assign(Object.create(service), { db: conn }), user, projectId, id),
    );
  await access(service, user, projectId, false);
  pageId.parse(id);
  const [row] = await query(
    service.db,
    `SELECT ${pageSelect} FROM wiki_pages p WHERE p.id=? AND p.project_id=? AND ${visibleFileIndexSql("p")} AND ${readableConversationMemorySql("p")}`,
    [id, projectId],
  );
  if (!row) throw new HttpError(404, "记忆条目不存在");
  const sources = await query(
    service.db,
    `SELECT s.id,s.source_kind sourceKind,s.source_id sourceId,s.label FROM wiki_page_sources s
     WHERE s.page_id=? AND ${visibleFileSourceSql("s")} ORDER BY s.created_at,s.id`,
    [id],
  );
  const rootPages = await hydrateFileIndexRoots(service.db, projectId, [row]);
  const groupPages = await hydrateFileIndexGroups(service.db, projectId, rootPages);
  const [page] = await hydrateFileIndexPaths(service.db, projectId, groupPages);
  const { captureMemoryRevision } = await import("./memory-history.js");
  // Retain every original dependency, including a source hidden from the current preview.
  const memoryRevisionId = await captureMemoryRevision(service.db, page);
  return { page: { ...mapPage(page), memoryRevisionId }, sources };
}

export async function createWikiPage(service, user, projectId, input) {
  await access(service, user, projectId, true);
  if (await projectArchived(service.db, projectId))
    throw new HttpError(409, "项目已归档，项目记忆已封存，只能查看");
  const data = z
    .object({
      title: z.string().trim().min(1).max(160),
      body: z.string().max(60000),
    })
    .parse(input);
  const id = randomUUID();
  await query(
    service.db,
    "INSERT INTO wiki_pages(id,project_id,title,body,status,created_by,updated_by) VALUES(?,?,?,?,'current',?,?)",
    [id, projectId, data.title, data.body, user.id, user.id],
  );
  await query(
    service.db,
    "INSERT INTO project_change_logs(id,project_id,actor_user_id,action,details) VALUES(?,?,?,?,?)",
    [
      randomUUID(),
      projectId,
      user.id,
      "wiki_page_created",
      JSON.stringify({ pageId: id, title: data.title }),
    ],
  );
  await refreshParticipantBriefs(service.db, { id, projectId, title: data.title });
  return getWikiPage(service, user, projectId, id);
}

async function insertCompiled(conn, page) {
  const id = randomUUID();
  await query(
    conn,
    "INSERT INTO wiki_pages(id,project_id,subject_type,memory_subtype,title,body,status,created_by,updated_by) VALUES(?,?,?,?,?,?,'current',?,?)",
    [
      id,
      page.projectId,
      page.subject,
      page.subtype,
      page.title.slice(0, 160),
      page.body,
      page.userId,
      page.userId,
    ],
  );
  await query(
    conn,
    "INSERT INTO wiki_page_sources(id,page_id,source_kind,source_id,label) VALUES(?,?,?,?,?)",
    [randomUUID(), id, "archive", page.workflowId, page.archiveLabel.slice(0, 240)],
  );
  for (const source of page.sources) {
    if (!sourceKinds.includes(source.kind)) continue;
    await query(
      conn,
      "INSERT INTO wiki_page_sources(id,page_id,source_kind,source_id,label) VALUES(?,?,?,?,?)",
      [randomUUID(), id, source.kind, source.sourceId, String(source.label || "").slice(0, 240)],
    );
  }
  return id;
}

export async function recordArchivePages(conn, input) {
  const [existing] = await query(
    conn,
    "SELECT p.id FROM wiki_pages p JOIN wiki_page_sources s ON s.page_id=p.id WHERE s.source_kind='archive' AND s.source_id=? LIMIT 1",
    [input.workflowId],
  );
  if (existing) return;
  const titleBase = String(input.threadTitle || "迭代").trim() || "迭代";
  const conclusion = String(input.conclusion || "").trim() || "（确认时没有写下结论）";
  const notes = String(input.notes || "").trim();
  const decisions = Array.isArray(input.taskDecisions) ? input.taskDecisions : [];
  const decisionLines = decisions.map((item) => {
    const label =
      item.disposition === "handoff"
        ? "交接"
        : item.disposition === "background"
          ? "写入背景"
          : "留档";
    return `- ${label}${item.reason ? "：" + item.reason : ""}`;
  });
  const taskSources = decisions
    .filter((item) => item.taskId)
    .map((item) => ({
      kind: "task",
      sourceId: item.taskId,
      label: item.reason || item.disposition || "任务",
    }));
  const retroBody = ["## 结论", conclusion, notes ? "## 其他事项\n\n" + notes : ""]
    .filter(Boolean)
    .join("\n\n");
  const decisionBody = [
    "## 结论",
    conclusion,
    "## 未完成项",
    decisionLines.join("\n") || "（没有未完成项）",
  ].join("\n\n");
  const shared = {
    projectId: input.projectId,
    userId: input.userId,
    workflowId: input.workflowId,
    archiveLabel: "归档确认",
    sources: taskSources,
  };
  const retroId = await insertCompiled(conn, {
    ...shared,
    subject: "discussion",
    subtype: "problem_review",
    title: titleBase + " · 复盘",
    body: retroBody,
  });
  const decisionId = await insertCompiled(conn, {
    ...shared,
    subject: "project",
    subtype: "iteration_archived",
    title: titleBase + " · 决策",
    body: decisionBody,
  });
  await refreshParticipantBriefs(conn, {
    id: retroId,
    projectId: input.projectId,
    title: titleBase + " · 复盘",
  });
  await refreshParticipantBriefs(conn, {
    id: decisionId,
    projectId: input.projectId,
    title: titleBase + " · 决策",
  });
  await query(
    conn,
    "INSERT INTO project_change_logs(id,project_id,actor_user_id,action,details) VALUES(?,?,?,?,?)",
    [
      randomUUID(),
      input.projectId,
      input.userId,
      "wiki_archive_pages",
      JSON.stringify({ workflowId: input.workflowId, retroId, decisionId }),
    ],
  );
}
