import { query, transaction } from "./db.js";
import { HttpError } from "./http-error.js";
import { projectArchived } from "./memory-timeline.js";
import { acquireNamedLock } from "./named-lock.js";
import { DOCUMENT_LIBRARY_FOLDER_SQL } from "./documents/index.js";

const liveFiles = `FROM artifacts a JOIN versions v ON v.artifact_id=a.id
  LEFT JOIN document_folders f ON f.id=a.folder_id
  LEFT JOIN version_recycle r ON r.version_id=v.id
  LEFT JOIN file_index_entries fi ON fi.project_id=a.project_id AND fi.artifact_id=a.id
  LEFT JOIN wiki_pages p ON p.id=fi.page_id AND p.status='current'
  LEFT JOIN versions summary_version ON summary_version.id=fi.indexed_version_id AND summary_version.artifact_id=a.id
  LEFT JOIN version_recycle summary_recycle ON summary_recycle.version_id=summary_version.id
  LEFT JOIN agent_document_summaries previous_summary ON previous_summary.version_id=summary_version.id AND summary_recycle.version_id IS NULL
  LEFT JOIN agent_document_memory_queue q ON q.version_id=v.id
  WHERE a.project_id=? AND a.deleted_at IS NULL AND a.purged_at IS NULL AND r.version_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM versions newer LEFT JOIN version_recycle nr ON nr.version_id=newer.id
    WHERE newer.artifact_id=a.id AND newer.version>v.version AND nr.version_id IS NULL)
  ${DOCUMENT_LIBRARY_FOLDER_SQL}`;

export async function readFileIndexJobs(db, projectId) {
  const [coverage] = await query(
    db,
    `SELECT COUNT(*) total,
    COALESCE(SUM(p.id IS NOT NULL AND fi.indexed_version_id=v.id AND q.version_id IS NULL AND (fi.summary_sha256 IS NULL OR (fi.summary_sha256 <=> v.sha256 AND fi.summary_mime <=> v.mime)) AND fi.recognition_status='recognized'),0) recognized,
    COALESCE(SUM(p.id IS NOT NULL AND fi.indexed_version_id=v.id AND q.version_id IS NULL AND (fi.summary_sha256 IS NULL OR (fi.summary_sha256 <=> v.sha256 AND fi.summary_mime <=> v.mime)) AND fi.recognition_status='partial'),0) partial,
    COALESCE(SUM(q.version_id IS NULL AND (p.id IS NULL OR fi.indexed_version_id<>v.id OR (fi.summary_sha256 IS NOT NULL AND (NOT (fi.summary_sha256 <=> v.sha256) OR NOT (fi.summary_mime <=> v.mime))) OR fi.recognition_status='unrecognized')),0) unrecognized,
    COALESCE(SUM(q.last_error IS NOT NULL OR (q.version_id IS NULL AND p.id IS NOT NULL AND fi.indexed_version_id=v.id AND fi.recognition_status='failed')),0) failed,
    COALESCE(SUM(q.version_id IS NOT NULL),0) pending ${liveFiles}`,
    [projectId],
  );
  const issues = await query(
    db,
    `SELECT a.id artifactId,a.title,v.id versionId,v.version,v.filename,
    p.id pageId,IF(p.id IS NULL,'unrecognized',fi.recognition_status) recognitionStatus,fi.recognition_note recognitionNote,
    q.available_at availableAt ${liveFiles}
    AND (p.id IS NULL OR fi.recognition_status<>'recognized' OR q.version_id IS NOT NULL)
    ORDER BY (fi.recognition_status='failed') DESC,q.available_at,a.id LIMIT 20`,
    [projectId],
  );
  return {
    coverage: Object.fromEntries(
      Object.entries(coverage).map(([key, value]) => [key, Number(value)]),
    ),
    issues,
  };
}

export async function listFileIndexIssues(db, projectId, options = {}) {
  const positiveInt = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 1 ? Math.trunc(number) : fallback;
  };
  const pageSize = Math.min(100, positiveInt(options.pageSize, 10));
  const requestedPage = Math.min(1000000, positiveInt(options.page, 1));
  const keyword = typeof options.keyword === "string" ? options.keyword.trim().slice(0, 200) : "";
  const status = typeof options.status === "string" ? options.status : "";
  if (status && !["recognized", "partial", "unrecognized", "failed", "pending"].includes(status))
    throw new HttpError(400, "无效的识别状态");
  const queue = typeof options.queue === "string" ? options.queue : "";
  if (queue && !["pending", "idle"].includes(queue)) throw new HttpError(400, "无效的处理状态");
  const statusExpr = `CASE WHEN q.last_error IS NOT NULL THEN 'failed'
    WHEN q.version_id IS NOT NULL THEN 'pending'
    WHEN p.id IS NULL OR fi.indexed_version_id<>v.id OR (fi.summary_sha256 IS NOT NULL AND (NOT (fi.summary_sha256 <=> v.sha256) OR NOT (fi.summary_mime <=> v.mime))) THEN 'unrecognized'
    ELSE fi.recognition_status END`;
  const filters = ` ${queue === "pending" ? "AND q.version_id IS NOT NULL" : queue === "idle" ? "AND q.version_id IS NULL" : ""}
    ${status ? `AND ${statusExpr}=?` : ""}
    ${keyword ? "AND LOCATE(LOWER(?),LOWER(CONCAT_WS(' ',a.title,v.filename,fi.recognition_note)))>0" : ""}`;
  const params = [projectId, ...(status ? [status] : []), ...(keyword ? [keyword] : [])];
  const [count] = await query(db, `SELECT COUNT(*) total ${liveFiles} ${filters}`, params);
  const total = Number(count.total);
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
  const rows = await query(
    db,
    `SELECT a.id artifactId,a.title,v.version,v.filename,
    CASE WHEN fi.indexed_version_id<>v.id OR (fi.summary_sha256 IS NOT NULL AND
      (NOT (fi.summary_sha256 <=> v.sha256) OR NOT (fi.summary_mime <=> v.mime))) THEN NULL ELSE p.id END pageId,
    CASE WHEN (q.operation='update' OR fi.indexed_version_id<>v.id OR
      (fi.summary_sha256 IS NOT NULL AND (NOT (fi.summary_sha256 <=> v.sha256) OR NOT (fi.summary_mime <=> v.mime))))
      THEN previous_summary.summary ELSE NULL END previousSummary,
    summary_version.version previousSummaryVersion,
    ${statusExpr} recognitionStatus,COALESCE(q.last_error,fi.recognition_note) recognitionNote,
    q.available_at availableAt,(q.version_id IS NOT NULL) pending,q.processing_state processingState,
    q.operation,q.trigger_origin triggerOrigin,fi.indexed_version_id summaryVersionId,v.id versionId ${liveFiles} ${filters}
    ORDER BY (fi.recognition_status='failed') DESC,q.available_at,a.id LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return { rows, total, page, pageSize };
}

export async function retryFileIndexJob(service, user, projectId, artifactId) {
  await service.member(user, projectId, true);
  if (await projectArchived(service.db, projectId))
    throw new HttpError(409, "项目已归档，记忆已封存");
  const [selected] = await query(service.db, `SELECT v.id versionId ${liveFiles} AND a.id=?`, [
    projectId,
    artifactId,
  ]);
  if (!selected) throw new HttpError(404, "文件不存在或已回收");
  const lock = await acquireNamedLock(service.db, `cothread-document-memory:${selected.versionId}`);
  if (!lock) throw new HttpError(409, "该文件正在识别，请稍后重试");
  let result;
  try {
    result = await transaction(service.db, async (conn) => {
      const [file] = await query(
        conn,
        `SELECT a.id,v.id versionId,v.sha256,v.mime,p.id pageId ${liveFiles} AND a.id=? FOR UPDATE`,
        [projectId, artifactId],
      );
      if (!file) throw new HttpError(404, "文件不存在或已回收");
      if (file.versionId !== selected.versionId)
        throw new HttpError(409, "文件版本已变化，请刷新后重试");
      const [summary] = await query(
        conn,
        `SELECT s.version_id FROM agent_document_summaries s
        JOIN versions previous ON previous.id=s.version_id WHERE previous.artifact_id=? LIMIT 1`,
        [artifactId],
      );
      await query(
        conn,
        `INSERT INTO agent_document_memory_queue
        (version_id,available_at,operation,trigger_origin,processing_state,queued_at,content_sha256,content_mime,claimed_at,last_error)
        VALUES(?,UTC_TIMESTAMP(3),?,'manual','queued',UTC_TIMESTAMP(3),?,?,NULL,NULL)
        ON DUPLICATE KEY UPDATE available_at=UTC_TIMESTAMP(3),operation=VALUES(operation),trigger_origin='manual',
        processing_state='queued',queued_at=UTC_TIMESTAMP(3),content_sha256=VALUES(content_sha256),
        content_mime=VALUES(content_mime),claimed_at=NULL,last_error=NULL`,
        [file.versionId, summary ? "update" : "create", file.sha256, file.mime],
      );
      return { artifactId, versionId: file.versionId };
    });
  } finally {
    await lock.release();
  }
  const { publishWork } = await import("./work-events.js");
  publishWork(service.db);
  return result;
}
export async function listFileIndexDiscoveryHistory(db, projectId, options = {}) {
  const integer = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : fallback;
  };
  const pageSize = Math.min(100, integer(options.pageSize, 10));
  const requestedPage = Math.min(1000000, integer(options.page, 1));
  const keyword = typeof options.keyword === "string" ? options.keyword.trim().slice(0, 200) : "";
  const operation = typeof options.operation === "string" ? options.operation : "";
  if (operation && !["create", "update", "delete"].includes(operation))
    throw new HttpError(400, "无效的处理类型");
  const where = `project_id=? ${operation ? "AND operation=?" : ""} ${keyword ? "AND LOCATE(LOWER(?),LOWER(title))>0" : ""}`;
  const params = [projectId, ...(operation ? [operation] : []), ...(keyword ? [keyword] : [])];
  const [count] = await query(
    db,
    `SELECT COUNT(*) total FROM file_index_discovery_items WHERE ${where}`,
    params,
  );
  const total = Number(count.total);
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
  const rows = await query(
    db,
    `SELECT id,artifact_id artifactId,version_id versionId,title,operation,created_at createdAt
    FROM file_index_discovery_items WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return { rows, page, pageSize, total };
}
