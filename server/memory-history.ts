import { randomUUID, createHash } from "node:crypto";
import type { Pool } from "mysql2/promise";
import { query, transaction } from "./db.ts";
import { HttpError } from "./http-error.ts";
import { resolveMemorySourceFamily, sourceFamilyForKind } from "./memory-policy.ts";
import type { AccessService, AccessUser } from "./service-access.ts";
import type { Db } from "./types.ts";

/** 一条记忆出处；冻结快照与实时来源共用这个形状。 */
type MemorySource = {
  kind?: string | null;
  sourceKind?: string | null;
  id?: string | null;
  sourceId?: string | null;
  label?: unknown;
  /** 记忆页出处的递归冻结结果。 */
  frozenSources?: MemorySource[];
  /** 冻结时已对不上的来源，读历史时按不可访问处理。 */
  sourceHistoryGap?: boolean;
};

/** 待记录快照的记忆页；调用方可能传 wiki 行，也可能传 `{ id,title,body,status }` 摘要。 */
type MemoryRevisionPage = {
  id?: string | null;
  pageId?: string | null;
  /** 下面是原样落库的列：wiki 行是 string，文件索引页来自 `query()` 的行是 unknown。 */
  title?: unknown;
  /** 函数内部用 `typeof page.body === "string"` 收窄后才落库。 */
  body?: unknown;
  status?: unknown;
  subject?: unknown;
};

/** `recordMemoryEvidence` 的入参。 */
type MemoryEvidenceInput = {
  projectId: string;
  pageId?: string | null;
  sourceFamily?: string | null;
  sourceKind: string;
  sourceId: string;
  sourceRevision?: string | null;
  actorId?: string | null;
  actorType?: string | null;
  occurredAt?: unknown;
  evidence: Record<string, unknown>;
  purpose?: string;
  answerId?: string | null;
  note?: string;
};

/** 原样留档的文档内容；缺省时按当前版本复制。`content` 是 `versions.content`（MEDIUMBLOB），
 * 传进来时会原样落库，所以两种表示都要接受。 */
type DocumentContentSnapshot = {
  content?: Buffer | string | null;
  filename?: string | null;
  mime?: string | null;
  sha256?: string | null;
  byte_size?: unknown;
  byteSize?: unknown;
  note?: string | null;
  created_by?: string | null;
};

/** 读 JSON 数组列：字符串先解析，空值用兜底值。 */
function parseSources(value: unknown, fallback: MemorySource[] = []): MemorySource[] {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value || fallback;
  return parsed as MemorySource[];
}

/** 读 JSON 对象列：字符串先解析，空值用兜底值。 */
function parseRecord(
  value: unknown,
  fallback: Record<string, unknown> = {},
): Record<string, unknown> {
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value || fallback;
  return parsed as Record<string, unknown>;
}

/** `INSERT` 的影响行数：`query()` 的返回类型按读语句标成数组，写语句实际是结果头。 */
function affectedRows(result: unknown): number {
  return Number((result as { affectedRows?: unknown } | null)?.affectedRows || 0);
}

export async function readMemoryRevision(
  service: AccessService,
  user: AccessUser,
  revisionId: string,
) {
  const [row] = await query(
    service.db,
    "SELECT id,page_id pageId,project_id projectId,title,body,status,sources,recorded_at recordedAt,capture_kind captureKind FROM memory_page_revisions WHERE id=?",
    [revisionId],
  );
  if (!row) throw new HttpError(404, "历史修订不存在或当时未记录");
  await service.member(user, row.projectId, false);
  const sources = parseSources(row.sources);
  if (!(await canReadHistoricalSources(service.db, row.projectId, sources)))
    throw new HttpError(403, "原出处已不可访问");
  return { ...row, sources };
}

/** Pin exactly the material read by the caller, never reread a newer body at answer time. */
export async function captureMemoryRevision(
  db: Db,
  page: MemoryRevisionPage,
  {
    sources,
    captureKind = "read_snapshot",
  }: { sources?: MemorySource[]; captureKind?: string } = {},
): Promise<string | null> {
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
async function freezeMemorySources(
  db: Db,
  projectId: string,
  sources: MemorySource[],
  visited: Set<string | null | undefined>,
): Promise<MemorySource[]> {
  const result: MemorySource[] = [];
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
    const nested = await query<MemorySource>(
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
  db: Db,
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
  }: MemoryEvidenceInput,
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
export async function captureDocumentRevision(
  db: Db,
  projectId: string,
  versionId: string,
  snapshot: DocumentContentSnapshot | null = null,
): Promise<string | null> {
  if (typeof (db as Pool).getConnection === "function")
    return transaction(db as Pool, (conn) =>
      captureDocumentRevision(conn, projectId, versionId, snapshot),
    );
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
  return affectedRows(result) ? id : null;
}

/** Historical file evidence keeps the file's current access boundary, not its latest-version filter. */
export async function canReadHistoricalSources(
  db: Db,
  projectId: string,
  sources: MemorySource[],
  visited: Set<string | null | undefined> = new Set(),
): Promise<boolean> {
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
  service: AccessService,
  user: AccessUser,
  projectId: string,
  pageId: string,
  {
    limit = 50,
    before = null,
    offset = 0,
  }: { limit?: unknown; before?: string | null; offset?: unknown } = {},
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
    const sources = parseSources(row.sources);
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
    const payload = parseRecord(item.evidence);
    if (
      await canReadHistoricalSources(
        service.db,
        projectId,
        parseSources(payload.sourceSnapshot, [item]),
      )
    )
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
    judgments: judgments.map((row) => ({ ...row, judgment: parseRecord(row.judgment) })),
  };
}
