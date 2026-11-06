import { query } from "./db.ts";
import { upsertUtteranceMemory } from "./utterance-memory.ts";
import { syncTaskMemory } from "./task-memory.ts";
import { syncDocumentMemory } from "./document-memory.ts";
import { queueConversationThread } from "./conversation-memory-store.js";
import { folderRootKind } from "./documents/index.ts";
import { ensureFileIndexRoots } from "./file-index-roots.ts";
import type { Db } from "./types.ts";

/** 回填结果计数。 */
type BackfillResult = {
  inferredSubjects: number;
  utterancePages: number;
  documentPages: number;
  taskPages: number;
  discussionPages: number;
  discussionQueuedThreads: number;
  notes: string[];
};

/**
 * 存量回填：把历史摘要表与未分类条目折算成五类记忆的基础条目。
 * 幂等：已有条目不重复建；每次只补缺。
 */
async function inferSubjects(db: Db, projectId: string): Promise<number> {
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

export async function backfillProjectMemory(
  db: Db,
  { projectId, createdBy = null }: { projectId?: string | null; createdBy?: string | null } = {},
): Promise<BackfillResult | null> {
  if (!projectId) return null;
  const result: BackfillResult = {
    inferredSubjects: 0,
    utterancePages: 0,
    documentPages: 0,
    taskPages: 0,
    discussionPages: 0,
    discussionQueuedThreads: 0,
    notes: [],
  };
  result.inferredSubjects = await inferSubjects(db, projectId);
  await ensureFileIndexRoots(db, projectId, createdBy);

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
    `SELECT a.id artifactId,a.folder_id folderId,a.created_by createdBy FROM artifacts a
     WHERE a.project_id=? AND a.deleted_at IS NULL AND a.purged_at IS NULL AND a.folder_id IS NOT NULL`,
    [projectId],
  );
  for (const artifact of artifacts) {
    const root = await folderRootKind(db, artifact.folderId);
    if (
      !root ||
      ![
        "project_official",
        "project_cache",
        "project_outputs",
        "project_miniprogram",
        "iteration_cache",
        "iteration_outputs",
      ].includes(root)
    )
      continue;
    const [latest] = await query(
      db,
      `SELECT v.id FROM versions v LEFT JOIN version_recycle r ON r.version_id=v.id
       WHERE v.artifact_id=? AND r.version_id IS NULL ORDER BY v.version DESC,v.created_at DESC,v.id DESC LIMIT 1`,
      [artifact.artifactId],
    );
    if (!latest) continue;
    await syncDocumentMemory(db, {
      projectId,
      artifactId: artifact.artifactId,
      versionId: latest.id,
      createdBy: createdBy || artifact.createdBy,
    });
    const { queueDocumentMemory } = await import("./project-memory.js");
    await queueDocumentMemory(db, latest.id);
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
    const queued = await queueConversationThread(db, projectId, thread.id, { backfill: true });
    if (queued.queued) result.discussionQueuedThreads += 1;
  }
  const { refreshAllCaches } = await import("./memory-cache.ts");
  await refreshAllCaches(db, projectId);
  return result;
}

/**
 * 找出尚未完成一次存量回填的项目。回填状态单独持久化，避免维护任务每轮
 * 都重新扫描所有项目，同时允许失败项目在下一轮自动重试。
 */
export async function claimProjectMemoryBackfill(db: Db): Promise<string | null> {
  const [project] = await query(
    db,
    `SELECT p.id
       FROM projects p
       LEFT JOIN project_memory_backfills b ON b.project_id=p.id
      WHERE p.archived_at IS NULL
        AND (b.project_id IS NULL OR b.status IN ('queued','failed')
             OR (b.status='running' AND b.updated_at < DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE)))
      ORDER BY COALESCE(b.updated_at,p.created_at),p.id
      LIMIT 1`,
  );
  if (!project) return null;
  await query(
    db,
    `INSERT INTO project_memory_backfills(project_id,status,attempts,updated_at)
     VALUES(?,'running',1,UTC_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE status='running',attempts=attempts+1,updated_at=UTC_TIMESTAMP(3)`,
    [project.id],
  );
  return project.id;
}

export async function completeProjectMemoryBackfill(
  db: Db,
  projectId: string,
  error: unknown = null,
): Promise<void> {
  await query(
    db,
    `INSERT INTO project_memory_backfills(project_id,status,attempts,last_error,completed_at,updated_at)
     VALUES(?,?,1,?,?,UTC_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE status=VALUES(status),last_error=VALUES(last_error),
       completed_at=VALUES(completed_at),updated_at=UTC_TIMESTAMP(3)`,
    [
      projectId,
      error ? "failed" : "completed",
      error ? String(error).slice(0, 500) : null,
      error ? null : new Date(),
    ],
  );
}
