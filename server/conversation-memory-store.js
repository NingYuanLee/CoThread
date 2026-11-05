import { createHash, randomUUID } from "node:crypto";
import { query, transaction } from "./db.ts";
import {
  observationSchema,
  validateConversationMemoryResult,
} from "./conversation-memory-contract.js";
import { intactConversationMemorySql } from "./conversation-memory-integrity.ts";

export function readConversationCandidatePayload(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** Never change an old frozen snapshot or replay its unverified response. */
export async function replaceInvalidConversationWindow(db, windowId, error) {
  return transaction(db, async (conn) => {
    const [old] = await query(
      conn,
      "SELECT * FROM conversation_memory_windows WHERE id=? FOR UPDATE",
      [windowId],
    );
    if (!old || old.invalidated_at) return null;
    await query(
      conn,
      "UPDATE conversation_archive_checks SET completed_at=NULL WHERE thread_id=? AND project_id=?",
      [old.thread_id, old.project_id],
    );
    const messages = await query(
      conn,
      `SELECT m.id,m.sequence,SHA2(m.body,256) hash
      FROM conversation_window_messages wm JOIN messages m ON m.id=wm.message_id
      WHERE wm.window_id=? AND m.thread_id=? AND m.source<>'system' AND m.body<>''
      ORDER BY m.sequence FOR UPDATE`,
      [windowId, old.thread_id],
    );
    await query(
      conn,
      `UPDATE conversation_memory_windows SET invalidated_at=UTC_TIMESTAMP(3),
      attempts=attempts+1,last_attempt_at=UTC_TIMESTAMP(3),
      statement_status=IF(statement_status='completed','completed','failed'),
      discussion_status=IF(discussion_status='completed','completed','failed'),error=? WHERE id=?`,
      [String(error?.message || error).slice(0, 1000), windowId],
    );
    if (!messages.length) return null;
    const candidates = await query(
      conn,
      "SELECT * FROM conversation_memory_candidates WHERE window_id=? ORDER BY kind,ordinal",
      [windowId],
    );
    const hasApplied = candidates.some(
      (candidate) =>
        candidate.status === "completed" &&
        readConversationCandidatePayload(candidate.payload)?._resolution !== "discarded",
    );
    const candidateSourceIds = [
      ...new Set(
        candidates.flatMap((candidate) => {
          const payload = readConversationCandidatePayload(candidate.payload);
          return Array.isArray(payload?.sourceIds)
            ? payload.sourceIds.filter((id) => typeof id === "string")
            : [];
        }),
      ),
    ];
    const liveSources = candidateSourceIds.length
      ? await query(
          conn,
          `SELECT m.id FROM messages m JOIN threads t ON t.id=m.thread_id WHERE t.project_id=?
       AND m.id IN (${candidateSourceIds.map(() => "?").join(",")}) AND m.source<>'system' AND m.body<>'' FOR UPDATE`,
          [old.project_id, ...candidateSourceIds],
        )
      : [];
    const id = randomUUID();
    await query(
      conn,
      `INSERT INTO conversation_memory_windows
      (id,project_id,thread_id,first_sequence,last_sequence,predecessor_id,response_saved,statement_status,discussion_status)
      VALUES(?,?,?,?,?,?,?,?,?)`,
      [
        id,
        old.project_id,
        old.thread_id,
        messages[0].sequence,
        messages.at(-1).sequence,
        windowId,
        hasApplied && old.response_saved ? 1 : 0,
        hasApplied && old.statement_status === "completed" ? "completed" : "pending",
        hasApplied && old.discussion_status === "completed" ? "completed" : "pending",
      ],
    );
    for (const message of messages)
      await query(
        conn,
        "INSERT INTO conversation_window_messages(window_id,message_id,sequence,body_sha256) VALUES(?,?,?,?)",
        [id, message.id, message.sequence, message.hash],
      );
    for (const candidate of hasApplied ? candidates : []) {
      let payload = readConversationCandidatePayload(candidate.payload);
      if (payload?._resolution === "discarded") continue;
      // An entirely deleted evidence set cannot be repaired. The failed original
      // remains in the invalidated window, rather than blocking newer messages.
      if (
        candidate.status !== "completed" &&
        Array.isArray(payload?.sourceIds) &&
        payload.sourceIds.length &&
        !payload.sourceIds.some((sourceId) =>
          liveSources.some((message) => message.id === sourceId),
        )
      )
        continue;
      if (candidate.status !== "completed")
        payload = {
          ...(payload && typeof payload === "object" ? payload : {}),
          _requiresSourceRepair: true,
        };
      await query(
        conn,
        `INSERT INTO conversation_memory_candidates
        (id,window_id,kind,ordinal,payload,status,page_id,error) VALUES(?,?,?,?,?,?,?,?)`,
        [
          randomUUID(),
          id,
          candidate.kind,
          candidate.ordinal,
          JSON.stringify(payload),
          candidate.status === "completed" ? "completed" : "failed",
          candidate.page_id,
          candidate.status === "completed" ? null : "来源变化，需要重新分析",
        ],
      );
    }
    if (hasApplied) {
      const pending = candidates.filter((candidate) => candidate.status !== "completed");
      const [counts] = await query(
        conn,
        `SELECT
        SUM(kind='statement' AND status<>'completed') statements,
        SUM(kind IN ('discussion','observation') AND status<>'completed') discussions
        FROM conversation_memory_candidates WHERE window_id=?`,
        [id],
      );
      if (!Number(counts.statements) && pending.some((candidate) => candidate.kind === "statement"))
        await query(
          conn,
          "UPDATE conversation_memory_windows SET statement_status='completed' WHERE id=?",
          [id],
        );
      if (
        !Number(counts.discussions) &&
        pending.some((candidate) => candidate.kind !== "statement")
      )
        await query(
          conn,
          "UPDATE conversation_memory_windows SET discussion_status='completed' WHERE id=?",
          [id],
        );
    }
    return id;
  });
}

/** Called in the message transaction so committed messages cannot lose their signal. */
export async function queueConversationMessage(db, projectId, threadId, sequence) {
  if (typeof db.getConnection === "function")
    return transaction(db, (conn) => queueConversationMessage(conn, projectId, threadId, sequence));
  const [message] = await query(
    db,
    "SELECT id,body FROM messages WHERE thread_id=? AND sequence=?",
    [threadId, sequence],
  );
  if (!message) throw new Error("无法记录不存在的待处理消息");
  await query(
    db,
    "UPDATE conversation_archive_checks SET completed_at=NULL WHERE thread_id=? AND project_id=?",
    [threadId, projectId],
  );
  await query(
    db,
    `INSERT INTO conversation_memory_queue(thread_id,project_id,first_sequence,last_sequence)
     VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE
     first_sequence=LEAST(first_sequence,VALUES(first_sequence)),
     last_sequence=GREATEST(last_sequence,VALUES(last_sequence)),last_at=UTC_TIMESTAMP(3)`,
    [threadId, projectId, sequence, sequence],
  );
  await query(
    db,
    `INSERT IGNORE INTO conversation_pending_messages(thread_id,message_id,sequence,body_sha256,body_length)
    VALUES(?,?,?,?,?)`,
    [
      threadId,
      message.id,
      sequence,
      createHash("sha256").update(message.body, "utf8").digest("hex"),
      Array.from(message.body).length,
    ],
  );
}

/** Atomically split the oldest due queue into a bounded durable window. A
 * thread has at most one unfinished window so updates cannot race ahead. */
export async function createConversationWindow(
  db,
  { projectId = null, force = false, limit = 40 } = {},
) {
  const batchLimit = Math.max(1, Math.min(40, Math.trunc(limit) || 40));
  return transaction(db, async (conn) => {
    const [row] = await query(
      conn,
      `SELECT q.thread_id threadId,q.project_id projectId,q.first_sequence firstSequence,q.last_sequence lastSequence
       FROM conversation_memory_queue q
       WHERE (? IS NULL OR q.project_id=?)
       AND (? OR q.last_at<=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE)
         OR q.first_at<=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 HOUR))
       AND NOT EXISTS (SELECT 1 FROM conversation_memory_windows w WHERE w.thread_id=q.thread_id
         AND w.invalidated_at IS NULL AND (w.statement_status<>'completed' OR w.discussion_status<>'completed'))
       ORDER BY q.first_at,q.thread_id LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [projectId, projectId, force ? 1 : 0],
    );
    if (!row) return null;
    const messages = await query(
      conn,
      `SELECT p.message_id id,p.sequence,p.body_sha256 hash,p.body_length bodyLength
       FROM conversation_pending_messages p WHERE p.thread_id=? AND p.sequence>=? AND p.sequence<=?
       ORDER BY p.sequence LIMIT ?`,
      [row.threadId, row.firstSequence, row.lastSequence, batchLimit],
    );
    if (!messages.length) {
      // The original message may have been removed after enqueue. Keep an
      // inspectable failure rather than silently declaring the range handled.
      const id = randomUUID();
      await query(
        conn,
        `INSERT INTO conversation_memory_windows
        (id,project_id,thread_id,first_sequence,last_sequence,statement_status,discussion_status,error)
        VALUES(?,?,?,?,?,'failed','failed','待处理消息已不可读取，需要重新核对')`,
        [id, row.projectId, row.threadId, row.firstSequence, row.lastSequence],
      );
      await query(conn, "DELETE FROM conversation_memory_queue WHERE thread_id=?", [row.threadId]);
      return {
        id,
        projectId: row.projectId,
        threadId: row.threadId,
        firstSequence: String(row.firstSequence),
        lastSequence: String(row.lastSequence),
      };
    }
    let count = 0;
    let size = 0;
    for (const message of messages) {
      const next = Number(message.bodyLength || 0);
      if (count && size + next > 30000) break;
      size += next;
      count++;
    }
    const end = String(messages[count - 1].sequence);
    const id = randomUUID();
    await query(
      conn,
      `INSERT INTO conversation_memory_windows(id,project_id,thread_id,first_sequence,last_sequence)
       VALUES(?,?,?,?,?)`,
      [id, row.projectId, row.threadId, row.firstSequence, end],
    );
    for (const message of messages.slice(0, count)) {
      await query(
        conn,
        "INSERT INTO conversation_window_messages(window_id,message_id,sequence,body_sha256) VALUES(?,?,?,?)",
        [id, message.id, message.sequence, message.hash],
      );
      await query(
        conn,
        "DELETE FROM conversation_pending_messages WHERE thread_id=? AND message_id=?",
        [row.threadId, message.id],
      );
    }
    if (BigInt(end) >= BigInt(row.lastSequence)) {
      await query(conn, "DELETE FROM conversation_memory_queue WHERE thread_id=?", [row.threadId]);
    } else {
      await query(conn, "UPDATE conversation_memory_queue SET first_sequence=? WHERE thread_id=?", [
        (BigInt(end) + 1n).toString(),
        row.threadId,
      ]);
    }
    return {
      id,
      projectId: row.projectId,
      threadId: row.threadId,
      firstSequence: String(row.firstSequence),
      lastSequence: end,
    };
  });
}

/** Expedite queued work and optionally backfill messages not present in any
 * durable window. Existing windows are not re-run or duplicated. */
export async function queueConversationThread(db, projectId, threadId, { backfill = false } = {}) {
  if (typeof db.getConnection === "function")
    return transaction(db, (conn) =>
      queueConversationThread(conn, projectId, threadId, { backfill }),
    );
  const [thread] = await query(db, "SELECT id FROM threads WHERE id=? AND project_id=?", [
    threadId,
    projectId,
  ]);
  if (!thread) throw new Error("迭代不存在或不属于该项目");
  if (backfill) {
    const [range] = await query(
      db,
      `SELECT MIN(m.sequence) firstSequence,MAX(m.sequence) lastSequence
      FROM messages m WHERE m.thread_id=? AND m.source<>'system' AND m.body<>''
      AND NOT EXISTS (SELECT 1 FROM conversation_window_messages wm WHERE wm.message_id=m.id)`,
      [threadId],
    );
    if (range.firstSequence != null)
      await query(
        db,
        `INSERT INTO conversation_memory_queue
      (thread_id,project_id,first_sequence,last_sequence,first_at,last_at)
      VALUES(?,?,?,?,DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 HOUR),DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE))
      ON DUPLICATE KEY UPDATE first_sequence=LEAST(first_sequence,VALUES(first_sequence)),
      last_sequence=GREATEST(last_sequence,VALUES(last_sequence)),last_at=VALUES(last_at)`,
        [threadId, projectId, range.firstSequence, range.lastSequence],
      );
    if (range.firstSequence != null)
      await query(
        db,
        `INSERT IGNORE INTO conversation_pending_messages(thread_id,message_id,sequence,body_sha256,body_length)
      SELECT m.thread_id,m.id,m.sequence,SHA2(m.body,256),CHAR_LENGTH(m.body) FROM messages m
      WHERE m.thread_id=? AND m.source<>'system' AND m.body<>''
      AND NOT EXISTS (SELECT 1 FROM conversation_window_messages wm WHERE wm.message_id=m.id)`,
        [threadId],
      );
  }
  const changed = await query(
    db,
    `UPDATE conversation_memory_queue SET last_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE)
    WHERE thread_id=? AND project_id=?`,
    [threadId, projectId],
  );
  const windows = await query(
    db,
    `UPDATE conversation_memory_windows SET available_at=UTC_TIMESTAMP(3)
    WHERE thread_id=? AND project_id=? AND invalidated_at IS NULL AND (statement_status<>'completed' OR discussion_status<>'completed')`,
    [threadId, projectId],
  );
  return { queued: Number(changed.affectedRows) > 0, pendingWindows: Number(windows.affectedRows) };
}

/**
 * 把尚未进入窗口、也不在待处理表里的历史消息补入队。
 * 不限制迭代数：漏掉哪个迭代就会一直显示“未入队”。
 * 单个迭代体量由窗口分批兜底（每窗最多 40 条、3 万字符），不会一次生成超大窗口。
 */
export async function queueUnwindowedConversationThreads(db, projectId) {
  const rows = await query(
    db,
    `SELECT t.id FROM threads t
     WHERE t.project_id=?
       AND EXISTS (SELECT 1 FROM messages m WHERE m.thread_id=t.id AND m.source<>'system' AND m.body<>''
         AND NOT EXISTS (SELECT 1 FROM conversation_window_messages wm WHERE wm.message_id=m.id)
         AND NOT EXISTS (SELECT 1 FROM conversation_pending_messages p WHERE p.message_id=m.id))
     ORDER BY t.archived_at IS NULL DESC,t.id`,
    [projectId],
  );
  for (const row of rows) await queueConversationThread(db, projectId, row.id, { backfill: true });
  return rows.length;
}

/** Scan an archive once per archive version; enqueue and checkpoint atomically. */
export async function scanArchivedConversation(db, projectId, threadId) {
  if (typeof db.getConnection === "function")
    return transaction(db, (conn) => scanArchivedConversation(conn, projectId, threadId));
  const [thread] = await query(
    db,
    "SELECT id,archived_at archivedAt FROM threads WHERE id=? AND project_id=? AND status='archived' FOR UPDATE",
    [threadId, projectId],
  );
  if (!thread?.archivedAt) return false;
  const [checked] = await query(
    db,
    "SELECT a.thread_id FROM conversation_archive_checks a JOIN threads t ON t.id=a.thread_id AND t.archived_at=a.archived_at WHERE a.thread_id=?",
    [threadId],
  );
  if (checked) return false;
  await queueConversationThread(db, projectId, threadId, { backfill: true });
  await query(
    db,
    `INSERT INTO conversation_archive_checks(thread_id,project_id,archived_at,scanned_at,completed_at)
    SELECT id,project_id,archived_at,UTC_TIMESTAMP(3),NULL FROM threads WHERE id=? AND project_id=?
    ON DUPLICATE KEY UPDATE project_id=VALUES(project_id),archived_at=VALUES(archived_at),scanned_at=VALUES(scanned_at),completed_at=NULL`,
    [threadId, projectId],
  );
  await completeArchivedConversationCheck(db, projectId, threadId);
  return true;
}

/** Completion is separate from scanning, and unresolved lost sources block it. */
export async function completeArchivedConversationCheck(db, projectId, threadId) {
  await query(
    db,
    `UPDATE conversation_archive_checks a JOIN threads t ON t.id=a.thread_id AND t.project_id=a.project_id
    SET a.completed_at=UTC_TIMESTAMP(3)
    WHERE a.project_id=? AND a.thread_id=? AND t.status='archived' AND t.archived_at=a.archived_at
    AND a.completed_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM conversation_memory_queue q WHERE q.thread_id=a.thread_id)
    AND NOT EXISTS (SELECT 1 FROM conversation_memory_windows w WHERE w.thread_id=a.thread_id AND w.invalidated_at IS NULL
      AND (w.statement_status<>'completed' OR w.discussion_status<>'completed'))
    AND NOT EXISTS (SELECT 1 FROM conversation_memory_windows w
      WHERE w.thread_id=a.thread_id AND w.invalidated_at IS NOT NULL
      AND (w.statement_status<>'completed' OR w.discussion_status<>'completed')
      AND NOT EXISTS (SELECT 1 FROM conversation_memory_windows successor WHERE successor.predecessor_id=w.id))
    AND NOT EXISTS (SELECT 1 FROM conversation_memory_windows w JOIN conversation_memory_candidates c ON c.window_id=w.id
      WHERE w.thread_id=a.thread_id AND w.invalidated_at IS NOT NULL AND c.status<>'completed'
      AND NOT EXISTS (SELECT 1 FROM conversation_memory_windows successor JOIN conversation_memory_candidates copied ON copied.window_id=successor.id
        WHERE successor.predecessor_id=w.id AND copied.kind=c.kind AND copied.ordinal=c.ordinal))`,
    [projectId, threadId],
  );
}

export async function scanProjectArchivedConversations(db, projectId) {
  const threads = await query(
    db,
    `SELECT t.id FROM threads t LEFT JOIN conversation_archive_checks a
    ON a.thread_id=t.id AND a.archived_at=t.archived_at WHERE t.project_id=? AND t.status='archived'
    AND t.archived_at IS NOT NULL AND a.thread_id IS NULL ORDER BY t.archived_at,t.id`,
    [projectId],
  );
  for (const thread of threads) await scanArchivedConversation(db, projectId, thread.id);
  return threads.length;
}

/** Explicitly re-analyse the recorded sources of a stale page. Deleted sources
 * cannot be reconstructed and remain flagged for human review. */
export async function queueConversationRecheck(db, projectId, pageId, actorId) {
  return transaction(db, async (conn) => {
    const [page] = await query(
      conn,
      "SELECT id FROM wiki_pages WHERE id=? AND project_id=? FOR UPDATE",
      [pageId, projectId],
    );
    if (!page) throw new Error("记忆不存在或不属于该项目");
    const [stale] = await query(
      conn,
      `SELECT p.id FROM wiki_pages p WHERE p.id=? AND NOT ${intactConversationMemorySql("p")}`,
      [pageId],
    );
    if (!stale) throw new Error("该记忆的来源没有变化，无需重新核对");
    const sources = await query(
      conn,
      `SELECT s.message_id id,t.id threadId,m.sequence
      FROM conversation_memory_source_snapshots s LEFT JOIN messages m ON m.id=s.message_id
      LEFT JOIN threads t ON t.id=m.thread_id AND t.project_id=? WHERE s.page_id=?`,
      [projectId, pageId],
    );
    if (!sources.length) throw new Error("没有可重新核对的消息出处");
    if (sources.some((source) => !source.threadId || !source.sequence))
      throw new Error("部分出处已删除，无法自动核对，请人工处理");
    sources.sort(
      (a, b) =>
        a.threadId.localeCompare(b.threadId) || (BigInt(a.sequence) < BigInt(b.sequence) ? -1 : 1),
    );
    for (const source of sources)
      await queueConversationMessage(conn, projectId, source.threadId, source.sequence);
    for (const threadId of new Set(sources.map((source) => source.threadId)))
      await query(
        conn,
        "UPDATE conversation_memory_queue SET last_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE) WHERE thread_id=? AND project_id=?",
        [threadId, projectId],
      );
    await query(
      conn,
      "INSERT INTO project_change_logs(id,project_id,actor_user_id,action,details) VALUES(?,?,?,'conversation_memory_recheck',?)",
      [randomUUID(), projectId, actorId, JSON.stringify({ pageId, sourceCount: sources.length })],
    );
    return { queued: sources.length };
  });
}

/** Persist the full model response before processing any item. Never replace a
 * previously persisted response: candidate identity must survive a retry. */
function pageFingerprint(page) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        page.id,
        page.subjectType,
        page.aboutUserId || null,
        page.status,
        page.title,
        page.body,
        page.subtype || null,
      ]),
    )
    .digest("hex");
}

export async function saveConversationCandidates(db, windowId, result, { pages = [] } = {}) {
  if (!Array.isArray(result?.statements) || !Array.isArray(result?.discussions))
    throw new Error("联合分析结果缺少关键发言或核心议题数组");
  const observations = result.observations || [];
  if (
    !Array.isArray(observations) ||
    observations.length > 20 ||
    result.statements.length > 50 ||
    result.discussions.length > 50
  )
    throw new Error("联合分析候选超过单次上限");
  return transaction(db, async (conn) => {
    const [window] = await query(
      conn,
      "SELECT id,response_saved FROM conversation_memory_windows WHERE id=? FOR UPDATE",
      [windowId],
    );
    if (!window) throw new Error("联合分析窗口不存在");
    if (window.response_saved) return false;
    for (const [kind, items] of [
      ["statement", result.statements],
      ["discussion", result.discussions],
      ["observation", observations],
    ]) {
      for (const [ordinal, item] of items.entries()) {
        // This snapshot comes from server-prepared input, never from the model.
        // A changed page must be reanalysed rather than silently overwritten.
        const target = pages.find((page) => page.id === item?.pageId);
        const payload = item?.pageId
          ? { ...item, _expectedPageHash: target ? pageFingerprint(target) : null }
          : item;
        await query(
          conn,
          "INSERT INTO conversation_memory_candidates(id,window_id,kind,ordinal,payload) VALUES(?,?,?,?,?)",
          [randomUUID(), windowId, kind, ordinal, JSON.stringify(payload)],
        );
      }
    }
    if (!result.statements.length)
      await query(
        conn,
        "UPDATE conversation_memory_windows SET statement_status='completed' WHERE id=?",
        [windowId],
      );
    if (!result.discussions.length && !observations.length)
      await query(
        conn,
        "UPDATE conversation_memory_windows SET discussion_status='completed' WHERE id=?",
        [windowId],
      );
    await query(conn, "UPDATE conversation_memory_windows SET response_saved=TRUE WHERE id=?", [
      windowId,
    ]);
    return true;
  });
}

/** The verifier must check whether the actual source text supports the claims.
 * Identifiers and authorship alone are necessary but not sufficient evidence. */
export async function applyConversationCandidate(db, candidateId, { actorId, verifySupport }) {
  if (!actorId || typeof verifySupport !== "function") throw new Error("缺少写入身份或出处核验器");
  const [candidate] = await query(
    db,
    `SELECT c.id,c.kind,c.payload,c.status,w.project_id projectId,w.thread_id threadId
     FROM conversation_memory_candidates c JOIN conversation_memory_windows w ON w.id=c.window_id
     WHERE c.id=?`,
    [candidateId],
  );
  if (!candidate) throw new Error("联合分析候选不存在");
  if (candidate.kind === "observation")
    return applyObservationCandidate(db, candidate, verifySupport);
  if (candidate.status === "completed") return { alreadyApplied: true };
  const payload = readConversationCandidatePayload(candidate.payload);
  const ids = Array.isArray(payload?.sourceIds) ? [...new Set(payload.sourceIds)] : [];
  if (!ids.length || ids.length > 20 || ids.some((id) => typeof id !== "string"))
    throw new Error("候选出处格式不合格");
  const messages = ids.length
    ? await query(
        db,
        `SELECT m.id,m.author_id authorId,m.body,m.thread_id threadId,m.created_at createdAt
       FROM messages m JOIN threads t ON t.id=m.thread_id
       WHERE t.project_id=? AND m.id IN (${ids.map(() => "?").join(",")})`,
        [candidate.projectId, ...ids],
      )
    : [];
  const targetIds = [...new Set([payload?.pageId, payload?.correctsPageId].filter(Boolean))];
  const pages = targetIds.length
    ? await query(
        db,
        `SELECT id,subject_type subjectType,about_user_id aboutUserId,status,title,body,memory_subtype subtype
       FROM wiki_pages WHERE project_id=? AND id IN (${targetIds.map(() => "?").join(",")}) AND status='current'`,
        [candidate.projectId, ...targetIds],
      )
    : [];
  const sourceLengths = messages.map((message) => Array.from(message.body).length);
  // A single oversized message is a valid complete window. Allow that source
  // plus a bounded amount of supporting context rather than making it impossible
  // to verify or save any candidate derived from it.
  const oversizedLength = Math.max(0, ...sourceLengths.filter((length) => length > 30000));
  if (sourceLengths.reduce((total, length) => total + length, 0) > 30000 + oversizedLength)
    throw new Error("候选出处过长，请缩小范围后重新分析");
  const kind = candidate.kind === "statement" ? "statements" : "discussions";
  const result = { statements: [], discussions: [], [kind]: [payload] };
  const checked = validateConversationMemoryResult(result, { messages, pages });
  if (checked.rejected.length) throw new Error(checked.rejected[0].reason);
  if (
    payload.pageId &&
    (!payload._expectedPageHash ||
      pageFingerprint(pages.find((page) => page.id === payload.pageId)) !==
        payload._expectedPageHash)
  )
    throw new Error("记忆更新目标已变化，请重新分析");
  let observationQuestion = null;
  if (candidate.kind === "discussion" && payload.observationId) {
    const [observation] = await query(
      db,
      "SELECT question FROM conversation_memory_observations WHERE id=? AND project_id=? AND status IN ('pending','promoting')",
      [payload.observationId, candidate.projectId],
    );
    if (!observation) throw new Error("待观察问题不存在或已处理");
    observationQuestion = observation.question;
  }
  if (
    !(await verifySupport({
      candidate: payload,
      kind: candidate.kind,
      messages,
      observationQuestion,
    }))
  )
    throw new Error("候选内容未通过出处核验");
  const labels = {
    pending: "待讨论 / 未形成结论",
    discussing: "讨论中",
    concluded: "已有结论",
    deferred: "暂缓",
  };
  const body =
    candidate.kind === "discussion"
      ? `## 议题状态\n${labels[payload.stage]}\n\n${payload.body.replace(/^## 议题状态[^\n]*\n[\s\S]*?(?=\n## |$)/m, "").trim()}`
      : payload.body;
  return transaction(db, async (conn) => {
    const [locked] = await query(
      conn,
      "SELECT status,page_id pageId FROM conversation_memory_candidates WHERE id=? FOR UPDATE",
      [candidateId],
    );
    if (!locked) throw new Error("联合分析候选不存在");
    if (locked.status === "completed") return { pageId: locked.pageId, alreadyApplied: true };
    if (payload.observationId) {
      const [observation] = await query(
        conn,
        "SELECT question,source_ids sourceIds,source_hashes sourceHashes FROM conversation_memory_observations WHERE id=? AND project_id=? AND status IN ('pending','promoting') FOR UPDATE",
        [payload.observationId, candidate.projectId],
      );
      if (!observation || observation.question !== observationQuestion)
        throw new Error("待观察问题已变化，请重新核对");
      const sourceIds =
        typeof observation.sourceIds === "string"
          ? JSON.parse(observation.sourceIds)
          : observation.sourceIds;
      const hashes =
        typeof observation.sourceHashes === "string"
          ? JSON.parse(observation.sourceHashes)
          : observation.sourceHashes;
      if (!Array.isArray(sourceIds) || !sourceIds.length || !hashes)
        throw new Error("待观察问题出处不可核验");
      for (const id of [...new Set(sourceIds)].sort()) {
        const [source] = await query(
          conn,
          "SELECT m.body FROM messages m JOIN threads t ON t.id=m.thread_id WHERE m.id=? AND t.project_id=? FOR UPDATE",
          [id, candidate.projectId],
        );
        if (
          !source ||
          hashes[id] !== createHash("sha256").update(source.body, "utf8").digest("hex")
        )
          throw new Error("待观察问题出处已修改或删除，请重新核对");
      }
    }
    // Recheck the exact evidence inside the write transaction. If a message was
    // edited or removed while verification ran, leave the candidate retryable.
    for (const message of messages) {
      const [current] = await query(
        conn,
        `SELECT m.body,m.author_id authorId FROM messages m
        JOIN threads t ON t.id=m.thread_id WHERE m.id=? AND t.project_id=? FOR UPDATE`,
        [message.id, candidate.projectId],
      );
      if (!current || current.body !== message.body || current.authorId !== message.authorId)
        throw new Error("出处在核验期间发生变化");
    }
    const subject = candidate.kind === "statement" ? "utterance" : "discussion";
    let pageId = payload.pageId || null;
    let relatedPreviousId = null;
    if (pageId && subject === "utterance") {
      const previousSources = await query(
        conn,
        "SELECT source_id id FROM wiki_page_sources WHERE page_id=? AND source_kind='message'",
        [pageId],
      );
      if (messages.some((message) => !previousSources.some((source) => source.id === message.id))) {
        // A later statement is a new event, even if the speaker changed their mind.
        relatedPreviousId = pageId;
        pageId = null;
      }
    }
    if (pageId) {
      const [current] = await query(
        conn,
        `SELECT id,title,body,subject_type subjectType,about_user_id aboutUserId,status,memory_subtype subtype
        FROM wiki_pages WHERE project_id=? AND id=? FOR UPDATE`,
        [candidate.projectId, pageId],
      );
      if (
        !current ||
        current.status !== "current" ||
        current.subjectType !== subject ||
        (subject === "utterance" && current.aboutUserId !== payload.memberId) ||
        pageFingerprint(current) !== payload._expectedPageHash
      )
        throw new Error("记忆更新目标已变化，请重新分析");
      await query(
        conn,
        `INSERT INTO project_change_logs(id,project_id,actor_user_id,action,details)
        VALUES(?,?,?,'conversation_memory_updated',?)`,
        [
          randomUUID(),
          candidate.projectId,
          actorId,
          JSON.stringify({
            pageId,
            candidateId,
            previousTitle: current.title,
            previousBody: current.body,
          }),
        ],
      );
      const { captureMemoryRevision } = await import("./memory-history.js");
      await captureMemoryRevision(
        conn,
        { ...current, id: pageId },
        { captureKind: "before_conversation_update" },
      );
      await query(
        conn,
        "UPDATE wiki_pages SET title=?,body=?,memory_subtype=?,updated_by=? WHERE id=?",
        [payload.title, body, payload.subtype, actorId, pageId],
      );
    } else {
      const [duplicate] = await query(
        conn,
        `SELECT p.id FROM wiki_pages p JOIN wiki_page_sources s ON s.page_id=p.id
        WHERE p.project_id=? AND p.status='current' AND p.subject_type=? AND p.title=?
          AND (p.subject_type<>'utterance' OR p.about_user_id=?) AND s.source_kind='message'
          AND s.source_id IN (${messages.map(() => "?").join(",")}) LIMIT 1 FOR UPDATE`,
        [
          candidate.projectId,
          subject,
          payload.title,
          payload.memberId || null,
          ...messages.map((message) => message.id),
        ],
      );
      if (duplicate) throw new Error("发现同名且引用相同消息的记忆，请重新分析是否更新原条目");
      pageId = randomUUID();
      await query(
        conn,
        `INSERT INTO wiki_pages(id,project_id,subject_type,memory_subtype,about_user_id,title,body,status,created_by,updated_by)
        VALUES(?,?,?,?,?,?,?,'current',?,?)`,
        [
          pageId,
          candidate.projectId,
          subject,
          payload.subtype,
          subject === "utterance" ? payload.memberId : null,
          payload.title,
          body,
          actorId,
          actorId,
        ],
      );
    }
    for (const message of messages) {
      const [existing] = await query(
        conn,
        "SELECT id FROM wiki_page_sources WHERE page_id=? AND source_kind='message' AND source_id=? LIMIT 1",
        [pageId, message.id],
      );
      if (!existing)
        await query(
          conn,
          "INSERT INTO wiki_page_sources(id,page_id,source_kind,source_id,label) VALUES(?,?,'message',?,'群聊消息')",
          [randomUUID(), pageId, message.id],
        );
      await query(
        conn,
        `INSERT INTO conversation_memory_source_snapshots(page_id,message_id,body_sha256,original_body,author_id,occurred_at)
        VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE verified_at=UTC_TIMESTAMP(3)`,
        [
          pageId,
          message.id,
          createHash("sha256").update(message.body, "utf8").digest("hex"),
          message.body,
          message.authorId,
          message.createdAt || null,
        ],
      );
      const { recordMemoryEvidence } = await import("./memory-history.js");
      await recordMemoryEvidence(conn, {
        projectId: candidate.projectId,
        pageId,
        sourceFamily: "conversation",
        sourceKind: "message",
        sourceId: message.id,
        actorId: message.authorId,
        actorType: "speaker",
        occurredAt: message.createdAt || null,
        evidence: message,
      });
    }
    await query(conn, "UPDATE wiki_pages SET source_family='conversation' WHERE id=?", [pageId]);
    const previousId = payload.correctsPageId || relatedPreviousId;
    if (previousId && previousId !== pageId) {
      const [original] = await query(
        conn,
        "SELECT id,about_user_id memberId FROM wiki_pages WHERE id=? AND project_id=? AND subject_type='utterance'",
        [previousId, candidate.projectId],
      );
      if (!original || original.memberId !== payload.memberId)
        throw new Error("纠正关系的发言者或项目不匹配");
      const { createMemoryRelation } = await import("./memory-graph.js");
      await createMemoryRelation(conn, {
        projectId: candidate.projectId,
        fromPageId: pageId,
        toPageId: previousId,
        relation: payload.correctsPageId ? "corrects" : "relates",
        note: payload.correctsPageId ? "发言者后续明确纠正，原发言保留" : "同一发言者的后续发言",
        createdBy: actorId,
      });
    }
    const related = await query(
      conn,
      `SELECT DISTINCT p.id FROM wiki_pages p
      JOIN wiki_page_sources s ON s.page_id=p.id AND s.source_kind='message'
      WHERE p.project_id=? AND p.status='current' AND p.subject_type=?
        AND s.source_id IN (${messages.map(() => "?").join(",")})`,
      [
        candidate.projectId,
        subject === "utterance" ? "discussion" : "utterance",
        ...messages.map((message) => message.id),
      ],
    );
    const { captureMemoryRevision } = await import("./memory-history.js");
    await captureMemoryRevision(
      conn,
      { id: pageId, title: payload.title, body, status: "current" },
      { captureKind: "conversation_snapshot" },
    );
    if (related.length) {
      const { createMemoryRelation } = await import("./memory-graph.js");
      for (const other of related)
        await createMemoryRelation(conn, {
          projectId: candidate.projectId,
          fromPageId: subject === "discussion" ? pageId : other.id,
          toPageId: subject === "utterance" ? pageId : other.id,
          relation: "relates",
          note: "共同消息出处",
          createdBy: actorId,
        });
    }
    await query(
      conn,
      `INSERT INTO conversation_memory_revisions(id,page_id,candidate_id,title,body,discussion_stage)
      VALUES(?,?,?,?,?,?)`,
      [randomUUID(), pageId, candidateId, payload.title, body, payload.stage || null],
    );
    await query(
      conn,
      "UPDATE conversation_memory_candidates SET status='completed',page_id=?,error=NULL WHERE id=?",
      [pageId, candidateId],
    );
    const [remaining] = await query(
      conn,
      `SELECT COUNT(*) count FROM conversation_memory_candidates WHERE window_id=(SELECT window_id FROM conversation_memory_candidates WHERE id=?)
       AND ${candidate.kind === "statement" ? "kind='statement'" : "kind IN ('discussion','observation')"} AND status<>'completed'`,
      [candidateId],
    );
    if (!Number(remaining.count)) {
      const column = candidate.kind === "statement" ? "statement_status" : "discussion_status";
      await query(
        conn,
        `UPDATE conversation_memory_windows SET ${column}='completed' WHERE id=(SELECT window_id FROM conversation_memory_candidates WHERE id=?)`,
        [candidateId],
      );
    }
    await query(
      conn,
      `UPDATE conversation_memory_windows SET error=NULL
       WHERE id=(SELECT window_id FROM conversation_memory_candidates WHERE id=?)
       AND statement_status='completed' AND discussion_status='completed'`,
      [candidateId],
    );
    if (subject === "utterance") {
      const { refreshMemberSummaryCache } = await import("./memory-cache.ts");
      await refreshMemberSummaryCache(conn, candidate.projectId, payload.memberId);
    }
    if (subject === "discussion") {
      const { noteProjectMemorySignal } = await import("./project-memory.js");
      await noteProjectMemorySignal(
        conn,
        candidate.projectId,
        "memory_page",
        pageId,
        `核心议题进展：${payload.title}`,
        { urgent: false },
      );
    }
    if (subject === "discussion" && payload.observationId) {
      const changed = await query(
        conn,
        `UPDATE conversation_memory_observations SET status='resolved',promoted_page_id=?,
        last_review_at=UTC_TIMESTAMP(3),review_note='已形成核心议题' WHERE id=? AND project_id=? AND status IN ('pending','promoting')`,
        [pageId, payload.observationId, candidate.projectId],
      );
      if (!Number(changed.affectedRows)) throw new Error("待观察问题不存在或已处理");
    }
    return { pageId, alreadyApplied: false };
  });
}

async function applyObservationCandidate(db, candidate, verifySupport) {
  const raw = readConversationCandidatePayload(candidate.payload);
  const parsed = observationSchema.safeParse(raw);
  if (!parsed.success) throw new Error("待观察问题格式不合格");
  const item = parsed.data;
  const ids = [...new Set(item.sourceIds)];
  const messages = await query(
    db,
    `SELECT m.id,m.author_id authorId,m.body,m.thread_id threadId
    FROM messages m JOIN threads t ON t.id=m.thread_id WHERE t.project_id=? AND m.id IN (${ids.map(() => "?").join(",")})`,
    [candidate.projectId, ...ids],
  );
  if (messages.length !== ids.length) throw new Error("待观察问题出处不可读取或不属于项目");
  const sourceLengths = messages.map((message) => Array.from(message.body).length);
  // A single oversized message is a valid complete window. Allow that source
  // plus a bounded amount of supporting context rather than making it impossible
  // to verify or save any candidate derived from it.
  const oversizedLength = Math.max(0, ...sourceLengths.filter((length) => length > 30000));
  if (sourceLengths.reduce((total, length) => total + length, 0) > 30000 + oversizedLength)
    throw new Error("候选出处过长，请缩小范围后重新分析");
  if (!(await verifySupport({ candidate: item, kind: "observation", messages })))
    throw new Error("待观察问题未通过出处核验");
  return transaction(db, async (conn) => {
    const [locked] = await query(
      conn,
      "SELECT status,page_id pageId,window_id windowId FROM conversation_memory_candidates WHERE id=? FOR UPDATE",
      [candidate.id],
    );
    if (!locked) throw new Error("联合分析候选不存在");
    if (locked.status === "completed") return { alreadyApplied: true };
    for (const message of messages) {
      const [current] = await query(
        conn,
        `SELECT m.body,m.author_id authorId FROM messages m JOIN threads t ON t.id=m.thread_id
        WHERE m.id=? AND t.project_id=? FOR UPDATE`,
        [message.id, candidate.projectId],
      );
      if (!current || current.body !== message.body || current.authorId !== message.authorId)
        throw new Error("出处在核验期间发生变化");
    }
    const hashes = Object.fromEntries(
      messages.map((message) => [
        message.id,
        createHash("sha256").update(message.body, "utf8").digest("hex"),
      ]),
    );
    await query(
      conn,
      `INSERT INTO conversation_memory_observations(id,project_id,thread_id,candidate_id,question,source_ids,source_hashes,review_after)
      VALUES(?,?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 DAY))`,
      [
        randomUUID(),
        candidate.projectId,
        candidate.threadId,
        candidate.id,
        item.question,
        JSON.stringify(ids),
        JSON.stringify(hashes),
      ],
    );
    await query(
      conn,
      "UPDATE conversation_memory_candidates SET status='completed',error=NULL WHERE id=?",
      [candidate.id],
    );
    const [remaining] = await query(
      conn,
      `SELECT COUNT(*) count FROM conversation_memory_candidates
      WHERE window_id=? AND kind IN ('discussion','observation') AND status<>'completed'`,
      [locked.windowId],
    );
    if (!Number(remaining.count))
      await query(
        conn,
        "UPDATE conversation_memory_windows SET discussion_status='completed' WHERE id=?",
        [locked.windowId],
      );
    await query(
      conn,
      "UPDATE conversation_memory_windows SET error=NULL WHERE id=? AND statement_status='completed' AND discussion_status='completed'",
      [locked.windowId],
    );
    return { observationCreated: true, alreadyApplied: false };
  });
}

/** Turn a reviewed observation into an ordinary, independently verified
 * discussion candidate. The observation is resolved only after that write. */
export async function promoteConversationObservation(db, observationId, discussion, pages = []) {
  return transaction(db, async (conn) => {
    const [observation] = await query(
      conn,
      `SELECT o.id,o.project_id projectId,c.window_id windowId
      FROM conversation_memory_observations o JOIN conversation_memory_candidates c ON c.id=o.candidate_id
      WHERE o.id=? AND o.status='pending' FOR UPDATE`,
      [observationId],
    );
    if (!observation) return false;
    const [window] = await query(
      conn,
      "SELECT id FROM conversation_memory_windows WHERE id=? FOR UPDATE",
      [observation.windowId],
    );
    if (!window) throw new Error("观察问题原窗口不存在");
    const [row] = await query(
      conn,
      "SELECT COALESCE(MAX(ordinal),-1)+1 nextOrdinal FROM conversation_memory_candidates WHERE window_id=? AND kind='discussion'",
      [observation.windowId],
    );
    const target = pages.find((page) => page.id === discussion?.pageId);
    const payload = {
      ...discussion,
      observationId,
      ...(discussion?.pageId ? { _expectedPageHash: target ? pageFingerprint(target) : null } : {}),
    };
    await query(
      conn,
      `INSERT INTO conversation_memory_candidates(id,window_id,kind,ordinal,payload)
      VALUES(?,?,'discussion',?,?)`,
      [randomUUID(), observation.windowId, row.nextOrdinal, JSON.stringify(payload)],
    );
    await query(
      conn,
      "UPDATE conversation_memory_windows SET discussion_status='pending',available_at=UTC_TIMESTAMP(3),error=NULL WHERE id=?",
      [observation.windowId],
    );
    await query(
      conn,
      `UPDATE conversation_memory_observations SET status='promoting',last_review_at=UTC_TIMESTAMP(3),
      review_note='复核后待写入核心议题' WHERE id=?`,
      [observationId],
    );
    return true;
  });
}

/** A verified zero-output recovery has an audit record, never a phantom page. */
export async function discardRecoveredConversationCandidate(db, candidateId, reason, messages) {
  const detail = String(reason || "").trim();
  if (!detail || detail.length > 500) throw new Error("结束候选需要明确原因");
  return transaction(db, async (conn) => {
    const [candidate] = await query(
      conn,
      `SELECT c.status,c.payload,c.kind,c.window_id windowId,
      w.project_id projectId,w.invalidated_at invalidatedAt,w.predecessor_id predecessorId FROM conversation_memory_candidates c
      JOIN conversation_memory_windows w ON w.id=c.window_id WHERE c.id=? FOR UPDATE`,
      [candidateId],
    );
    if (!candidate || candidate.invalidatedAt) throw new Error("候选窗口已失效");
    if (candidate.status === "completed") return false;
    const previous = readConversationCandidatePayload(candidate.payload);
    if (!candidate.predecessorId || !previous?._requiresSourceRepair)
      throw new Error("只能结束来源变化后的候选");
    for (const message of [...messages].sort((a, b) => a.id.localeCompare(b.id))) {
      const [current] = await query(
        conn,
        `SELECT m.body,m.author_id authorId FROM messages m
        JOIN threads t ON t.id=m.thread_id WHERE m.id=? AND t.project_id=? FOR UPDATE`,
        [message.id, candidate.projectId],
      );
      if (!current || current.body !== message.body || current.authorId !== message.authorId)
        throw new Error("出处在核验期间发生变化");
    }
    const payload = { ...previous, _resolution: "discarded", discardReason: detail };
    delete payload._requiresSourceRepair;
    await query(
      conn,
      `INSERT INTO conversation_candidate_repairs(id,candidate_id,previous_payload,replacement_payload,reason)
      VALUES(?,?,?,?,?)`,
      [randomUUID(), candidateId, JSON.stringify(previous), JSON.stringify(payload), detail],
    );
    await query(
      conn,
      "UPDATE conversation_memory_candidates SET payload=?,status='completed',page_id=NULL,error=NULL WHERE id=?",
      [JSON.stringify(payload), candidateId],
    );
    const column = candidate.kind === "statement" ? "statement_status" : "discussion_status";
    const kinds = candidate.kind === "statement" ? "'statement'" : "'discussion','observation'";
    await query(
      conn,
      `UPDATE conversation_memory_windows SET ${column}='completed' WHERE id=?
      AND NOT EXISTS (SELECT 1 FROM conversation_memory_candidates c WHERE c.window_id=? AND c.kind IN (${kinds}) AND c.status<>'completed')`,
      [candidate.windowId, candidate.windowId],
    );
    await query(
      conn,
      "UPDATE conversation_memory_windows SET error=NULL WHERE id=? AND statement_status='completed' AND discussion_status='completed'",
      [candidate.windowId],
    );
    return true;
  });
}

/** Replace only an unsuccessful candidate and preserve the original response. */
export async function repairConversationCandidate(db, candidateId, replacement, pages, reason) {
  if (!replacement || typeof replacement !== "object" || Array.isArray(replacement))
    throw new Error("修复结果不是候选对象");
  return transaction(db, async (conn) => {
    const [candidate] = await query(
      conn,
      "SELECT status,payload FROM conversation_memory_candidates WHERE id=? FOR UPDATE",
      [candidateId],
    );
    if (!candidate || candidate.status !== "failed") return false;
    const previous = readConversationCandidatePayload(candidate.payload);
    const oldPayload = JSON.stringify(previous);
    const revised = previous?.observationId
      ? { ...replacement, observationId: previous.observationId }
      : { ...replacement };
    delete revised._requiresSourceRepair;
    delete revised._resolution;
    delete revised.discardReason;
    const target = pages.find((page) => page.id === revised.pageId);
    const payload = revised.pageId
      ? { ...revised, _expectedPageHash: target ? pageFingerprint(target) : null }
      : revised;
    await query(
      conn,
      `INSERT INTO conversation_candidate_repairs(id,candidate_id,previous_payload,replacement_payload,reason)
      VALUES(?,?,?,?,?)`,
      [
        randomUUID(),
        candidateId,
        oldPayload,
        JSON.stringify(payload),
        String(reason || "候选重分析").slice(0, 1000),
      ],
    );
    await query(
      conn,
      "UPDATE conversation_memory_candidates SET payload=?,status='pending',error=NULL WHERE id=?",
      [JSON.stringify(payload), candidateId],
    );
    return true;
  });
}

/** A failed candidate stays durable and blocks only its own output class. */
export async function failConversationCandidate(db, candidateId, error, delaySeconds = 60) {
  // 允许把停止自动重试后的队列推到远期（最多 30 天），避免同一份内容继续被调度。
  const delay = Math.max(1, Math.min(30 * 24 * 3600, Math.trunc(delaySeconds) || 60));
  return transaction(db, async (conn) => {
    const [candidate] = await query(
      conn,
      "SELECT window_id windowId,kind,status FROM conversation_memory_candidates WHERE id=? FOR UPDATE",
      [candidateId],
    );
    if (!candidate || candidate.status === "completed") return false;
    const detail = String(error?.message || error || "候选处理失败").slice(0, 1000);
    await query(
      conn,
      "UPDATE conversation_memory_candidates SET status='failed',error=? WHERE id=?",
      [detail, candidateId],
    );
    const column = candidate.kind === "statement" ? "statement_status" : "discussion_status";
    await query(
      conn,
      `UPDATE conversation_memory_windows SET ${column}='failed',error=?,attempts=attempts+1,
       last_attempt_at=UTC_TIMESTAMP(3),available_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? SECOND)
       WHERE id=?`,
      [detail, delay, candidate.windowId],
    );
    return true;
  });
}
