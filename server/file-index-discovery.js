import { randomUUID } from "node:crypto";
import { query, transaction } from "./db.ts";

/**
 * Consume one committed document change and its derived work atomically.
 * Receipts, rather than a timestamp cursor, ensure that a transaction which
 * commits late is still discovered. The handler must make every mutation on
 * the provided connection; failures roll back both work and receipt.
 */
export async function consumeFileIndexChange(db, handleChange) {
  return transaction(db, async (conn) => {
    const [change] = await query(
      conn,
      `SELECT l.id,l.project_id projectId,l.action,
        l.memory_artifact_id artifactId,l.memory_version_id versionId,
        l.folder_id folderId,l.details,l.created_at createdAt
       FROM document_change_logs l
       WHERE NOT EXISTS (SELECT 1 FROM file_index_log_receipts r WHERE r.log_id=l.id)
       ORDER BY l.created_at,l.id LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    if (!change) return false;
    await handleChange(conn, change);
    await query(conn, "INSERT INTO file_index_log_receipts(log_id) VALUES(?)", [change.id]);
    return true;
  });
}
/** Decide work from the current file and the last observed state.
 * Content identity is hash plus MIME, not merely the version ID. Returning
 * a work decision does not mutate data and must be followed by a locked
 * recheck in the same transaction as the queue/observation update.
 */
export function decideFileIndexChange(previous, current, hasSuccessfulSummary) {
  if (!current?.available) {
    return previous?.available || hasSuccessfulSummary ? "delete" : "none";
  }
  if (!previous) return hasSuccessfulSummary ? "update" : "create";
  if (!previous.available) {
    return hasSuccessfulSummary &&
      previous.sha256 === current.sha256 &&
      previous.mime === current.mime
      ? "restore"
      : hasSuccessfulSummary
        ? "update"
        : "create";
  }
  if (previous.sha256 !== current.sha256 || previous.mime !== current.mime)
    return hasSuccessfulSummary ? "update" : "create";
  return hasSuccessfulSummary ? "metadata" : "create";
}
/** 扫描批次只在项目级扫描（定时、手动、目录/批量变更）时创建；日志触发单独成批。 */
const SCAN_BATCH_TRIGGERS = new Set(["schedule", "manual", "change", "log"]);
const LOG_BATCH_WINDOW_MINUTES = 10;

async function createScanBatch(conn, projectId, triggerType) {
  const id = randomUUID();
  await query(
    conn,
    "INSERT INTO file_index_scan_batches(id,project_id,trigger_type) VALUES(?,?,?)",
    [id, projectId, SCAN_BATCH_TRIGGERS.has(triggerType) ? triggerType : "change"],
  );
  return id;
}

/** 日志驱动的单文件核对没有项目扫描批次：归入最近 10 分钟内开始的日志批次。 */
async function ensureLogScanBatch(conn, projectId) {
  const [batch] = await query(
    conn,
    `SELECT id FROM file_index_scan_batches
    WHERE project_id=? AND trigger_type='log' AND status='running'
      AND started_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ${LOG_BATCH_WINDOW_MINUTES} MINUTE)
    ORDER BY started_at DESC,id DESC LIMIT 1`,
    [projectId],
  );
  if (batch) return batch.id;
  return createScanBatch(conn, projectId, "log");
}

/**
 * 批次收尾：分页展开和逐文件核对都结束后关闭批次。
 * 这里只用普通读（不用 FOR UPDATE），并发收尾最多是延迟关闭，不会提前关闭；
 * 悬挂批次由 closeStaleFileIndexScanBatches 兜底。
 */
async function finishScanBatchIfDone(conn, batchId) {
  if (!batchId) return false;
  const [scan] = await query(
    conn,
    "SELECT project_id FROM file_index_project_reconciliations WHERE batch_id=? LIMIT 1",
    [batchId],
  );
  if (scan) return false;
  const [request] = await query(
    conn,
    "SELECT artifact_id FROM file_index_reconcile_requests WHERE batch_id=? LIMIT 1",
    [batchId],
  );
  if (request) return false;
  const result = await query(
    conn,
    "UPDATE file_index_scan_batches SET status='completed',finished_at=UTC_TIMESTAMP(3) WHERE id=? AND status='running'",
    [batchId],
  );
  return Number(result?.affectedRows || 0) > 0;
}

/** 关闭因进程中断等原因残留在 running 的批次；无待办才关，有待办说明仍在扫描。 */
export async function closeStaleFileIndexScanBatches(db, { staleMinutes = 10 } = {}) {
  return transaction(db, async (conn) => {
    const batches = await query(
      conn,
      `SELECT id FROM file_index_scan_batches
      WHERE status='running' AND started_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? MINUTE)
      ORDER BY started_at LIMIT 5`,
      [Math.max(1, Math.trunc(Number(staleMinutes) || 10))],
    );
    let closed = 0;
    for (const batch of batches) if (await finishScanBatchIfDone(conn, batch.id)) closed += 1;
    return closed;
  });
}

/** Persist the scope of a log event for reconciliation. A folder operation,
 * bulk purge, or historical event lacking an identity requires a project scan.
 * A request inserted while a project scan is in progress causes another pass.
 */
export async function scheduleFileIndexChange(conn, change) {
  if (change.artifactId) {
    await query(
      conn,
      `INSERT INTO file_index_reconcile_requests(project_id,artifact_id,batch_id)
      VALUES(?,?,?) ON DUPLICATE KEY UPDATE requested_at=LEAST(requested_at,VALUES(requested_at)),
      batch_id=COALESCE(batch_id,VALUES(batch_id))`,
      [change.projectId, change.artifactId, change.batchId || null],
    );
  } else {
    const [pending] = await query(
      conn,
      "SELECT batch_id batchId FROM file_index_project_reconciliations WHERE project_id=? FOR UPDATE",
      [change.projectId],
    );
    // 扫描进行中又来了目录/批量事件：沿用原批次，只标记需要再跑一遍。
    const batchId =
      pending?.batchId || (await createScanBatch(conn, change.projectId, change.triggerType));
    await query(
      conn,
      `INSERT INTO file_index_project_reconciliations(project_id,batch_id) VALUES(?,?)
      ON DUPLICATE KEY UPDATE restart_required=TRUE,batch_id=COALESCE(batch_id,VALUES(batch_id))`,
      [change.projectId, batchId],
    );
  }
}

export function discoverNextFileIndexChange(db) {
  return consumeFileIndexChange(db, scheduleFileIndexChange);
}
/** Lock a durable request until file reconciliation and its queue writes have
 * committed together. An incoming event for the same file waits for this lock
 * and then creates a fresh request, so a concurrent change is not lost. */
export async function consumeFileIndexReconciliation(db, reconcileArtifact) {
  return transaction(db, async (conn) => {
    const [request] = await query(
      conn,
      `SELECT project_id projectId,artifact_id artifactId,batch_id batchId
      FROM file_index_reconcile_requests ORDER BY requested_at,project_id,artifact_id
      LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    if (!request) return false;
    await reconcileArtifact(conn, request.projectId, request.artifactId, {
      batchId: request.batchId,
    });
    await query(
      conn,
      "DELETE FROM file_index_reconcile_requests WHERE project_id=? AND artifact_id=?",
      [request.projectId, request.artifactId],
    );
    await finishScanBatchIfDone(conn, request.batchId);
    return true;
  });
}

/** Expand one page of a project scan to individual file requests. The union
 * includes observations so previously indexed, permanently purged files are
 * reconciled too. A second scan is scheduled if a folder/bulk event arrives
 * before this pass finishes. */
export async function expandFileIndexProjectReconciliation(db, batchSize = 100) {
  const size = Math.max(1, Math.min(500, Math.trunc(Number(batchSize) || 100)));
  return transaction(db, async (conn) => {
    const [scan] = await query(
      conn,
      `SELECT project_id projectId,cursor_artifact_id cursorId,
      restart_required restartRequired,batch_id batchId FROM file_index_project_reconciliations
      ORDER BY requested_at,project_id LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    if (!scan) return false;
    const rows = await query(
      conn,
      `SELECT artifactId FROM (
      SELECT id artifactId FROM artifacts WHERE project_id=?
      UNION SELECT artifact_id artifactId FROM file_index_observations WHERE project_id=?
      UNION SELECT artifact_id artifactId FROM file_index_entries WHERE project_id=?
    ) candidates WHERE artifactId>? ORDER BY artifactId LIMIT ?`,
      [scan.projectId, scan.projectId, scan.projectId, scan.cursorId || "", size],
    );
    for (const row of rows)
      await scheduleFileIndexChange(conn, {
        projectId: scan.projectId,
        artifactId: row.artifactId,
        batchId: scan.batchId,
      });
    if (rows.length === size) {
      await query(
        conn,
        "UPDATE file_index_project_reconciliations SET cursor_artifact_id=? WHERE project_id=?",
        [rows[rows.length - 1].artifactId, scan.projectId],
      );
    } else if (scan.restartRequired) {
      await query(
        conn,
        "UPDATE file_index_project_reconciliations SET cursor_artifact_id=NULL,restart_required=FALSE WHERE project_id=?",
        [scan.projectId],
      );
    } else {
      await query(conn, "DELETE FROM file_index_project_reconciliations WHERE project_id=?", [
        scan.projectId,
      ]);
      await finishScanBatchIfDone(conn, scan.batchId);
    }
    return true;
  });
}
import { folderRootKind } from "./documents/index.js";

const INDEXED_ROOTS = new Set([
  "project_official",
  "project_cache",
  "project_outputs",
  "project_miniprogram",
  "iteration_cache",
  "iteration_outputs",
]);

/** Reconcile one artifact under the caller's transaction and request lock. */
export async function reconcileFileIndexArtifact(conn, projectId, artifactId, hooks = {}) {
  const [project] = await query(conn, "SELECT archived_at FROM projects WHERE id=? FOR UPDATE", [
    projectId,
  ]);
  if (!project || project.archived_at) return "none";
  const [artifact] = await query(
    conn,
    `SELECT id,title,folder_id folderId,created_by createdBy,
    deleted_at deletedAt,purged_at purgedAt FROM artifacts
    WHERE project_id=? AND id=? FOR UPDATE`,
    [projectId, artifactId],
  );
  const [observed] = await query(
    conn,
    `SELECT version_id versionId,content_sha256 sha256,mime,
    is_available available FROM file_index_observations WHERE project_id=? AND artifact_id=? FOR UPDATE`,
    [projectId, artifactId],
  );
  const [index] = await query(
    conn,
    `SELECT fi.page_id pageId,fi.indexed_version_id versionId,
    fi.recognition_status recognitionStatus,fi.topics,fi.extracted_text extractedText,
    fi.recognition_note recognitionNote,fi.summary_sha256 summarySha256,fi.summary_mime summaryMime,
    p.status pageStatus,p.title pageTitle
    FROM file_index_entries fi JOIN wiki_pages p ON p.id=fi.page_id
    WHERE fi.project_id=? AND fi.artifact_id=? FOR UPDATE`,
    [projectId, artifactId],
  );
  const [successful] = await query(
    conn,
    `SELECT s.version_id versionId,v.sha256,v.mime
    FROM agent_document_summaries s JOIN versions v ON v.id=s.version_id
    WHERE v.artifact_id=? ORDER BY v.version DESC,v.id DESC LIMIT 1`,
    [artifactId],
  );
  const root = artifact?.folderId
    ? await (hooks.folderRootKind || folderRootKind)(conn, artifact.folderId)
    : null;
  const [version] =
    artifact && !artifact.deletedAt && !artifact.purgedAt && INDEXED_ROOTS.has(root)
      ? await query(
          conn,
          `SELECT v.id versionId,v.sha256,v.mime FROM versions v
        LEFT JOIN version_recycle r ON r.version_id=v.id WHERE v.artifact_id=? AND r.version_id IS NULL
        ORDER BY v.version DESC,v.created_at DESC,v.id DESC LIMIT 1 FOR UPDATE`,
          [artifactId],
        )
      : [];
  const current = version ? { available: true, ...version } : null;
  // Initial rollout can safely recognize an already indexed current summary;
  // without a snapshot, older or changed contents must be analyzed again.
  const baseline =
    observed ||
    (version &&
    successful?.versionId === version.versionId &&
    index?.versionId === version.versionId
      ? {
          available: true,
          versionId: version.versionId,
          sha256: version.sha256,
          mime: version.mime,
        }
      : null);
  let decision = decideFileIndexChange(baseline, current, !!successful);
  // Observations describe the most recently seen bytes, not the bytes that
  // produced the last successful summary (which can survive failed updates).
  if (
    current &&
    successful &&
    ["metadata", "restore"].includes(decision) &&
    (!index || index.summarySha256 !== current.sha256 || index.summaryMime !== current.mime)
  )
    decision = "update";
  let recordOperation = null;
  if (!current) {
    if (index?.pageId && index.pageStatus === "current") recordOperation = "delete";
    if (index?.pageId)
      await query(
        conn,
        "UPDATE wiki_pages SET status='superseded' WHERE id=? AND status='current'",
        [index.pageId],
      );
    await query(
      conn,
      `DELETE q FROM agent_document_memory_queue q JOIN versions v ON v.id=q.version_id WHERE v.artifact_id=?`,
      [artifactId],
    );
  } else {
    await query(
      conn,
      `DELETE q FROM agent_document_memory_queue q JOIN versions v ON v.id=q.version_id
      WHERE v.artifact_id=? AND q.version_id<>?`,
      [artifactId, current.versionId],
    );
    if (decision === "restore" && index?.pageId)
      await query(
        conn,
        "UPDATE wiki_pages SET status='current' WHERE id=? AND status='superseded'",
        [index.pageId],
      );
    // An identical new version can reuse the prior result without calling a
    // model. Copy the summary to the new version and advance its source.
    if (
      ["metadata", "restore"].includes(decision) &&
      successful &&
      index &&
      index.versionId !== current.versionId &&
      successful.versionId === index.versionId &&
      index.summarySha256 === current.sha256 &&
      index.summaryMime === current.mime
    ) {
      await query(
        conn,
        `INSERT IGNORE INTO agent_document_summaries(version_id,created_by_message_id,summary)
        SELECT ?,created_by_message_id,summary FROM agent_document_summaries WHERE version_id=?`,
        [current.versionId, successful.versionId],
      );
      const sync =
        hooks.syncDocumentMemory || (await import("./document-memory.js")).syncDocumentMemory;
      await sync(conn, {
        projectId,
        artifactId,
        versionId: current.versionId,
        createdBy: artifact.createdBy,
      });
      await query(
        conn,
        `UPDATE file_index_entries SET recognition_status=?,topics=?,extracted_text=?,recognition_note=?,summary_sha256=?,summary_mime=?
        WHERE project_id=? AND artifact_id=? AND indexed_version_id=?`,
        [
          index.recognitionStatus,
          index.topics && typeof index.topics !== "string"
            ? JSON.stringify(index.topics)
            : index.topics,
          index.extractedText,
          index.recognitionNote,
          current.sha256,
          current.mime,
          projectId,
          artifactId,
          current.versionId,
        ],
      );
      await sync(conn, {
        projectId,
        artifactId,
        versionId: current.versionId,
        createdBy: artifact.createdBy,
      });
    }
    // Retain an existing successful page until replacement succeeds. Metadata
    // for a new file can be created immediately as its independent skeleton.
    if (
      !index ||
      !successful ||
      (["metadata", "restore"].includes(decision) && index.versionId === current.versionId)
    ) {
      const sync =
        hooks.syncDocumentMemory || (await import("./document-memory.js")).syncDocumentMemory;
      await sync(conn, {
        projectId,
        artifactId,
        versionId: current.versionId,
        createdBy: artifact.createdBy,
      });
    }
    if (decision === "create" || decision === "update") {
      const [existingQueue] = await query(
        conn,
        `SELECT version_id versionId,content_sha256 sha256,content_mime mime
        FROM agent_document_memory_queue WHERE version_id=? FOR UPDATE`,
        [current.versionId],
      );
      const alreadyQueued =
        existingQueue &&
        existingQueue.sha256 === current.sha256 &&
        existingQueue.mime === current.mime;
      // Content changes invalidate automatic references immediately, while
      // preserving the last successful human-readable summary until replacement.
      if (observed && (observed.sha256 !== current.sha256 || observed.mime !== current.mime)) {
        await query(conn, "DELETE FROM file_index_reference_mentions WHERE source_version_id=?", [
          observed.versionId,
        ]);
        await query(
          conn,
          `UPDATE file_index_groups SET evidence_version_id=NULL
          WHERE project_id=? AND manually_managed=0 AND evidence_kind='reference' AND evidence_version_id=?`,
          [projectId, observed.versionId],
        );
        await query(
          conn,
          `UPDATE file_index_groups SET evidence_target_version_id=NULL
          WHERE project_id=? AND manually_managed=0 AND evidence_kind='reference' AND evidence_target_version_id=?`,
          [projectId, observed.versionId],
        );
      }
      await query(
        conn,
        `DELETE q FROM agent_document_memory_queue q JOIN versions v ON v.id=q.version_id
        WHERE v.artifact_id=? AND q.version_id<>?`,
        [artifactId, current.versionId],
      );
      if (!alreadyQueued) {
        recordOperation = decision;
        await query(
          conn,
          `INSERT INTO agent_document_memory_queue
        (version_id,available_at,operation,trigger_origin,processing_state,queued_at,content_sha256,content_mime,claimed_at)
        VALUES(?,UTC_TIMESTAMP(3),?,'discovery','queued',UTC_TIMESTAMP(3),?,?,NULL)
        ON DUPLICATE KEY UPDATE
          operation=VALUES(operation),trigger_origin='discovery',processing_state='queued',
          available_at=UTC_TIMESTAMP(3),queued_at=UTC_TIMESTAMP(3),content_sha256=VALUES(content_sha256),
          content_mime=VALUES(content_mime),claimed_at=NULL,last_error=NULL,
          candidate_summary=NULL,created_by_message_id=NULL`,
          [current.versionId, decision, current.sha256, current.mime],
        );
      }
    }
  }
  if (recordOperation) {
    const batchId = hooks.batchId || (await ensureLogScanBatch(conn, projectId));
    await query(
      conn,
      `INSERT INTO file_index_discovery_items
    (id,project_id,artifact_id,version_id,title,operation,batch_id) VALUES(?,?,?,?,?,?,?)`,
      [
        randomUUID(),
        projectId,
        artifactId,
        current?.versionId || observed?.versionId || index?.versionId || null,
        artifact?.title || index?.pageTitle || "已删除文件",
        recordOperation,
        batchId,
      ],
    );
  }
  if (current || observed)
    await query(
      conn,
      `INSERT INTO file_index_observations
    (project_id,artifact_id,version_id,content_sha256,mime,is_available,observed_at)
    VALUES(?,?,?,?,?,?,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE
    version_id=VALUES(version_id),content_sha256=VALUES(content_sha256),mime=VALUES(mime),
    is_available=VALUES(is_available),observed_at=VALUES(observed_at)`,
      [
        projectId,
        artifactId,
        current?.versionId || observed?.versionId || null,
        current?.sha256 || observed?.sha256 || null,
        current?.mime || observed?.mime || null,
        current ? 1 : 0,
      ],
    );
  return decision;
}
/** Schedule one due full reconciliation; newly created projects have no timer
 * until first seen. Row locking makes this safe across executor processes. */
export async function scheduleNextFileIndexSweep(db) {
  return transaction(db, async (conn) => {
    const [project] = await query(
      conn,
      `SELECT p.id FROM projects p
      LEFT JOIN file_index_reconcile_timers t ON t.project_id=p.id
      WHERE p.archived_at IS NULL AND (t.project_id IS NULL OR t.next_at<=UTC_TIMESTAMP(3))
      ORDER BY t.next_at,p.id LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    if (!project) return false;
    await query(
      conn,
      `INSERT INTO file_index_reconcile_timers(project_id,next_at)
      VALUES(?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 DAY)) ON DUPLICATE KEY UPDATE
      next_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 1 DAY)`,
      [project.id],
    );
    await scheduleFileIndexChange(conn, { projectId: project.id, triggerType: "schedule" });
    return true;
  });
}

export function reconcileNextFileIndexArtifact(db) {
  return consumeFileIndexReconciliation(db, reconcileFileIndexArtifact);
}
