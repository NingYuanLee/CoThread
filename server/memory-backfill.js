import { query } from "./db.js";
import { ensureProjectMemoryPage } from "./memory-pages.js";
import { upsertUtteranceMemory } from "./utterance-memory.js";
import { syncTaskMemory } from "./task-memory.js";
import { syncDocumentMemory } from "./document-memory.js";
import { syncThreadDiscussionMemory } from "./discussion-memory.js";

/**
 * 存量回填：把历史摘要表与未分类条目折算成五类记忆的基础条目。
 * 幂等：已有条目不重复建；每次只补缺。
 */
async function inferSubjects(db, projectId) {
  const pages = await query(
    db,
    "SELECT id FROM wiki_pages WHERE project_id=? AND subject_type IS NULL",
    [projectId],
  );
  let inferred = 0;
  for (const page of pages) {
    const sources = await query(
      db,
      "SELECT source_kind sourceKind FROM wiki_page_sources WHERE page_id=? LIMIT 5",
      [page.id],
    );
    const kinds = sources.map((source) => source.sourceKind);
    const subject = kinds.includes("document_version")
      ? "document"
      : kinds.includes("task")
        ? "task"
        : kinds.includes("thread") || kinds.includes("message")
          ? "discussion"
          : kinds.includes("archive")
            ? "project"
            : null;
    if (!subject) continue;
    await query(db, "UPDATE wiki_pages SET subject_type=? WHERE id=?", [subject, page.id]);
    inferred += 1;
  }
  return inferred;
}

export async function backfillProjectMemory(db, { projectId, createdBy = null } = {}) {
  if (!projectId) return null;
  const result = {
    inferredSubjects: 0,
    projectPage: null,
    utterancePages: 0,
    documentPages: 0,
    taskPages: 0,
    discussionPages: 0,
    notes: [],
  };
  result.inferredSubjects = await inferSubjects(db, projectId);
  result.projectPage = await ensureProjectMemoryPage(db, { projectId, createdBy });

  const memberRows = await query(
    db,
    `SELECT s.user_id userId,s.summary,u.name FROM agent_member_summaries s
     JOIN users u ON u.id=s.user_id WHERE s.project_id=?`,
    [projectId],
  );
  for (const row of memberRows) {
    const [existing] = await query(
      db,
      "SELECT id FROM wiki_pages WHERE project_id=? AND subject_type='utterance' AND about_user_id=? LIMIT 1",
      [projectId, row.userId],
    );
    if (existing) {
      result.notes.push("发言记忆已存在：" + row.name);
      continue;
    }
    await upsertUtteranceMemory(db, projectId, {
      memberId: row.userId,
      memberName: row.name,
      understanding: row.summary,
      createdBy,
    });
    result.utterancePages += 1;
  }

  const artifacts = await query(
    db,
    `SELECT DISTINCT a.id artifactId FROM agent_document_summaries s
     JOIN versions v ON v.id=s.version_id JOIN artifacts a ON a.id=v.artifact_id
     WHERE a.project_id=? AND a.deleted_at IS NULL`,
    [projectId],
  );
  for (const artifact of artifacts) {
    const [latest] = await query(
      db,
      "SELECT id FROM versions WHERE artifact_id=? ORDER BY version DESC LIMIT 1",
      [artifact.artifactId],
    );
    if (!latest) continue;
    await syncDocumentMemory(db, {
      projectId,
      artifactId: artifact.artifactId,
      versionId: latest.id,
      createdBy,
    });
    result.documentPages += 1;
  }

  const tasks = await syncTaskMemory(db, { projectId, createdBy });
  result.taskPages = tasks?.taskPageIds?.length || 0;

  const threads = await query(
    db,
    "SELECT id FROM threads WHERE project_id=? AND status='archived' ORDER BY archived_at",
    [projectId],
  );
  for (const thread of threads) {
    const page = await syncThreadDiscussionMemory(db, {
      projectId,
      threadId: thread.id,
      createdBy,
    });
    if (page?.pageId) result.discussionPages += 1;
  }
  const { refreshAllCaches } = await import("./memory-cache.js");
  await refreshAllCaches(db, projectId);
  return result;
}
