import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query, transaction } from "./db.ts";
import { HttpError } from "./http-error.ts";
import { assertCanSupersedeMemory, resolveMemorySourceFamily } from "./memory-policy.ts";
import { intactConversationMemorySql } from "./conversation-memory-integrity.ts";
import { visibleFileIndexSql, visibleFileSourceSql } from "./file-index-visibility.ts";
import { hydrateFileIndexRoots } from "./file-index-roots.ts";
import { hydrateFileIndexGroups } from "./file-index-groups.js";
import { hydrateFileIndexPaths } from "./file-index-path.ts";
import { MEMORY_SUBJECTS } from "../shared/memory-kinds.js";
import { MEMORY_SUBTYPES, MEMORY_SUBTYPE_LABELS } from "../shared/memory-taxonomy.js";

/**
 * 项目记忆读侧、独立反馈、群消息记忆人工停用与归档统计。
 * 数据模型见 docs/engineering/12-project-memory.md：不新增实体，记忆条目复用
 * wiki_pages、出处复用 wiki_page_sources、导读复用 agent_project_summaries、
 * 时间线卡复用 threads.archive_snapshot，反馈与人工停用记 project_change_logs。
 */

const entryId = z.string().uuid();
const END_OF_TIME = "9999-12-31 23:59:59.999999";

function jsonValue(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function mapEntry(row, sources, disputed, relations = []) {
  return {
    id: row.id,
    subject: row.subject || null,
    subtype: row.subtype || null,
    aboutUserId: row.aboutUserId || null,
    title: row.title,
    body: row.body,
    status: row.status,
    sourceFamily: row.sourceFamily || null,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    disputed: !!disputed,
    sourceNeedsReview: Boolean(Number(row.sourceNeedsReview || 0)),
    fileArtifactId: row.fileArtifactId || null,
    fileGroup: row.fileGroupId
      ? {
          id: row.fileGroupId,
          evidence: row.fileGroupEvidence,
          origin: row.fileGroupOrigin,
          members: row.fileGroupMembers || [],
        }
      : null,
    relations,
    sources: (sources || []).map((source) => ({
      sourceKind: source.sourceKind,
      sourceId: source.sourceId,
      label: source.label,
    })),
  };
}

function parseCsv(value, limit = 50) {
  const raw = Array.isArray(value) ? value.join(",") : value;
  return [
    ...new Set(
      String(raw || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].slice(0, limit);
}

/** 非法/缺省值回落到默认值，分页参数一律收敛成正整数。 */
function positiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(number, max);
}

/** LIKE 里 % _ \ 需要转义，否则关键词会被当成通配符。 */
function escapeLike(value) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

const MEMORY_SUBTYPE_INDEX = Object.freeze(
  Object.entries(MEMORY_SUBTYPES).flatMap(([subject, keys]) =>
    keys.map((key) => ({ subject, key, label: MEMORY_SUBTYPE_LABELS[key] || "" })),
  ),
);

/** 关键词命中二级类型：key 或中文标签包含关键词（大小写不敏感）。 */
function matchedSubtypeKeys(keyword) {
  const needle = keyword.toLowerCase();
  return MEMORY_SUBTYPE_INDEX.filter(
    (item) => item.key.toLowerCase().includes(needle) || item.label.toLowerCase().includes(needle),
  ).map((item) => item.key);
}

/**
 * 当前未解决的纠错标注：同一个条目上，最近一次 memory_entry_flagged 晚于
 * 最近一次旧版 memory_entry_confirmed（兼容历史）后有反馈即显示反馈标记。
 * 这是独立反馈的展示兼容字段，不是记忆正确性或生命周期。
 * pageIds 省略时统计全项目；传数组时只统计这些条目，供分页读只查当前页。
 */
export async function disputedEntryIds(db, projectId, pageIds = null) {
  if (Array.isArray(pageIds) && !pageIds.length) return new Set();
  const scope = Array.isArray(pageIds) ? ` AND p.id IN (${pageIds.map(() => "?").join(",")})` : "";
  const rows = await query(
    db,
    `SELECT p.id pageId,
      MAX(CASE WHEN l.action='memory_entry_flagged' THEN l.created_at END) flaggedAt,
      MAX(CASE WHEN l.action='memory_entry_confirmed' THEN l.created_at END) confirmedAt
    FROM project_change_logs l
    JOIN wiki_pages p ON p.project_id=l.project_id
      AND JSON_UNQUOTE(JSON_EXTRACT(l.details,'$.pageId'))=p.id
    WHERE l.project_id=?${scope} AND l.action IN ('memory_entry_flagged','memory_entry_confirmed')
    GROUP BY p.id`,
    Array.isArray(pageIds) ? [projectId, ...pageIds] : [projectId],
  );
  const ids = new Set();
  for (const row of rows) {
    if (row.flaggedAt && (!row.confirmedAt || String(row.flaggedAt) > String(row.confirmedAt)))
      ids.add(row.pageId);
  }
  return ids;
}

/** 项目归档即关账：记忆只读，不再接受停用、反馈或手写写入。 */
export async function projectArchived(db, projectId) {
  const [row] = await query(db, "SELECT archived_at FROM projects WHERE id=?", [projectId]);
  return !!row?.archived_at;
}

/** @deprecated Memory no longer has an archive confirmation workflow. */
// Compatibility export: archive no longer promotes memory.
export async function listIterationMemoryDrafts() {
  return [];
}

async function loadRelations(db, projectId, pageIds) {
  const map = new Map();
  if (!pageIds.length) return map;
  const marks = pageIds.map(() => "?").join(",");
  const rows = await query(
    db,
    `SELECT r.id,r.from_page_id fromPageId,r.to_page_id toPageId,r.relation,r.note,
       fp.title fromTitle,tp.title toTitle
     FROM memory_relations r
     JOIN wiki_pages fp ON fp.id=r.from_page_id
     JOIN wiki_pages tp ON tp.id=r.to_page_id
     WHERE fp.project_id=? AND ${visibleFileIndexSql("fp")} AND ${visibleFileIndexSql("tp")}
       AND (r.from_page_id IN (${marks}) OR r.to_page_id IN (${marks}))`,
    [projectId, ...pageIds, ...pageIds],
  );
  for (const row of rows) {
    const sides = [
      {
        pageId: row.fromPageId,
        otherPageId: row.toPageId,
        otherTitle: row.toTitle,
        direction: "out",
      },
      {
        pageId: row.toPageId,
        otherPageId: row.fromPageId,
        otherTitle: row.fromTitle,
        direction: "in",
      },
    ];
    for (const side of sides) {
      const list = map.get(side.pageId) || [];
      list.push({
        id: row.id,
        relation: row.relation,
        direction: side.direction,
        otherPageId: side.otherPageId,
        otherTitle: side.otherTitle,
        note: row.note || "",
      });
      map.set(side.pageId, list);
    }
  }
  return map;
}

async function loadGroupMembers(db, projectId, pageRows) {
  const groupIds = [...new Set(pageRows.map((row) => row.fileGroupId).filter(Boolean))];
  if (!groupIds.length) return [];
  return query(
    db,
    `SELECT fm.group_id groupId,fm.artifact_id artifactId,fm.description
    FROM file_index_group_members fm JOIN file_index_groups fg ON fg.id=fm.group_id
    WHERE fg.project_id=? AND fg.id IN (${groupIds.map(() => "?").join(",")})`,
    [projectId, ...groupIds],
  );
}

async function loadPageSources(db, projectId, pageIds) {
  if (!pageIds.length) return [];
  return query(
    db,
    `SELECT s.page_id pageId,s.source_kind sourceKind,s.source_id sourceId,s.label
    FROM wiki_page_sources s JOIN wiki_pages p ON p.id=s.page_id
    WHERE p.project_id=? AND p.id IN (${pageIds.map(() => "?").join(",")})
      AND ${visibleFileIndexSql("p")} AND ${visibleFileSourceSql("s")} ORDER BY s.created_at,s.id`,
    [projectId, ...pageIds],
  );
}

/**
 * 补全一页（或全项目）条目所需的出处、关系、文件索引与纠错标注。
 * 多表查询都按 pageRows 的 id 收窄，分页读因此只补当前页，不扫全项目条目。
 */
async function hydrateEntries(db, projectId, pageRows) {
  const pageIds = pageRows.map((row) => row.id);
  if (!pageIds.length) return { entries: [], sourcesByPage: new Map(), disputed: new Set() };
  const [groupMembers, sourceRows, disputed, relationsByPage] = await Promise.all([
    loadGroupMembers(db, projectId, pageRows),
    loadPageSources(db, projectId, pageIds),
    disputedEntryIds(db, projectId, pageIds),
    loadRelations(db, projectId, pageIds),
  ]);
  const membersByGroup = new Map();
  for (const member of groupMembers) {
    const list = membersByGroup.get(member.groupId) || [];
    list.push(member);
    membersByGroup.set(member.groupId, list);
  }
  const withMembers = pageRows.map((row) =>
    row.fileGroupId ? { ...row, fileGroupMembers: membersByGroup.get(row.fileGroupId) || [] } : row,
  );
  const hydratedPages = await hydrateFileIndexPaths(
    db,
    projectId,
    await hydrateFileIndexGroups(
      db,
      projectId,
      await hydrateFileIndexRoots(db, projectId, withMembers),
    ),
  );
  const sourcesByPage = new Map();
  for (const source of sourceRows) {
    const list = sourcesByPage.get(source.pageId) || [];
    list.push(source);
    sourcesByPage.set(source.pageId, list);
  }
  const entries = hydratedPages.map((row) =>
    mapEntry(
      row,
      sourcesByPage.get(row.id) || [],
      disputed.has(row.id),
      relationsByPage.get(row.id) || [],
    ),
  );
  return { entries, sourcesByPage, disputed };
}

async function readMemoryEntry(db, projectId, id) {
  const [row] = await query(
    db,
    `SELECT p.id,p.subject_type subject,p.memory_subtype subtype,p.about_user_id aboutUserId,p.title,p.body,p.status,p.source_family sourceFamily,
       fi.artifact_id fileArtifactId,fg.id fileGroupId,fg.evidence fileGroupEvidence,fg.origin fileGroupOrigin,
       NOT ${intactConversationMemorySql("p")} sourceNeedsReview,
       p.created_by createdBy,p.updated_at updatedAt
    FROM wiki_pages p LEFT JOIN file_index_entries fi ON fi.page_id=p.id LEFT JOIN file_index_groups fg ON fg.page_id=p.id
    WHERE p.id=? AND p.project_id=? AND ${visibleFileIndexSql("p")}`,
    [id, projectId],
  );
  if (!row) return null;
  if (row.fileGroupId)
    row.fileGroupMembers = await query(
      db,
      "SELECT artifact_id artifactId,description FROM file_index_group_members WHERE group_id=? ORDER BY artifact_id",
      [row.fileGroupId],
    );
  const [sources, disputed, relations] = await Promise.all([
    query(
      db,
      `SELECT s.source_kind sourceKind,s.source_id sourceId,s.label FROM wiki_page_sources s
       WHERE s.page_id=? AND ${visibleFileSourceSql("s")} ORDER BY s.created_at,s.id`,
      [id],
    ),
    disputedEntryIds(db, projectId),
    loadRelations(db, projectId, [id]),
  ]);
  const rootRows = await hydrateFileIndexRoots(db, projectId, [row]);
  const groupRows = await hydrateFileIndexGroups(db, projectId, rootRows);
  const [hydrated] = await hydrateFileIndexPaths(db, projectId, groupRows);
  return mapEntry(hydrated, sources, disputed.has(id), relations.get(id) || []);
}

async function memberTabOpenedAt(db, projectId, userId) {
  const [member] = await query(
    db,
    "SELECT tab_opened_at tabOpenedAt FROM members WHERE project_id=? AND user_id=?",
    [projectId, userId],
  );
  return member?.tabOpenedAt || null;
}

function timelineCard(thread, pages, artifacts, archivePagesByWorkflow) {
  const snapshot = thread.snapshot || {};
  const workflowId = snapshot.workflowId || "";
  const settledPages = new Set(workflowId ? archivePagesByWorkflow.get(workflowId) || [] : []);
  const windowStart = String(thread.createdAt || "");
  const windowEnd = String(thread.archivedAt || snapshot.archivedAt || END_OF_TIME);
  // 条目没有迭代外键，按「本轮时间窗 + 本轮归档生成的页」估算记忆变化：结算生成的
  // 复盘/决策页创建时间略晚于 archived_at，靠 settledPages 补齐；其余按窗内时间判断。
  const changedPageIds = new Set(settledPages);
  let added = 0,
    updated = 0,
    superseded = 0;
  for (const page of pages) {
    const createdAt = String(page.createdAt || "");
    const updatedAt = String(page.updatedAt || "");
    const inWindow = updatedAt >= windowStart && updatedAt <= windowEnd;
    if (settledPages.has(page.id) || (createdAt >= windowStart && createdAt <= windowEnd)) {
      added += 1;
      changedPageIds.add(page.id);
    } else if (inWindow && page.status === "superseded") {
      superseded += 1;
      changedPageIds.add(page.id);
    } else if (inWindow) {
      updated += 1;
      changedPageIds.add(page.id);
    }
  }
  const seen = new Set();
  const keyVersions = [];
  for (const version of snapshot.versions || []) {
    if (!version?.id || seen.has(version.id)) continue;
    seen.add(version.id);
    keyVersions.push({
      versionId: version.id,
      artifactId: version.artifact_id || "",
      title: artifacts.get(version.artifact_id) || version.filename || "",
      version: Number(version.version || 0),
    });
  }
  return {
    iterationId: thread.id,
    title: thread.title,
    archivedAt: thread.archivedAt || snapshot.archivedAt || null,
    conclusion: snapshot.conclusion || "",
    memoryChanges: { added, updated, superseded },
    taskDecisions: (snapshot.taskDecisions || []).map((item) => ({
      taskId: item?.taskId || "",
      title: item?.title || "",
      disposition: item?.disposition || item?.suggestion || "",
      reason: item?.reason || "",
    })),
    keyVersions,
    pageIds: [...changedPageIds],
  };
}

/**
 * 先按 id 收窄、再套可见性谓词：整表直接用它要 3 秒（优化器会把全部文件索引与
 * 关联组物化后再跑依赖子查询），按 id 查是毫秒级。分块避开 IN 参数上限。
 */
async function visiblePageIds(db, projectId, pageIds) {
  const visible = new Set();
  for (let index = 0; index < pageIds.length; index += 400) {
    const chunk = pageIds.slice(index, index + 400);
    const rows = await query(
      db,
      `SELECT p.id FROM wiki_pages p
       WHERE p.id IN (${chunk.map(() => "?").join(",")}) AND p.project_id=?
       AND ${visibleFileIndexSql("p")}`,
      [...chunk, projectId],
    );
    for (const row of rows) visible.add(row.id);
  }
  return visible;
}

/** 时间线聚合只需要页骨架：不水合正文、出处与文件索引。 */
function loadPageSkeleton(db, projectId) {
  return query(
    db,
    `SELECT id,status,created_at createdAt,updated_at updatedAt
     FROM wiki_pages WHERE project_id=? ORDER BY updated_at DESC,id DESC`,
    [projectId],
  );
}

/** 迭代归档所生成的记忆页：时间线卡片按它补齐窗口外的新增页。 */
async function loadArchivePagesByWorkflow(db, projectId) {
  const rows = await query(
    db,
    `SELECT s.source_id workflowId,s.page_id pageId
     FROM wiki_page_sources s JOIN wiki_pages p ON p.id=s.page_id
     WHERE p.project_id=? AND s.source_kind='archive' ORDER BY s.created_at,s.id`,
    [projectId],
  );
  const map = new Map();
  for (const row of rows) {
    const pages = map.get(row.workflowId) || [];
    if (!pages.includes(row.pageId)) pages.push(row.pageId);
    map.set(row.workflowId, pages);
  }
  return map;
}

/** 弹窗默认只要导读、计数、时间线与轻量条目索引；传 includeEntries:false 跳过全量水合。 */
export async function readProjectMemory(service, user, projectId, options = {}) {
  const includeEntries = options.includeEntries !== false;
  const member = await service.member(user, projectId, false);
  const db = service.db;
  const [summaryRows, threadRows, skeleton, tabOpenedAt, totalRows, entryIndex] = await Promise.all(
    [
      (async () => {
        const { loadProjectSummary } = await import("./project-memory.js");
        const summary = await loadProjectSummary(db, projectId);
        return summary ? [{ ...summary, lastTitle: summary.lastThreadTitle }] : [];
      })(),
      query(
        db,
        `SELECT id,title,created_at createdAt,archived_at archivedAt,archive_snapshot archiveSnapshot
      FROM threads WHERE project_id=? AND status='archived' ORDER BY archived_at,id`,
        [projectId],
      ),
      loadPageSkeleton(db, projectId),
      memberTabOpenedAt(db, projectId, user.id),
      query(db, "SELECT COUNT(*) total FROM wiki_pages WHERE project_id=?", [projectId]),
      query(
        db,
        `SELECT p.id,p.subject_type subject,p.memory_subtype subtype,p.title,p.status,
        fi.artifact_id fileArtifactId
      FROM wiki_pages p LEFT JOIN file_index_entries fi ON fi.page_id=p.id
      WHERE p.project_id=? ORDER BY p.updated_at DESC,p.id DESC`,
        [projectId],
      ),
    ],
  );
  const threads = threadRows.map((row) => ({
    ...row,
    snapshot: jsonValue(row.archiveSnapshot) || {},
  }));
  const artifactIds = [
    ...new Set(
      threads.flatMap((thread) =>
        (thread.snapshot.versions || []).map((version) => version?.artifact_id).filter(Boolean),
      ),
    ),
  ];
  const artifacts = new Map(
    (artifactIds.length
      ? await query(
          db,
          `SELECT id,title FROM artifacts WHERE id IN (${artifactIds.map(() => "?").join(",")})`,
          artifactIds,
        )
      : []
    ).map((row) => [row.id, row.title]),
  );

  let entries = [];
  let pageRows = skeleton;
  let archivePages = new Map();
  if (includeEntries) {
    // 兼容旧调用（测试与需要整表的读法）：完整行 + 可见性 + 水合。弹窗已不走这条。
    const fullRows = await query(
      db,
      `SELECT p.id,p.subject_type subject,p.memory_subtype subtype,p.about_user_id aboutUserId,p.title,p.body,p.status,p.source_family sourceFamily,p.created_by createdBy,
        fi.artifact_id fileArtifactId,fg.id fileGroupId,fg.evidence fileGroupEvidence,fg.origin fileGroupOrigin,
        NOT ${intactConversationMemorySql("p")} sourceNeedsReview,
        p.created_at createdAt,p.updated_at updatedAt
      FROM wiki_pages p LEFT JOIN file_index_entries fi ON fi.page_id=p.id LEFT JOIN file_index_groups fg ON fg.page_id=p.id
      WHERE p.project_id=?
      ORDER BY FIELD(p.status,'current','superseded'),p.updated_at DESC,p.id`,
      [projectId],
    );
    const visible = await visiblePageIds(
      db,
      projectId,
      fullRows.map((row) => row.id),
    );
    pageRows = fullRows.filter((row) => visible.has(row.id));
    const hydrated = await hydrateEntries(db, projectId, pageRows);
    entries = hydrated.entries;
    for (const sources of hydrated.sourcesByPage.values()) {
      for (const source of sources) {
        if (source.sourceKind !== "archive") continue;
        const pages = archivePages.get(source.sourceId) || [];
        if (!pages.includes(source.pageId)) pages.push(source.pageId);
        archivePages.set(source.sourceId, pages);
      }
    }
  } else if (threads.length) {
    const visible = await visiblePageIds(
      db,
      projectId,
      skeleton.map((row) => row.id),
    );
    pageRows = skeleton.filter((row) => visible.has(row.id));
    archivePages = await loadArchivePagesByWorkflow(db, projectId);
  }
  const disputed = await disputedEntryIds(db, projectId);
  const members = await query(
    db,
    `SELECT u.id,u.name FROM members m JOIN users u ON u.id=m.user_id
     WHERE m.project_id=? ORDER BY u.name,u.id`,
    [projectId],
  );
  const currentEntries = pageRows.filter((row) => row.status === "current");
  const summary = summaryRows[0];
  const frozen = await projectArchived(db, projectId);
  return {
    canWrite: member.role !== "viewer" && !frozen,
    frozen,
    guide: summary
      ? {
          text: summary.summary || "",
          updatedAt: summary.updatedAt || null,
          basedOn: {
            iterationId: summary.lastThreadId || "",
            title: summary.lastTitle || "",
            archivedAt: summary.lastArchivedAt || null,
          },
        }
      : {
          text: "",
          updatedAt: null,
          basedOn: { iterationId: "", title: "", archivedAt: null },
        },
    counts: {
      disputes: disputed.size,
      updatedSinceEntry: tabOpenedAt
        ? currentEntries.filter((row) => String(row.updatedAt) > String(tabOpenedAt)).length
        : currentEntries.length,
      entries: Number(totalRows?.[0]?.total || 0),
    },
    members: members.map((member) => ({ id: member.id, name: member.name })),
    timeline: threads.map((thread) => timelineCard(thread, pageRows, artifacts, archivePages)),
    /** 轻量条目索引：关系选择、文件组合选择与聚焦判断需要全部条目的身份字段，但不含正文。 */
    entryIndex,
    entries,
  };
}

/** 单条详情：点开/聚焦时按需读取，避免打开弹窗就水合全部条目。 */
export async function readProjectMemoryEntry(service, user, projectId, entryId) {
  await service.member(user, projectId, false);
  return readMemoryEntry(service.db, projectId, entryId);
}

export async function listProjectMemoryEntries(service, user, projectId, options = {}) {
  await service.member(user, projectId, false);
  const db = service.db;
  // subject 三态：省略或 all 不筛；空串对应前端「其它记忆」（subject_type 为空）；
  // 其余按五类对象精确匹配，未知值按 all。
  const subjectFiltered = options.subject !== undefined && options.subject !== null;
  const requestedSubject = subjectFiltered ? String(options.subject).trim() : "";
  const subject = subjectFiltered
    ? requestedSubject === "" || MEMORY_SUBJECTS.includes(requestedSubject)
      ? requestedSubject
      : "all"
    : "all";
  const subtypes = parseCsv(options.subtypes);
  const statuses = parseCsv(options.statuses, 20);
  const keyword = String(options.q || "")
    .trim()
    .slice(0, 200);
  const page = positiveInteger(options.page, 1);
  const pageSize = positiveInteger(options.pageSize, 20, 100);

  const where = ["p.project_id=?"];
  const params = [projectId];
  if (subject === "") where.push("(p.subject_type IS NULL OR p.subject_type='')");
  else if (subject !== "all") {
    where.push("p.subject_type=?");
    params.push(subject);
  }
  if (subtypes.length) {
    where.push(`p.memory_subtype IN (${subtypes.map(() => "?").join(",")})`);
    params.push(...subtypes);
  }
  if (statuses.length) {
    where.push(`p.status IN (${statuses.map(() => "?").join(",")})`);
    params.push(...statuses);
  }
  if (keyword) {
    const like = `%${escapeLike(keyword)}%`;
    const subtypeKeys = matchedSubtypeKeys(keyword);
    if (subtypeKeys.length) {
      where.push(
        `(p.title LIKE ? OR p.memory_subtype IN (${subtypeKeys.map(() => "?").join(",")}))`,
      );
      params.push(like, ...subtypeKeys);
    } else {
      where.push("p.title LIKE ?");
      params.push(like);
    }
  }
  const whereSql = where.join(" AND ");
  const offset = (page - 1) * pageSize;
  /* 可见性谓词在整表上要 3 秒，按 id 收窄是毫秒级：先按普通条件批量扫出候选页骨架，
     再分批套可见性过滤，凑够当前页（含多取一条判断 hasMore）。total 用普通计数，
     极少数不可见的文件页可能让它略微偏大，列表本身是准确的。 */
  const [countRows] = await query(
    db,
    `SELECT COUNT(*) total FROM wiki_pages p WHERE ${whereSql}`,
    params,
  );
  const total = Number(countRows?.total || 0);
  const skeletonSql = `SELECT p.id,p.status,p.created_at createdAt,p.updated_at updatedAt
    FROM wiki_pages p WHERE ${whereSql} ORDER BY p.updated_at DESC,p.id DESC LIMIT ? OFFSET ?`;
  const batchSize = Math.max(100, pageSize * 3);
  const picked = [];
  let rawOffset = 0;
  while (picked.length <= offset + pageSize && rawOffset < total) {
    const chunk = await query(db, skeletonSql, [...params, batchSize, rawOffset]);
    if (!chunk.length) break;
    rawOffset += chunk.length;
    const visible = await visiblePageIds(
      db,
      projectId,
      chunk.map((row) => row.id),
    );
    picked.push(...chunk.filter((row) => visible.has(row.id)));
    if (chunk.length < batchSize) break;
  }
  const pageSkeleton = picked.slice(offset, offset + pageSize);
  const hasMore = picked.length > offset + pageSize;
  const rows = pageSkeleton.length
    ? await query(
        db,
        `SELECT p.id,p.subject_type subject,p.memory_subtype subtype,p.about_user_id aboutUserId,p.title,p.body,p.status,p.source_family sourceFamily,p.created_by createdBy,
        fi.artifact_id fileArtifactId,fg.id fileGroupId,fg.evidence fileGroupEvidence,fg.origin fileGroupOrigin,
        NOT ${intactConversationMemorySql("p")} sourceNeedsReview,
        p.created_at createdAt,p.updated_at updatedAt
      FROM wiki_pages p LEFT JOIN file_index_entries fi ON fi.page_id=p.id LEFT JOIN file_index_groups fg ON fg.page_id=p.id
      WHERE p.id IN (${pageSkeleton.map(() => "?").join(",")})`,
        pageSkeleton.map((row) => row.id),
      )
    : [];
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const pageRows = pageSkeleton.map((row) => rowById.get(row.id)).filter(Boolean);
  const { entries } = await hydrateEntries(db, projectId, pageRows);
  return {
    items: entries,
    page,
    pageSize,
    total,
    hasMore,
  };
}

export async function readProjectMemoryCounts(service, user, projectId) {
  await service.member(user, projectId, false);
  const db = service.db;
  const [disputed, tabOpenedAt] = await Promise.all([
    disputedEntryIds(db, projectId),
    memberTabOpenedAt(db, projectId, user.id),
  ]);
  let updatedSinceEntry = 0;
  if (tabOpenedAt) {
    const [row] = await query(
      db,
      `SELECT COUNT(*) total FROM wiki_pages
      WHERE project_id=? AND status='current' AND updated_at>?`,
      [projectId, tabOpenedAt],
    );
    updatedSinceEntry = Number(row?.total || 0);
  } else {
    const [row] = await query(
      db,
      "SELECT COUNT(*) total FROM wiki_pages WHERE project_id=? AND status='current'",
      [projectId],
    );
    updatedSinceEntry = Number(row?.total || 0);
  }
  return {
    disputes: disputed.size,
    updatedSinceEntry,
  };
}

export async function confirmMemoryEntry(service, user, projectId) {
  if (service) await service.member(user, projectId, true);
  throw new HttpError(410, "记忆无需确认转正，现行不代表内容真实");
}

export async function supersedeMemoryEntry(service, user, projectId, id, input) {
  await service.member(user, projectId, true);
  if (user.kind !== "session") throw new HttpError(403, "群消息记忆只能由人类登录后明确作废");
  if (await projectArchived(service.db, projectId))
    throw new HttpError(409, "项目已归档，只能查看");
  entryId.parse(id);
  const { reason } = z.object({ reason: z.string().trim().min(1).max(1000) }).parse(input);
  return transaction(service.db, async (conn) => {
    const [page] = await query(
      conn,
      "SELECT id,title,status FROM wiki_pages WHERE project_id=? AND id=? FOR UPDATE",
      [projectId, id],
    );
    if (!page) throw new HttpError(404, "记忆条目不存在");
    const sourceFamily = await resolveMemorySourceFamily(conn, projectId, id);
    assertCanSupersedeMemory({ sourceFamily, actorType: "human" });
    if (page.status === "superseded") return { id, status: page.status };
    await query(conn, "UPDATE wiki_pages SET status='superseded',updated_by=? WHERE id=?", [
      user.id,
      id,
    ]);
    await query(
      conn,
      "INSERT INTO project_change_logs(id,project_id,actor_user_id,action,details) VALUES(?,?,?,'memory_entry_superseded',?)",
      [
        randomUUID(),
        projectId,
        user.id,
        JSON.stringify({ pageId: id, title: page.title, reason, sourceFamily }),
      ],
    );
    return { id, status: "superseded", reason };
  });
}

export async function flagMemoryEntry(service, user, projectId, id, input) {
  await service.member(user, projectId, true);
  if (await projectArchived(service.db, projectId))
    throw new HttpError(409, "项目已归档，项目记忆已封存，只能查看");
  entryId.parse(id);
  const data = z.object({ note: z.string().trim().min(1).max(500) }).parse(input);
  const [row] = await query(
    service.db,
    "SELECT id,status,title FROM wiki_pages WHERE id=? AND project_id=?",
    [id, projectId],
  );
  if (!row) throw new HttpError(404, "记忆条目不存在");

  const logId = randomUUID();
  await query(
    service.db,
    "INSERT INTO memory_judgments(id,project_id,page_id,judgment_kind,actor_type,actor_id,judgment_json) VALUES(?,?,?,'other',?,?,?)",
    [
      randomUUID(),
      projectId,
      id,
      user.kind === "session" ? "human" : "ai",
      user.id,
      JSON.stringify({ note: data.note }),
    ],
  );
  await query(
    service.db,
    "INSERT INTO project_change_logs(id,project_id,actor_user_id,action,details) VALUES(?,?,?,?,?)",
    [
      logId,
      projectId,
      user.id,
      "memory_entry_flagged",
      JSON.stringify({ pageId: id, note: data.note, title: row.title }),
    ],
  );
  const [log] = await query(
    service.db,
    "SELECT created_at createdAt FROM project_change_logs WHERE id=?",
    [logId],
  );
  const entry = await readMemoryEntry(service.db, projectId, id);
  // 不改正文和生命周期，只回带独立反馈。
  return { ...entry, disputedAt: log?.createdAt || null, flagNote: data.note };
}

/** 本轮迭代直接关联到的记忆条目：出处指向本轮消息、文档版本、任务或归档。 */
async function iterationEntryRows(conn, projectId, threadId, workflowId) {
  return query(
    conn,
    `SELECT DISTINCT p.id,p.status
    FROM wiki_pages p JOIN wiki_page_sources s ON s.page_id=p.id
    WHERE p.project_id=? AND (
      (s.source_kind='message' AND s.source_id IN (SELECT id FROM messages WHERE thread_id=?))
      OR (s.source_kind='document_version' AND s.source_id IN (SELECT id FROM versions WHERE thread_id=?))
      OR (s.source_kind='task' AND s.source_id IN (SELECT id FROM agent_tasks WHERE origin_thread_id=?))
      OR (s.source_kind='archive' AND s.source_id=?)
    )`,
    [projectId, threadId, threadId, threadId, workflowId],
  );
}

/** Archive reports lifecycle counts without promoting or discarding memory. */
export async function settleIterationMemory(conn, { projectId, threadId, workflowId }) {
  const rows = await iterationEntryRows(conn, projectId, threadId, workflowId);
  const disputed = await disputedEntryIds(conn, projectId);
  return {
    current: rows.filter((row) => row.status === "current").length,
    superseded: rows.filter((row) => row.status === "superseded").length,
    disputed: rows.filter((row) => disputed.has(row.id)).length,
  };
}
