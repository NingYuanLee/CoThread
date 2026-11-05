import { randomUUID, createHash } from "node:crypto";
import { query, transaction } from "./db.ts";
import { HttpError } from "./http-error.js";
import { resolveMemorySourceFamily, sourceFamilyForKind } from "./memory-policy.js";

const parse = (value, fallback = []) =>
  typeof value === "string" ? JSON.parse(value) : value || fallback;

export async function readMemoryRevision(service, user, revisionId) {
  const [row] = await query(
    service.db,
    "SELECT id,page_id pageId,project_id projectId,title,body,status,sources,recorded_at recordedAt,capture_kind captureKind FROM memory_page_revisions WHERE id=?",
    [revisionId],
  );
  if (!row) throw new HttpError(404, "历史修订不存在或当时未记录");
  await service.member(user, row.projectId, false);
  const sources = parse(row.sources);
  if (!(await canReadHistoricalSources(service.db, row.projectId, sources)))
    throw new HttpError(403, "原出处已不可访问");
  return { ...row, sources };
}

/** Pin exactly the material read by the caller, never reread a newer body at answer time. */
export async function captureMemoryRevision(
  db,
  page,
  { sources, captureKind = "read_snapshot" } = {},
) {
  const pageId = page.id || page.pageId;
  const [owner] = await query(
    db,
    "SELECT project_id projectId,status,subject_type subjectType,source_family sourceFamily FROM wiki_pages WHERE id=?",
    [pageId],
  );
  if (!owner || typeof page.body !== "string") return null;
  const evidence = await freezeMemorySources(
    db,
    owner.projectId,
    sources ||
      (await query(
        db,
        "SELECT source_kind kind,source_id id,label FROM wiki_page_sources WHERE page_id=? ORDER BY created_at,id",
        [pageId],
      )),
    new Set([pageId]),
  );
  const [prior] = await query(
    db,
    `SELECT id FROM memory_page_revisions WHERE page_id=? AND title=? AND body=? AND status=?
    AND CAST(sources AS CHAR)=CAST(CAST(? AS JSON) AS CHAR) ORDER BY recorded_at DESC,id DESC LIMIT 1`,
    [pageId, page.title, page.body, page.status || owner.status, JSON.stringify(evidence)],
  );
  if (prior) return prior.id;
  const id = randomUUID();
  await query(
    db,
    `INSERT INTO memory_page_revisions(id,page_id,project_id,title,body,status,subject_type,source_family,sources,capture_kind)
    VALUES(?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      pageId,
      owner.projectId,
      page.title,
      page.body,
      page.status || owner.status,
      page.subject || owner.subjectType,
      owner.sourceFamily,
      JSON.stringify(evidence),
      captureKind,
    ],
  );
  return id;
}

/** Freeze nested access dependencies so later relinking cannot expose old evidence. */
async function freezeMemorySources(db, projectId, sources, visited) {
  const result = [];
  for (const source of sources) {
    if ((source.kind || source.sourceKind) !== "memory_page" || source.frozenSources) {
      result.push(source);
      continue;
    }
    const id = source.sourceId || source.id;
    const [page] = await query(db, "SELECT id FROM wiki_pages WHERE id=? AND project_id=?", [
      id,
      projectId,
    ]);
    if (!page || visited.has(id)) {
      result.push({ ...source, sourceHistoryGap: true });
      continue;
    }
    const nested = await query(
      db,
      "SELECT source_kind kind,source_id id,label FROM wiki_page_sources WHERE page_id=? ORDER BY created_at,id",
      [id],
    );
    result.push({
      ...source,
      frozenSources: await freezeMemorySources(db, projectId, nested, new Set([...visited, id])),
    });
  }
  return result;
}

export async function recordMemoryEvidence(
  db,
  {
    projectId,
    pageId,
    sourceFamily,
    sourceKind,
    sourceId,
    sourceRevision = null,
    actorId = null,
    actorType = null,
    occurredAt = null,
    evidence,
    purpose = "memory_source",
    answerId = null,
    note = "",
  },
) {
  sourceFamily =
    sourceKind === "memory_page"
      ? await resolveMemorySourceFamily(db, projectId, sourceId)
      : sourceFamilyForKind(sourceKind) || sourceFamily;
  // Mixed legacy evidence stays a gap instead of granting invented authority.
  if (!sourceFamily) return null;
  if (sourceKind === "memory_page")
    evidence = {
      ...evidence,
      sourceSnapshot: await freezeMemorySources(
        db,
        projectId,
        [{ kind: sourceKind, id: sourceId }],
        new Set(),
      ),
    };
  const id = randomUUID();
  const json = JSON.stringify(evidence);
  await query(
    db,
    `INSERT INTO memory_evidence_snapshots(id,project_id,source_family,source_kind,source_id,source_revision,actor_id,actor_type,occurred_at,evidence_json,evidence_sha256)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      projectId,
      sourceFamily,
      sourceKind,
      sourceId,
      sourceRevision,
      actorId,
      actorType,
      occurredAt,
      json,
      createHash("sha256").update(json).digest("hex"),
    ],
  );
  await query(
    db,
    `INSERT INTO memory_evidence_links(id,project_id,page_id,answer_id,evidence_id,purpose,note) VALUES(?,?,?,?,?,?,?)`,
    [randomUUID(), projectId, pageId || null, answerId, id, purpose, note],
  );
  return id;
}

/** Preserve bytes even when a formal version is replaced in place. */
export async function captureDocumentRevision(db, projectId, versionId, snapshot = null) {
  if (typeof db.getConnection === "function")
    return transaction(db, (conn) => captureDocumentRevision(conn, projectId, versionId, snapshot));
  if (snapshot?.content) {
    const [visible] = await query(
      db,
      `SELECT v.artifact_id artifactId FROM versions v JOIN artifacts a ON a.id=v.artifact_id
      LEFT JOIN version_recycle vr ON vr.version_id=v.id
      WHERE v.id=? AND a.project_id=? AND a.deleted_at IS NULL AND a.purged_at IS NULL AND vr.version_id IS NULL FOR SHARE`,
      [versionId, projectId],
    );
    if (!visible) return null;
    const [prior] = await query(
      db,
      "SELECT id FROM document_content_revisions WHERE project_id=? AND version_id=? AND sha256=? AND mime=? ORDER BY recorded_at DESC LIMIT 1",
      [projectId, versionId, snapshot.sha256, snapshot.mime],
    );
    if (prior) return prior.id;
    const id = randomUUID();
    await query(
      db,
      "INSERT INTO document_content_revisions(id,project_id,artifact_id,version_id,filename,mime,content,sha256,byte_size,note,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      [
        id,
        projectId,
        visible.artifactId,
        versionId,
        snapshot.filename,
        snapshot.mime,
        snapshot.content,
        snapshot.sha256,
        snapshot.byte_size ?? snapshot.byteSize ?? snapshot.content.length,
        snapshot.note || null,
        snapshot.created_by || null,
      ],
    );
    return id;
  }
  const [prior] = await query(
    db,
    `SELECT r.id FROM document_content_revisions r JOIN versions v ON v.id=r.version_id
    WHERE r.project_id=? AND v.id=? AND r.sha256=v.sha256 AND r.mime=v.mime ORDER BY r.recorded_at DESC LIMIT 1`,
    [projectId, versionId],
  );
  if (prior) return prior.id;
  const id = randomUUID();
  const result = await query(
    db,
    `INSERT INTO document_content_revisions(id,project_id,artifact_id,version_id,filename,mime,content,sha256,byte_size,note,created_by)
    SELECT ?,a.project_id,v.artifact_id,v.id,v.filename,v.mime,v.content,v.sha256,v.byte_size,v.note,v.created_by
    FROM versions v JOIN artifacts a ON a.id=v.artifact_id WHERE a.project_id=? AND v.id=?`,
    [id, projectId, versionId],
  );
  return result.affectedRows ? id : null;
}

/** Historical file evidence keeps the file's current access boundary, not its latest-version filter. */
export async function canReadHistoricalSources(db, projectId, sources, visited = new Set()) {
  for (const source of sources) {
    const kind = source.kind || source.sourceKind;
    const id = source.sourceId || source.id;
    if (source.sourceHistoryGap) return false;
    if (kind === "memory_page") {
      // A live relationship cannot prove a historical access dependency.
      if (visited.has(id) || !Array.isArray(source.frozenSources)) return false;
      const [page] = await query(db, "SELECT id FROM wiki_pages WHERE project_id=? AND id=?", [
        projectId,
        id,
      ]);
      if (!page) return false;
      const nested = source.frozenSources;
      if (!(await canReadHistoricalSources(db, projectId, nested, new Set([...visited, id]))))
        return false;
    }
    if (kind === "document_version") {
      const [file] = await query(
        db,
        `SELECT v.id FROM versions v JOIN artifacts a ON a.id=v.artifact_id
        LEFT JOIN version_recycle vr ON vr.version_id=v.id
        WHERE a.project_id=? AND v.id=? AND a.deleted_at IS NULL AND a.purged_at IS NULL
        AND vr.version_id IS NULL`,
        [projectId, id],
      );
      if (!file) return false;
    }
    if (kind === "message") {
      // Removing an iteration is an access boundary. Editing its messages is not.
      const [visible] = await query(
        db,
        `SELECT m.id FROM messages m JOIN threads t ON t.id=m.thread_id WHERE t.project_id=? AND m.id=?`,
        [projectId, id],
      );
      if (!visible) return false;
    }
  }
  return true;
}

export async function listMemoryHistory(
  service,
  user,
  projectId,
  pageId,
  { limit = 50, before = null, offset = 0 } = {},
) {
  limit = Math.max(1, Math.min(100, Math.trunc(Number(limit) || 50)));
  offset = Math.max(0, Math.trunc(Number(offset) || 0));
  await service.member(user, projectId, false);
  const [page] = await query(service.db, "SELECT id FROM wiki_pages WHERE id=? AND project_id=?", [
    pageId,
    projectId,
  ]);
  if (!page) throw new HttpError(404, "记忆条目不存在");
  const rows = await query(
    service.db,
    `SELECT id,title,body,status,sources,recorded_at recordedAt,capture_kind captureKind
    FROM memory_page_revisions WHERE project_id=? AND page_id=? ${before ? "AND recorded_at<?" : ""}
    ORDER BY recorded_at DESC,id DESC LIMIT ? OFFSET ?`,
    [
      projectId,
      pageId,
      ...(before ? [before] : []),
      Math.max(1, Math.min(100, Number(limit) || 50)),
      Math.max(0, Math.trunc(Number(offset) || 0)),
    ],
  );
  const revisions = [];
  for (const row of rows) {
    const sources = parse(row.sources);
    const accessible = await canReadHistoricalSources(service.db, projectId, sources);
    revisions.push({
      ...row,
      body: accessible ? row.body : null,
      sources: accessible ? sources : [],
      accessible,
    });
  }
  const evidence = await query(
    service.db,
    `SELECT e.id,e.source_kind sourceKind,e.source_id sourceId,e.source_revision sourceRevision,e.occurred_at occurredAt,e.evidence_json evidence,l.purpose,l.note
    FROM memory_evidence_links l JOIN memory_evidence_snapshots e ON e.id=l.evidence_id
    WHERE l.project_id=? AND l.page_id=? ORDER BY l.created_at DESC,l.id DESC LIMIT ? OFFSET ?`,
    [
      projectId,
      pageId,
      Math.max(1, Math.min(100, Number(limit) || 50)),
      Math.max(0, Math.trunc(Number(offset) || 0)),
    ],
  );
  const visibleEvidence = [];
  for (const item of evidence) {
    const payload = parse(item.evidence, {});
    if (await canReadHistoricalSources(service.db, projectId, payload.sourceSnapshot || [item]))
      visibleEvidence.push({ ...item, evidence: payload });
  }
  const judgments = await query(
    service.db,
    "SELECT id,judgment_kind kind,actor_type actorType,actor_id actorId,judgment_json judgment,created_at createdAt FROM memory_judgments WHERE project_id=? AND page_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",
    [
      projectId,
      pageId,
      Math.max(1, Math.min(100, Number(limit) || 50)),
      Math.max(0, Math.trunc(Number(offset) || 0)),
    ],
  );
  const decisions = await query(
    service.db,
    "SELECT id,task_id taskId,action,actor_type actorType,created_at createdAt,JSON_UNQUOTE(JSON_EXTRACT(decision_json,'$.title')) title FROM task_decision_records WHERE project_id=? AND JSON_CONTAINS(basis_json,JSON_OBJECT('kind','memory_page','id',?)) ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",
    [
      projectId,
      pageId,
      Math.max(1, Math.min(100, Number(limit) || 50)),
      Math.max(0, Math.trunc(Number(offset) || 0)),
    ],
  );
  return {
    decisions,
    sourceFamily: await resolveMemorySourceFamily(service.db, projectId, pageId),
    revisions,
    evidence: visibleEvidence,
    hasMore:
      rows.length >= Number(limit) ||
      evidence.length >= Number(limit) ||
      judgments.length >= Number(limit) ||
      decisions.length >= Number(limit),
    nextOffset:
      Math.max(0, Math.trunc(Number(offset) || 0)) +
      Math.max(1, Math.min(100, Number(limit) || 50)),
    judgments: judgments.map((row) => ({ ...row, judgment: parse(row.judgment, {}) })),
  };
}
