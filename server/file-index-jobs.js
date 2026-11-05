import { randomUUID } from "node:crypto";
import { query, transaction } from "./db.ts";
import { HttpError } from "./http-error.ts";
import { projectArchived } from "./memory-timeline.js";
import { closeStaleFileIndexScanBatches } from "./file-index-discovery.js";
import { acquireNamedLock } from "./named-lock.ts";
import { DOCUMENT_LIBRARY_FOLDER_SQL } from "./documents/index.ts";

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

/** 识别结果只表达内容结论：不支持、等待都算结论，处理出错属于处理状态。 */
const contentResultSql = `CASE
  WHEN q.version_id IS NOT NULL AND q.last_error IS NOT NULL
    AND fi.indexed_version_id=v.id AND fi.recognition_status='unrecognized' THEN 'unrecognized'
  WHEN q.version_id IS NOT NULL THEN 'pending'
  WHEN p.id IS NULL OR fi.indexed_version_id IS NULL OR fi.indexed_version_id<>v.id
    OR (fi.summary_sha256 IS NOT NULL AND (NOT (fi.summary_sha256 <=> v.sha256) OR NOT (fi.summary_mime <=> v.mime))) THEN 'unrecognized'
  WHEN fi.recognition_status='failed' THEN 'pending'
  ELSE fi.recognition_status END`;

/** 处理状态：已有识别结论的统一算处理成功；只有等待识别时才细分处理中/排队中/处理失败。 */
const processingStateSql = `CASE
  WHEN ${contentResultSql}<>'pending' THEN 'success'
  WHEN q.processing_state='processing' THEN 'processing'
  WHEN q.version_id IS NOT NULL AND q.last_error IS NOT NULL
    AND fi.indexed_version_id=v.id AND fi.recognition_status='failed' THEN 'failed'
  WHEN q.version_id IS NOT NULL THEN 'pending'
  WHEN fi.indexed_version_id=v.id AND fi.recognition_status='failed' THEN 'failed'
  ELSE 'pending' END`;

export async function readFileIndexJobs(db, projectId) {
  const [coverage] = await query(
    db,
    `SELECT COUNT(*) total,
    COALESCE(SUM(status='recognized'),0) recognized,
    COALESCE(SUM(status='partial'),0) partial,
    COALESCE(SUM(status='unrecognized'),0) unrecognized,
    COALESCE(SUM(status='pending'),0) pending
    FROM (SELECT ${contentResultSql} status ${liveFiles}) f`,
    [projectId],
  );
  const issues = await query(
    db,
    `SELECT a.id artifactId,a.title,v.id versionId,v.version,v.filename,
    p.id pageId,${contentResultSql} recognitionStatus,${processingStateSql} processingState,
    fi.recognition_note recognitionNote,
    q.available_at availableAt ${liveFiles}
    AND (p.id IS NULL OR fi.recognition_status<>'recognized' OR q.version_id IS NOT NULL)
    ORDER BY (${processingStateSql}='failed') DESC,q.available_at,a.id LIMIT 20`,
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
  if (status && !["recognized", "partial", "unrecognized", "pending"].includes(status))
    throw new HttpError(400, "无效的识别结果");
  const queue = typeof options.queue === "string" ? options.queue : "";
  if (queue && !["success", "processing", "pending", "failed"].includes(queue))
    throw new HttpError(400, "无效的处理状态");
  const queueFilter = queue ? `AND ${processingStateSql}='${queue}'` : "";
  const filters = ` ${queueFilter}
    ${status ? `AND ${contentResultSql}=?` : ""}
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
    ${contentResultSql} recognitionStatus,COALESCE(q.last_error,fi.recognition_note) recognitionNote,
    q.available_at availableAt,(q.version_id IS NOT NULL) pending,${processingStateSql} processingState,
    q.operation,q.trigger_origin triggerOrigin,fi.indexed_version_id summaryVersionId,v.id versionId ${liveFiles} ${filters}
    ORDER BY (${processingStateSql}='failed') DESC,q.available_at,a.id LIMIT ? OFFSET ?`,
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
  const { publishWork } = await import("./work-events.ts");
  publishWork(service.db);
  return result;
}
/** 手动扫描：创建一次项目扫描批次并入队；已有待办项目扫描时直接复用。 */
export async function requestFileIndexScan(service, user, projectId) {
  await service.member(user, projectId, true);
  if (await projectArchived(service.db, projectId))
    throw new HttpError(409, "项目已归档，记忆已封存");
  const result = await transaction(service.db, async (conn) => {
    const [pending] = await query(
      conn,
      "SELECT batch_id batchId FROM file_index_project_reconciliations WHERE project_id=? FOR UPDATE",
      [projectId],
    );
    if (pending) return { queued: false, batchId: pending.batchId || null };
    const batchId = randomUUID();
    await query(
      conn,
      "INSERT INTO file_index_scan_batches(id,project_id,trigger_type) VALUES(?,?,'manual')",
      [batchId, projectId],
    );
    await query(
      conn,
      "INSERT INTO file_index_project_reconciliations(project_id,batch_id) VALUES(?,?)",
      [projectId, batchId],
    );
    return { queued: true, batchId };
  });
  if (result.queued) {
    const { publishWork } = await import("./work-events.ts");
    publishWork(service.db);
  }
  return result;
}

/** 扫描批次列表；数量从明细实时统计，不单独维护计数。 */
export async function listFileIndexScanBatches(db, projectId, options = {}) {
  // 打开扫描记录时顺带关闭已无待办的悬挂批次（进程中断、日志批次窗口结束）。
  await closeStaleFileIndexScanBatches(db);
  const positiveInt = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 1 ? Math.trunc(number) : fallback;
  };
  const pageSize = Math.min(100, positiveInt(options.pageSize, 10));
  const requestedPage = Math.min(1000000, positiveInt(options.page, 1));
  const [count] = await query(
    db,
    "SELECT COUNT(*) total FROM file_index_scan_batches WHERE project_id=?",
    [projectId],
  );
  const total = Number(count.total);
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
  const rows = await query(
    db,
    `SELECT b.id,b.trigger_type triggerType,b.status,b.started_at startedAt,b.finished_at finishedAt,
    (SELECT COUNT(*) FROM file_index_discovery_items i WHERE i.batch_id=b.id) changes,
    (SELECT COUNT(*) FROM file_index_discovery_items i WHERE i.batch_id=b.id AND i.operation='create') created,
    (SELECT COUNT(*) FROM file_index_discovery_items i WHERE i.batch_id=b.id AND i.operation='update') updated,
    (SELECT COUNT(*) FROM file_index_discovery_items i WHERE i.batch_id=b.id AND i.operation='delete') deleted
    FROM file_index_scan_batches b WHERE b.project_id=?
    ORDER BY b.started_at DESC,b.id DESC LIMIT ? OFFSET ?`,
    [projectId, pageSize, (page - 1) * pageSize],
  );
  return {
    rows: rows.map((row) => ({
      ...row,
      changes: Number(row.changes),
      created: Number(row.created),
      updated: Number(row.updated),
      deleted: Number(row.deleted),
    })),
    total,
    page,
    pageSize,
  };
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
  const batchId = typeof options.batchId === "string" ? options.batchId.trim().slice(0, 36) : "";
  if (batchId && !/^[0-9a-f-]{36}$/i.test(batchId)) throw new HttpError(400, "无效的扫描批次");
  const where = `i.project_id=? ${batchId ? "AND i.batch_id=?" : ""} ${operation ? "AND i.operation=?" : ""} ${keyword ? "AND LOCATE(LOWER(?),LOWER(i.title))>0" : ""}`;
  const params = [
    projectId,
    ...(batchId ? [batchId] : []),
    ...(operation ? [operation] : []),
    ...(keyword ? [keyword] : []),
  ];
  const [count] = await query(
    db,
    `SELECT COUNT(*) total FROM file_index_discovery_items i WHERE ${where}`,
    params,
  );
  const total = Number(count.total);
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
  const rows = await query(
    db,
    `SELECT i.id,i.artifact_id artifactId,i.version_id versionId,i.title,i.operation,
    i.created_at createdAt,i.batch_id batchId,b.trigger_type triggerType
    FROM file_index_discovery_items i
    LEFT JOIN file_index_scan_batches b ON b.id=i.batch_id
    WHERE ${where} ORDER BY i.created_at DESC,i.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  return { rows, page, pageSize, total };
}
