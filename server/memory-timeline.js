import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import { HttpError } from "./http-error.js";

/**
 * 项目记忆读侧 + 人的两个动作（确认 / 纠错）+ 归档清算统计。
 * 数据模型见 docs/engineering/12-project-memory.md：不新增实体，记忆条目复用
 * wiki_pages、出处复用 wiki_page_sources、导读复用 agent_project_summaries、
 * 时间线卡复用 threads.archive_snapshot，纠错与确认都记 project_change_logs。
 */

const entryId = z.string().uuid();
const END_OF_TIME = "9999-12-31 23:59:59.999999";

function jsonValue(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function mapEntry(row, sources, disputed, relations = []) {
  return {
    id: row.id,
    kind: row.kind,
    subject: row.subject || null,
    aboutUserId: row.aboutUserId || null,
    title: row.title,
    body: row.body,
    status: row.status,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    disputed: !!disputed,
    relations,
    sources: (sources || []).map((source) => ({
      sourceKind: source.sourceKind,
      sourceId: source.sourceId,
      label: source.label,
    })),
  };
}

/**
 * 当前未解决的纠错标注：同一个条目上，最近一次 memory_entry_flagged 晚于
 * 最近一次 memory_entry_confirmed（或从未确认过）即视为争议。
 * 条目没有 disputed_at 列，争议状态完全由 project_change_logs 推导，不新增表。
 */
export async function disputedEntryIds(db, projectId) {
  const rows = await query(
    db,
    `SELECT p.id pageId,
      MAX(CASE WHEN l.action='memory_entry_flagged' THEN l.created_at END) flaggedAt,
      MAX(CASE WHEN l.action='memory_entry_confirmed' THEN l.created_at END) confirmedAt
    FROM project_change_logs l
    JOIN wiki_pages p ON p.project_id=l.project_id
      AND JSON_UNQUOTE(JSON_EXTRACT(l.details,'$.pageId'))=p.id
    WHERE l.project_id=? AND l.action IN ('memory_entry_flagged','memory_entry_confirmed')
    GROUP BY p.id`,
    [projectId],
  );
  const ids = new Set();
  for (const row of rows) {
    if (row.flaggedAt && (!row.confirmedAt || String(row.flaggedAt) > String(row.confirmedAt)))
      ids.add(row.pageId);
  }
  return ids;
}

/** 项目归档即关账：记忆只读，不再接受确认、纠错或手写写入。 */
export async function projectArchived(db, projectId) {
  const [row] = await query(db, "SELECT archived_at FROM projects WHERE id=?", [projectId]);
  return !!row?.archived_at;
}

/** 本轮迭代范围内的记忆草稿，供归档时人工校准（勾选后转正）。 */
export async function listIterationMemoryDrafts(db, { projectId, threadId, workflowId }) {
  const rows = await query(
    db,
    `SELECT DISTINCT p.id,p.kind,p.title,p.body,p.status,p.updated_at updatedAt
     FROM wiki_pages p JOIN wiki_page_sources s ON s.page_id=p.id
     WHERE p.project_id=? AND p.status='draft' AND (
       (s.source_kind='message' AND s.source_id IN (SELECT id FROM messages WHERE thread_id=?))
       OR (s.source_kind='document_version' AND s.source_id IN (SELECT id FROM versions WHERE thread_id=?))
       OR (s.source_kind='task' AND s.source_id IN (SELECT id FROM agent_tasks WHERE origin_thread_id=?))
       OR (s.source_kind='archive' AND s.source_id=?)
     )
     ORDER BY p.updated_at DESC,p.id`,
    [projectId, threadId, threadId, threadId, workflowId || ""],
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    title: row.title,
    preview: String(row.body || "").slice(0, 200),
    updatedAt: row.updatedAt,
  }));
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
     WHERE fp.project_id=? AND (r.from_page_id IN (${marks}) OR r.to_page_id IN (${marks}))`,
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

async function readMemoryEntry(db, projectId, id) {
  const [row] = await query(
    db,
    `SELECT p.id,p.kind,p.subject_type subject,p.about_user_id aboutUserId,p.title,p.body,p.status,
       p.created_by createdBy,p.updated_at updatedAt
    FROM wiki_pages p WHERE p.id=? AND p.project_id=?`,
    [id, projectId],
  );
  if (!row) return null;
  const [sources, disputed, relations] = await Promise.all([
    query(
      db,
      "SELECT source_kind sourceKind,source_id sourceId,label FROM wiki_page_sources WHERE page_id=? ORDER BY created_at,id",
      [id],
    ),
    disputedEntryIds(db, projectId),
    loadRelations(db, projectId, [id]),
  ]);
  return mapEntry(row, sources, disputed.has(id), relations.get(id) || []);
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

export async function readProjectMemory(service, user, projectId) {
  const member = await service.member(user, projectId, false);
  const db = service.db;
  const [summaryRows, threadRows, pageRows, sourceRows, disputed, tabOpenedAt] = await Promise.all([
    query(
      db,
      `SELECT s.summary,s.updated_at updatedAt,s.last_thread_id lastThreadId,
        t.title lastTitle,t.archived_at lastArchivedAt
      FROM agent_project_summaries s LEFT JOIN threads t ON t.id=s.last_thread_id
      WHERE s.project_id=?`,
      [projectId],
    ),
    query(
      db,
      `SELECT id,title,created_at createdAt,archived_at archivedAt,archive_snapshot archiveSnapshot
      FROM threads WHERE project_id=? AND status='archived' ORDER BY archived_at,id`,
      [projectId],
    ),
    query(
      db,
      `SELECT p.id,p.kind,p.subject_type subject,p.about_user_id aboutUserId,p.title,p.body,p.status,p.created_by createdBy,
        p.created_at createdAt,p.updated_at updatedAt
      FROM wiki_pages p WHERE p.project_id=?
      ORDER BY FIELD(p.status,'draft','current','superseded'),p.updated_at DESC,p.id`,
      [projectId],
    ),
    query(
      db,
      `SELECT s.page_id pageId,s.source_kind sourceKind,s.source_id sourceId,s.label
      FROM wiki_page_sources s JOIN wiki_pages p ON p.id=s.page_id
      WHERE p.project_id=? ORDER BY s.created_at,s.id`,
      [projectId],
    ),
    disputedEntryIds(db, projectId),
    memberTabOpenedAt(db, projectId, user.id),
  ]);

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

  const pageById = new Map(pageRows.map((row) => [row.id, row]));
  const sourcesByPage = new Map();
  const archivePagesByWorkflow = new Map();
  for (const source of sourceRows) {
    const list = sourcesByPage.get(source.pageId) || [];
    list.push(source);
    sourcesByPage.set(source.pageId, list);
    if (source.sourceKind !== "archive") continue;
    const pages = archivePagesByWorkflow.get(source.sourceId) || [];
    if (!pages.includes(source.pageId)) pages.push(source.pageId);
    archivePagesByWorkflow.set(source.sourceId, pages);
  }
  const relationsByPage = await loadRelations(
    db,
    projectId,
    pageRows.map((row) => row.id),
  );
  const members = await query(
    db,
    `SELECT u.id,u.name FROM members m JOIN users u ON u.id=m.user_id
     WHERE m.project_id=? ORDER BY u.name,u.id`,
    [projectId],
  );
  const entries = pageRows.map((row) =>
    mapEntry(
      row,
      sourcesByPage.get(row.id) || [],
      disputed.has(row.id),
      relationsByPage.get(row.id) || [],
    ),
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
      drafts: pageRows.filter((row) => row.status === "draft").length,
      disputes: [...disputed].filter((id) => pageById.has(id)).length,
      updatedSinceEntry: tabOpenedAt
        ? currentEntries.filter((row) => String(row.updatedAt) > String(tabOpenedAt)).length
        : currentEntries.length,
    },
    members: members.map((member) => ({ id: member.id, name: member.name })),
    timeline: threads.map((thread) =>
      timelineCard(thread, pageRows, artifacts, archivePagesByWorkflow),
    ),
    entries,
  };
}

export async function readProjectMemoryCounts(service, user, projectId) {
  await service.member(user, projectId, false);
  const db = service.db;
  const [[draftRow], disputed, tabOpenedAt] = await Promise.all([
    query(db, "SELECT COUNT(*) total FROM wiki_pages WHERE project_id=? AND status='draft'", [
      projectId,
    ]),
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
    drafts: Number(draftRow?.total || 0),
    disputes: disputed.size,
    updatedSinceEntry,
  };
}

export async function confirmMemoryEntry(service, user, projectId, id) {
  await service.member(user, projectId, true);
  if (await projectArchived(service.db, projectId))
    throw new HttpError(409, "项目已归档，项目记忆已封存，只能查看");
  entryId.parse(id);
  return transaction(service.db, async (conn) => {
    const [row] = await query(
      conn,
      "SELECT id,status,title FROM wiki_pages WHERE id=? AND project_id=? FOR UPDATE",
      [id, projectId],
    );
    if (!row) throw new HttpError(404, "记忆条目不存在");
    if (row.status === "current") throw new HttpError(409, "这条记忆已经确认过了");
    if (row.status !== "draft") throw new HttpError(409, "被替代的记忆条目不能再确认");
    await query(conn, "UPDATE wiki_pages SET status='current',updated_by=? WHERE id=?", [
      user.id,
      id,
    ]);
    await query(
      conn,
      "INSERT INTO project_change_logs(id,project_id,actor_user_id,action,details) VALUES(?,?,?,?,?)",
      [
        randomUUID(),
        projectId,
        user.id,
        "memory_entry_confirmed",
        JSON.stringify({ pageId: id, title: row.title }),
      ],
    );
    return readMemoryEntry(conn, projectId, id);
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
  if (row.status === "superseded") throw new HttpError(409, "被替代的记忆条目不需要再纠错");
  const logId = randomUUID();
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
  // 不改正文：只回带标注时间与原文备注，供前端把条目显示成「待裁决」。
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

/**
 * 归档确认事务内的记忆清算。
 * - confirmedEntryIds：人在清算清单里勾选确认的草稿，只有这些会 draft → current；
 * - 未勾选的草稿原样保留（keptDraft），不转正；
 * - 有未解决纠错标注的条目保持 draft，并补一条 memory_entry_disputed 日志标争议；
 * - apply=false 只重算统计、不写任何东西，供重复确认时保持响应稳定。
 */
export async function settleIterationMemory(conn, input) {
  const { projectId, threadId, userId, workflowId, confirmedEntryIds = [], apply = true } = input;
  const rows = await iterationEntryRows(conn, projectId, threadId, workflowId);
  const ids = rows.map((row) => row.id);
  const idSet = new Set(ids);
  const statusById = new Map(rows.map((row) => [row.id, row.status]));
  const requested = [...new Set(confirmedEntryIds)];
  // 只接受本轮条目；已经转正或被替代的重复勾选直接跳过，避免清算清单重放时整笔失败。
  if (apply && requested.some((id) => !idSet.has(id)))
    throw new HttpError(400, "只能确认本轮清算里的条目");

  let promoted = 0;
  if (apply)
    for (const id of requested) {
      const result = await query(
        conn,
        "UPDATE wiki_pages SET status='current',updated_by=? WHERE id=? AND status='draft'",
        [userId, id],
      );
      if (Number(result?.affectedRows || 0) === 0) continue;
      statusById.set(id, "current");
      promoted += 1;
      await query(
        conn,
        "INSERT INTO project_change_logs(id,project_id,actor_user_id,action,details) VALUES(?,?,?,?,?)",
        [
          randomUUID(),
          projectId,
          userId,
          "memory_entry_confirmed",
          JSON.stringify({ pageId: id, threadId, workflowId, source: "iteration_archive" }),
        ],
      );
    }

  const disputed = await disputedEntryIds(conn, projectId);
  let superseded = 0,
    keptDraft = 0,
    confirmed = 0;
  for (const id of ids) {
    const status = statusById.get(id);
    if (status === "superseded") superseded += 1;
    if (status === "draft") {
      keptDraft += 1;
      if (apply && disputed.has(id))
        await query(
          conn,
          "INSERT INTO project_change_logs(id,project_id,actor_user_id,action,details) VALUES(?,?,?,?,?)",
          [
            randomUUID(),
            projectId,
            userId,
            "memory_entry_disputed",
            JSON.stringify({ pageId: id, threadId, workflowId }),
          ],
        );
    }
  }
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const [row] = await query(
      conn,
      `SELECT COUNT(DISTINCT p.id) total FROM wiki_pages p
      JOIN project_change_logs l ON l.project_id=p.project_id
        AND l.action='memory_entry_confirmed'
        AND JSON_UNQUOTE(JSON_EXTRACT(l.details,'$.pageId'))=p.id
      WHERE p.status='current' AND p.id IN (${placeholders})`,
      ids,
    );
    confirmed = Number(row?.total || 0);
  }
  return {
    confirmed,
    promoted,
    superseded,
    keptDraft,
    disputed: [...disputed].filter((id) => idSet.has(id)).length,
  };
}
