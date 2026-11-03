import { randomUUID } from "node:crypto";
import { query, transaction } from "./db.js";
import { intactConversationMemorySql } from "./conversation-memory-integrity.js";
import { visibleFileIndexSql } from "./file-index-visibility.js";

function splitLegacySummary(value) {
  const chunks = [];
  let text = "";
  let bytes = 0;
  for (const character of String(value)) {
    const size = Buffer.byteLength(character, "utf8");
    if (bytes + size > 30000) {
      chunks.push(text);
      text = "";
      bytes = 0;
    }
    text += character;
    bytes += size;
  }
  if (text) chunks.push(text);
  return chunks;
}

/** Find the explicitly designated status node; ordinary milestones are never a fallback. */
export async function readProjectStatusNode(db, projectId) {
  const [row] = await query(
    db,
    `SELECT p.id,p.title,p.body,p.updated_at updatedAt,
      EXISTS (SELECT 1 FROM wiki_page_sources x WHERE x.page_id=p.id AND (
        (x.source_kind='task' AND NOT EXISTS(SELECT 1 FROM agent_tasks t WHERE t.id=x.source_id AND t.project_id=p.project_id)) OR
        (x.source_kind='thread' AND NOT EXISTS(SELECT 1 FROM threads t WHERE t.id=x.source_id AND t.project_id=p.project_id)) OR
        (x.source_kind='milestone' AND NOT EXISTS(SELECT 1 FROM project_change_logs l WHERE l.id=x.source_id AND l.project_id=p.project_id)) OR
        (x.source_kind='memory_page' AND NOT EXISTS(SELECT 1 FROM wiki_pages q WHERE q.id=x.source_id AND q.project_id=p.project_id AND q.status='current' AND ${intactConversationMemorySql("q")} AND ${visibleFileIndexSql("q")})) OR
        (x.source_kind='iteration_context' AND NOT EXISTS(SELECT 1 FROM iteration_context_changes c JOIN threads t ON t.id=c.thread_id WHERE c.id=x.source_id AND t.project_id=p.project_id)) OR
        (x.source_kind='archive' AND NOT EXISTS(SELECT 1 FROM iteration_archive_workflows w JOIN threads t ON t.id=w.thread_id WHERE w.id=x.source_id AND t.project_id=p.project_id)) OR
        (x.source_kind='document_version' AND NOT EXISTS(SELECT 1 FROM versions v JOIN artifacts a ON a.id=v.artifact_id LEFT JOIN version_recycle vr ON vr.version_id=v.id WHERE v.id=x.source_id AND a.project_id=p.project_id AND a.deleted_at IS NULL AND a.purged_at IS NULL AND vr.version_id IS NULL))
      )) OR EXISTS (SELECT 1 FROM agent_project_memory_queue pending WHERE pending.project_id=p.project_id AND pending.source_kind<>'message') sourceNeedsReview FROM project_status_nodes s
     JOIN wiki_pages p ON p.id=s.page_id AND p.project_id=s.project_id
     WHERE s.project_id=? AND p.subject_type='project' AND p.status='current'`,
    [projectId],
  );
  if (!row) return null;
  const sources = await query(
    db,
    `SELECT s.source_kind kind,s.source_id id,s.label,ss.fingerprint FROM wiki_page_sources s
     LEFT JOIN project_status_source_snapshots ss ON ss.page_id=s.page_id AND ss.source_kind=s.source_kind AND ss.source_id=s.source_id
     WHERE s.page_id=?`,
    [row.id],
  );
  if (sources.length) {
    const { inspectProjectMemorySources } = await import("./project-memory.js");
    const current = await inspectProjectMemorySources(db, projectId, sources);
    if (
      current.some(
        (item, index) =>
          !item.verified ||
          !sources[index].fingerprint ||
          item.fingerprint !== sources[index].fingerprint,
      )
    )
      row.sourceNeedsReview = 1;
  } else if (row.body.trim() !== "## 当前状态\n\n- 待核实。") row.sourceNeedsReview = 1;
  return row;
}

/** Never expose a historical body when its original evidence is no longer accessible. */
export async function listProjectStatusHistory(service, user, projectId, limit = 20) {
  await service.member(user, projectId, false);
  const count = Math.max(1, Math.min(50, Math.trunc(Number(limit) || 20)));
  const rows = await query(
    service.db,
    `SELECT r.id,r.body,r.sources,r.created_at createdAt FROM project_status_revisions r
     JOIN project_status_nodes s ON s.project_id=r.project_id AND s.page_id=r.page_id
     WHERE r.project_id=? ORDER BY r.created_at DESC,r.id DESC LIMIT ?`,
    [projectId, count],
  );
  const { inspectProjectMemorySources } = await import("./project-memory.js");
  const result = [];
  for (const row of rows) {
    const parsed = typeof row.sources === "string" ? JSON.parse(row.sources) : row.sources;
    const sources = Array.isArray(parsed) ? parsed : [];
    const checked = await inspectProjectMemorySources(service.db, projectId, sources);
    const needsReview =
      checked.some(
        (source, index) =>
          !source.verified ||
          !sources[index]?.fingerprint ||
          sources[index].fingerprint !== source.fingerprint,
      ) ||
      (!checked.length && row.body.trim() !== "## 当前状态\n\n- 待核实。");
    result.push({
      id: row.id,
      createdAt: row.createdAt,
      sourceNeedsReview: needsReview,
      body: (await (
        await import("./memory-history.js")
      ).canReadHistoricalSources(service.db, projectId, sources))
        ? row.body
        : null,
      sources,
    });
  }
  return result;
}

/** Serialize creation per project and leave legacy pages untouched. */
export async function ensureProjectStatusNode(db, projectId, userId) {
  if (!projectId || !userId) throw new Error("项目现状需要项目和创建者");
  return transaction(db, async (conn) => {
    const [project] = await query(conn, "SELECT id FROM projects WHERE id=? FOR UPDATE", [
      projectId,
    ]);
    if (!project) throw new Error("项目不存在");
    const existing = await readProjectStatusNode(conn, projectId);
    if (existing) return existing.id;
    const [mapping] = await query(
      conn,
      "SELECT page_id FROM project_status_nodes WHERE project_id=?",
      [projectId],
    );
    if (mapping) throw new Error("项目现状节点不可用，需要修复后重试");
    // Preserve the previous free-form summary as historical material; it may
    // contain goals or outdated conclusions and must never become current state.
    const [legacy] = await query(
      conn,
      "SELECT summary FROM agent_project_summaries WHERE project_id=? FOR UPDATE",
      [projectId],
    );
    if (String(legacy?.summary || "").trim()) {
      const chunks = splitLegacySummary(legacy.summary);
      for (const [index, chunk] of chunks.entries())
        await query(
          conn,
          `INSERT INTO wiki_pages(id,project_id,subject_type,memory_subtype,title,body,status,created_by,updated_by)
         VALUES(?,?,'project','phase_change',?,?,'current',?,?)`,
          [
            randomUUID(),
            projectId,
            `历史项目摘要（待核实）${chunks.length > 1 ? ` ${index + 1}/${chunks.length}` : ""}`,
            `## 历史摘要（待核实）\n\n${chunk}`,
            userId,
            userId,
          ],
        );
    }
    const id = randomUUID();
    await query(
      conn,
      `INSERT INTO wiki_pages(id,project_id,subject_type,memory_subtype,title,body,status,created_by,updated_by)
       VALUES(?,?,'project','phase_change','项目现状','## 当前状态\n\n- 待核实。','current',?,?)`,
      [id, projectId, userId, userId],
    );
    await query(
      conn,
      "INSERT INTO project_status_nodes(project_id,page_id,last_checked_at) VALUES(?,?,UTC_TIMESTAMP(3))",
      [projectId, id],
    );
    return id;
  });
}

/** Lock all status evidence before any consistent read in the settlement transaction. */
export async function lockProjectStatusSources(conn, projectId, sources) {
  // Hold mutable evidence until commit; verification must describe this exact snapshot.
  for (const source of [...sources].sort((a, b) => a.sourceId.localeCompare(b.sourceId))) {
    const sql = {
      task: "SELECT id FROM agent_tasks WHERE id=? AND project_id=? FOR UPDATE",
      thread: "SELECT id FROM threads WHERE id=? AND project_id=? FOR UPDATE",
      memory_page: "SELECT id FROM wiki_pages WHERE id=? AND project_id=? FOR UPDATE",
      milestone: "SELECT id FROM project_change_logs WHERE id=? AND project_id=? FOR UPDATE",
      document_version:
        "SELECT v.id FROM versions v JOIN artifacts a ON a.id=v.artifact_id WHERE v.id=? AND a.project_id=? FOR UPDATE",
      iteration_context:
        "SELECT c.id FROM iteration_context_changes c JOIN threads t ON t.id=c.thread_id WHERE c.id=? AND t.project_id=? FOR UPDATE",
      archive:
        "SELECT w.id FROM iteration_archive_workflows w JOIN threads t ON t.id=w.thread_id WHERE w.id=? AND t.project_id=? FOR UPDATE",
    }[source.sourceKind];
    if (!sql || !(await query(conn, sql, [source.sourceId, projectId])).length)
      throw new Error("项目现状出处已变化，请重新核验");
    if (source.sourceKind === "memory_page")
      await query(
        conn,
        `SELECT m.id FROM wiki_page_sources s JOIN messages m ON m.id=s.source_id
        WHERE s.page_id=? AND s.source_kind='message' ORDER BY m.id FOR UPDATE`,
        [source.sourceId],
      );
  }
}

/** Apply only against the exact snapshot provided to the model; caller owns the transaction. */
export async function applyProjectStatusNode(
  conn,
  projectId,
  userId,
  snapshot,
  proposal,
  candidates,
) {
  if (!proposal) return false;
  const unchanged = proposal.op === "unchanged";
  const body = unchanged ? String(snapshot?.body || "") : String(proposal.body || "").trim();
  if (!body || Buffer.byteLength(body, "utf8") > 60000 || !body.includes("## 当前状态"))
    throw new Error("项目现状格式无效");
  const sources = unchanged
    ? candidates
    : (proposal.sourceIds || []).map((id) =>
        candidates.find((candidate) => candidate.queueId === id || candidate.sourceId === id),
      );
  if (!sources.length || sources.some((source) => !source || !source.verified))
    throw new Error("项目现状缺少可核验的候选出处");
  await lockProjectStatusSources(conn, projectId, sources);
  const { inspectProjectMemorySources } = await import("./project-memory.js");
  const currentSources = await inspectProjectMemorySources(
    conn,
    projectId,
    sources.map((source) => ({ kind: source.sourceKind, id: source.sourceId })),
  );
  if (
    currentSources.some(
      (source, index) => !source.verified || source.fingerprint !== sources[index].fingerprint,
    )
  )
    throw new Error("项目现状出处已变化，请重新核验");
  const [page] = await query(
    conn,
    `SELECT p.id,p.body FROM project_status_nodes s JOIN wiki_pages p ON p.id=s.page_id
     WHERE s.project_id=? AND p.project_id=s.project_id AND p.status='current' FOR UPDATE`,
    [projectId],
  );
  if (!page || !snapshot || page.id !== snapshot.id || page.body !== snapshot.body)
    throw new Error("项目现状已变化，请重新整理");
  const priorSources = await query(
    conn,
    "SELECT source_kind kind,source_id id,label FROM wiki_page_sources WHERE page_id=?",
    [page.id],
  );
  const fingerprints = await query(
    conn,
    "SELECT source_kind kind,source_id id,fingerprint FROM project_status_source_snapshots WHERE page_id=?",
    [page.id],
  );
  const [pinned] = await query(
    conn,
    "SELECT sources FROM memory_page_revisions WHERE page_id=? AND body=? AND capture_kind<>'before_update' ORDER BY recorded_at DESC,id DESC LIMIT 1",
    [page.id, page.body],
  );
  const pinnedSources =
    typeof pinned?.sources === "string" ? JSON.parse(pinned.sources) : pinned?.sources || [];
  const archivedSources = priorSources.map((source) => ({
    ...source,
    ...(pinnedSources.find(
      (item) =>
        (item.kind || item.sourceKind) === source.kind && (item.sourceId || item.id) === source.id,
    )?.frozenSources
      ? {
          frozenSources: pinnedSources.find(
            (item) =>
              (item.kind || item.sourceKind) === source.kind &&
              (item.sourceId || item.id) === source.id,
          ).frozenSources,
        }
      : {}),
    fingerprint:
      fingerprints.find((item) => item.kind === source.kind && item.id === source.id)
        ?.fingerprint || null,
  }));
  const oldKeys = priorSources.map((item) => `${item.kind}:${item.id}`).sort();
  const newKeys = [...new Set(sources.map((item) => `${item.sourceKind}:${item.sourceId}`))].sort();
  const contentChanged = page.body !== body || JSON.stringify(oldKeys) !== JSON.stringify(newKeys);
  if (unchanged && contentChanged) throw new Error("项目现状出处集合已变化，请重新整理");
  if (!contentChanged) {
    for (const source of sources) {
      if (!source.fingerprint) throw new Error("项目现状出处缺少有效快照");
      await query(
        conn,
        `INSERT INTO project_status_source_snapshots(page_id,source_kind,source_id,fingerprint)
        VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE fingerprint=VALUES(fingerprint)`,
        [page.id, source.sourceKind, source.sourceId, source.fingerprint],
      );
    }
    return false;
  }
  if (contentChanged)
    await query(
      conn,
      "INSERT INTO project_status_revisions(id,project_id,page_id,body,sources) VALUES(?,?,?,?,?)",
      [randomUUID(), projectId, page.id, page.body, JSON.stringify(archivedSources)],
    );
  if (contentChanged)
    await query(conn, "UPDATE wiki_pages SET body=?,updated_by=? WHERE id=?", [
      body,
      userId,
      page.id,
    ]);
  // Replace the evidence set: the complete body was verified against it.
  await query(conn, "DELETE FROM wiki_page_sources WHERE page_id=?", [page.id]);
  await query(conn, "DELETE FROM project_status_source_snapshots WHERE page_id=?", [page.id]);
  await query(
    conn,
    "DELETE FROM memory_relations WHERE project_id=? AND from_page_id=? AND note='项目现状依据'",
    [projectId, page.id],
  );
  for (const source of new Map(
    sources.map((item) => [`${item.sourceKind}:${item.sourceId}`, item]),
  ).values()) {
    if (!source.fingerprint) throw new Error("项目现状出处缺少有效快照");
    const [existing] = await query(
      conn,
      "SELECT id FROM wiki_page_sources WHERE page_id=? AND source_kind=? AND source_id=? LIMIT 1",
      [page.id, source.sourceKind, source.sourceId],
    );
    if (!existing)
      await query(
        conn,
        "INSERT INTO wiki_page_sources(id,page_id,source_kind,source_id,label) VALUES(?,?,?,?,?)",
        [
          randomUUID(),
          page.id,
          source.sourceKind,
          source.sourceId,
          String(source.hint || source.sourceKind).slice(0, 240),
        ],
      );
    await query(
      conn,
      "INSERT INTO project_status_source_snapshots(page_id,source_kind,source_id,fingerprint) VALUES(?,?,?,?)",
      [page.id, source.sourceKind, source.sourceId, source.fingerprint],
    );
    if (source.sourceKind === "memory_page") {
      const { createMemoryRelation } = await import("./memory-graph.js");
      await createMemoryRelation(conn, {
        projectId,
        fromPageId: page.id,
        toPageId: source.sourceId,
        relation: "relates",
        note: "项目现状依据",
        createdBy: userId,
      });
    }
  }
  await query(conn, "UPDATE wiki_pages SET source_family='project_activity' WHERE id=?", [page.id]);
  const { captureMemoryRevision, recordMemoryEvidence } = await import("./memory-history.js");
  await captureMemoryRevision(
    conn,
    { id: page.id, title: "项目现状", body, status: "current" },
    { captureKind: "project_status_snapshot" },
  );
  for (const source of sources)
    await recordMemoryEvidence(conn, {
      projectId,
      pageId: page.id,
      sourceFamily: "project_activity",
      sourceKind: source.sourceKind,
      sourceId: source.sourceId,
      sourceRevision: source.fingerprint,
      evidence: { text: source.text, fingerprint: source.fingerprint },
      purpose: "decision_basis",
    });
  return contentChanged;
}
