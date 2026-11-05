import { createHash, randomUUID } from "node:crypto";
import { query, transaction } from "./db.ts";
import { HttpError } from "./http-error.js";
import { createMemoryRelation } from "./memory-graph.js";
import { visibleFileIndexSql } from "./file-index-visibility.js";

function stableId(projectId, first, second) {
  const pair = [first, second].sort().join(":");
  const h = createHash("sha256").update(`cothread:file-group:${projectId}:${pair}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function mentionsFilename(text, filename) {
  const isNameCharacter = (character) => /[a-z0-9_.-]/i.test(character || "");
  let position = text.indexOf(filename);
  while (position >= 0) {
    if (!isNameCharacter(text[position - 1]) && !isNameCharacter(text[position + filename.length]))
      return true;
    position = text.indexOf(filename, position + 1);
  }
  return false;
}

/** Caller has already checked project write permission. */
export async function saveFileIndexGroup(
  db,
  {
    projectId,
    createdBy,
    groupId,
    title,
    evidence,
    members,
    automatic = false,
    evidenceKind = "manual",
    evidenceArtifactId = null,
    evidenceVersionId = null,
    evidenceTargetVersionId = null,
  } = {},
) {
  if (typeof db.getConnection === "function")
    return transaction(db, (conn) =>
      saveFileIndexGroup(conn, {
        projectId,
        createdBy,
        groupId,
        title,
        evidence,
        members,
        automatic,
        evidenceKind,
        evidenceArtifactId,
        evidenceVersionId,
        evidenceTargetVersionId,
      }),
    );
  const cleanTitle = String(title || "")
    .trim()
    .slice(0, 160);
  const cleanEvidence = String(evidence || "")
    .trim()
    .slice(0, 4000);
  const cleanMembers = (Array.isArray(members) ? members : []).map((m) => ({
    artifactId: String(m?.artifactId || ""),
    description: String(m?.description || "")
      .trim()
      .slice(0, 500),
  }));
  if (
    !cleanTitle ||
    !cleanEvidence ||
    cleanMembers.length < 2 ||
    cleanMembers.length > 50 ||
    new Set(cleanMembers.map((m) => m.artifactId)).size !== cleanMembers.length
  )
    throw new HttpError(400, "关联索引需要标题、关联依据和 2 至 50 个不同文件");
  const ids = cleanMembers.map((m) => m.artifactId);
  const rows = await query(
    db,
    `SELECT fi.artifact_id artifactId,fi.page_id pageId FROM file_index_entries fi
    JOIN wiki_pages p ON p.id=fi.page_id WHERE fi.project_id=? AND fi.artifact_id IN (${ids.map(() => "?").join(",")})
      AND p.status='current' AND ${visibleFileIndexSql("p")}`,
    [projectId, ...ids],
  );
  if (rows.length !== ids.length) throw new HttpError(400, "关联文件不存在、已删除或索引尚不可用");
  const id = groupId || randomUUID();
  const [existing] = await query(
    db,
    "SELECT page_id pageId,manually_managed manuallyManaged FROM file_index_groups WHERE id=? AND project_id=? FOR UPDATE",
    [id, projectId],
  );
  if (automatic && existing?.manuallyManaged)
    return { groupId: id, pageId: existing.pageId, preserved: true };
  if (!existing && groupId && !automatic) throw new HttpError(404, "关联索引不存在");
  const pageId = existing?.pageId || randomUUID();
  const body = `## 关联依据\n${cleanEvidence}\n\n## 文件\n关联文件及其当前状态在查看时生成。`;
  if (!existing) {
    await query(
      db,
      `INSERT INTO wiki_pages(id,project_id,subject_type,memory_subtype,title,body,status,created_by,updated_by)
      VALUES(?,?,'document','reference_material',?,?,'current',?,?)`,
      [pageId, projectId, cleanTitle, body, createdBy, createdBy],
    );
    await query(
      db,
      `INSERT INTO file_index_groups(id,project_id,page_id,origin,manually_managed,evidence,evidence_kind,evidence_artifact_id,evidence_version_id,evidence_target_version_id)
      VALUES(?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        projectId,
        pageId,
        automatic ? "automatic" : "manual",
        !automatic,
        cleanEvidence,
        automatic ? evidenceKind : "manual",
        evidenceArtifactId,
        evidenceVersionId,
        evidenceTargetVersionId,
      ],
    );
  } else {
    await query(
      db,
      "UPDATE wiki_pages SET title=?,body=?,status='current',updated_by=? WHERE id=?",
      [cleanTitle, body, createdBy, pageId],
    );
    await query(
      db,
      "UPDATE file_index_groups SET dismissed_at=NULL,evidence=?,manually_managed=?,evidence_kind=?,evidence_artifact_id=?,evidence_version_id=?,evidence_target_version_id=? WHERE id=?",
      [
        cleanEvidence,
        !automatic,
        automatic ? evidenceKind : "manual",
        evidenceArtifactId,
        evidenceVersionId,
        evidenceTargetVersionId,
        id,
      ],
    );
    await query(
      db,
      "DELETE FROM memory_relations WHERE project_id=? AND from_page_id=? AND relation='relates' AND to_page_id IN (SELECT fi.page_id FROM file_index_group_members fm JOIN file_index_entries fi ON fi.artifact_id=fm.artifact_id AND fi.project_id=? WHERE fm.group_id=?)",
      [projectId, pageId, projectId, id],
    );
    await query(db, "DELETE FROM file_index_group_members WHERE group_id=?", [id]);
  }
  for (const member of cleanMembers) {
    await query(
      db,
      "INSERT INTO file_index_group_members(group_id,artifact_id,description) VALUES(?,?,?)",
      [id, member.artifactId, member.description],
    );
    const target = rows.find((row) => row.artifactId === member.artifactId);
    await createMemoryRelation(db, {
      projectId,
      fromPageId: pageId,
      toPageId: target.pageId,
      relation: "relates",
      note: member.description,
      createdBy,
    });
  }
  const { noteProjectMemorySignal } = await import("./project-memory.js");
  await noteProjectMemorySignal(
    db,
    projectId,
    "memory_page",
    pageId,
    `关联文件索引变化：${cleanTitle}`,
    { urgent: false },
  );
  return { groupId: id, pageId, preserved: false };
}

/** Only an explicit source/copy link is strong enough for automatic grouping. */
export async function discoverLinkedFileGroup(db, { projectId, artifactId, createdBy } = {}) {
  const links = await query(
    db,
    `SELECT id,title,source_artifact_id sourceId FROM artifacts
    WHERE project_id=? AND deleted_at IS NULL AND purged_at IS NULL
      AND (id=? OR source_artifact_id=?) AND source_artifact_id IS NOT NULL`,
    [projectId, artifactId, artifactId],
  );
  for (const row of links) {
    const available = await query(
      db,
      `SELECT COUNT(*) count FROM file_index_entries fi JOIN wiki_pages p ON p.id=fi.page_id
      WHERE fi.project_id=? AND fi.artifact_id IN (?,?) AND ${visibleFileIndexSql("p")}`,
      [projectId, row.id, row.sourceId],
    );
    if (Number(available[0]?.count || 0) !== 2) continue;
    await saveFileIndexGroup(db, {
      projectId,
      createdBy,
      groupId: stableId(projectId, row.id, row.sourceId),
      automatic: true,
      title: `关联文件：${row.title}`.slice(0, 160),
      evidence: "文件库记录了另存来源关系。",
      evidenceKind: "copy",
      evidenceArtifactId: row.id,
      members: [
        { artifactId: row.sourceId, description: "来源文件" },
        { artifactId: row.id, description: "由来源另存的文件" },
      ],
    });
  }
}

/** A unique, explicit filename mentioned in readable content is a traceable reference. */
export async function discoverReferencedFileGroups(
  db,
  { projectId, artifactId, versionId, createdBy, content } = {},
) {
  const text = String(content || "");
  if (!text.trim()) return { truncated: false };
  // Keep bounded filename-shaped mentions even before a target exists. Every
  // eventual match is checked again against the actual source text.
  const allMentions = [
    ...new Set(
      (text.match(/[\p{L}\p{N}_.-]{1,180}\.[a-z0-9]{1,10}/giu) || []).map((item) =>
        item.slice(0, 200),
      ),
    ),
  ];
  const mentions = allMentions.slice(0, 200);
  await query(db, "DELETE FROM file_index_reference_mentions WHERE source_version_id=?", [
    versionId,
  ]);
  for (const mention of mentions) {
    const digest = createHash("sha256").update(mention.toLowerCase()).digest("hex");
    await query(
      db,
      `INSERT IGNORE INTO file_index_reference_mentions
      (project_id,source_artifact_id,source_version_id,mention_hash,mention) VALUES(?,?,?,?,?)`,
      [projectId, artifactId, versionId, digest, mention],
    );
  }
  const rows = await query(
    db,
    `SELECT fi.artifact_id artifactId,v.id versionId,v.filename,
      COUNT(*) OVER (PARTITION BY LOWER(v.filename)) nameCount FROM file_index_entries fi
    JOIN wiki_pages p ON p.id=fi.page_id JOIN versions v ON v.id=fi.indexed_version_id
    WHERE fi.project_id=? AND fi.artifact_id<>? AND p.status='current' AND ${visibleFileIndexSql("p")}
    ORDER BY p.updated_at DESC LIMIT 500`,
    [projectId, artifactId],
  );
  const haystack = text.toLowerCase();
  const generic = new Set(["readme.md", "index.js", "index.ts", "package.json", "index.html"]);
  for (const row of rows) {
    const filename = String(row.filename || "").trim();
    const normalized = filename.toLowerCase();
    if (
      filename.length < 5 ||
      generic.has(normalized) ||
      Number(row.nameCount) !== 1 ||
      !mentionsFilename(haystack, normalized)
    )
      continue;
    await saveFileIndexGroup(db, {
      projectId,
      createdBy,
      groupId: stableId(projectId, artifactId, row.artifactId),
      automatic: true,
      title: `关联文件：${filename}`.slice(0, 160),
      evidence: `文件内容明确引用了项目内唯一匹配的文件名「${filename}」。`,
      evidenceKind: "reference",
      evidenceArtifactId: artifactId,
      evidenceVersionId: versionId,
      evidenceTargetVersionId: row.versionId,
      members: [
        { artifactId, description: "包含文件引用" },
        { artifactId: row.artifactId, description: "被引用的文件" },
      ],
    });
  }
  return { truncated: allMentions.length > mentions.length };
}

/** Match retained mentions after a target appears and check the original text. */
export async function discoverWaitingFileReferences(
  db,
  { projectId, artifactId, versionId, createdBy } = {},
) {
  const [target] = await query(
    db,
    `SELECT v.filename FROM file_index_entries fi
    JOIN wiki_pages p ON p.id=fi.page_id JOIN versions v ON v.id=fi.indexed_version_id
    WHERE fi.project_id=? AND fi.artifact_id=? AND fi.indexed_version_id=? AND ${visibleFileIndexSql("p")}`,
    [projectId, artifactId, versionId],
  );
  if (!target) return;
  const filename = String(target.filename || "").trim();
  const normalized = filename.toLowerCase();
  if (
    filename.length < 5 ||
    new Set(["readme.md", "index.js", "index.ts", "package.json", "index.html"]).has(normalized)
  )
    return;
  const sources = await query(
    db,
    `SELECT fi.artifact_id sourceId,v.id sourceVersionId,v.filename,v.mime,v.content
    FROM file_index_entries fi JOIN wiki_pages p ON p.id=fi.page_id
    JOIN versions v ON v.id=fi.indexed_version_id
    WHERE fi.project_id=? AND fi.artifact_id<>? AND p.status='current' AND ${visibleFileIndexSql("p")}
      AND EXISTS (SELECT 1 FROM file_index_reference_mentions m WHERE m.project_id=fi.project_id
        AND m.source_artifact_id=fi.artifact_id AND m.source_version_id=fi.indexed_version_id
        AND LOCATE(LOWER(?),LOWER(m.mention))>0)`,
    [projectId, artifactId, filename],
  );
  const { extractIndexText } = await import("./file-index-extract.js");
  for (const source of sources) {
    const [count] = await query(
      db,
      `SELECT COUNT(*) count FROM file_index_entries fi
      JOIN wiki_pages p ON p.id=fi.page_id JOIN versions v ON v.id=fi.indexed_version_id
      WHERE fi.project_id=? AND fi.artifact_id<>? AND LOWER(v.filename)=? AND p.status='current' AND ${visibleFileIndexSql("p")}`,
      [projectId, source.sourceId, normalized],
    );
    if (Number(count?.count || 0) !== 1) continue;
    const extracted = await extractIndexText({
      mime: source.mime,
      filename: source.filename,
      content: source.content,
    });
    if (!mentionsFilename(String(extracted.text || "").toLowerCase(), normalized)) continue;
    await saveFileIndexGroup(db, {
      projectId,
      createdBy,
      groupId: stableId(projectId, source.sourceId, artifactId),
      automatic: true,
      title: `关联文件：${filename}`.slice(0, 160),
      evidence: `文件内容明确引用了项目内唯一匹配的文件名「${filename}」。`,
      evidenceKind: "reference",
      evidenceArtifactId: source.sourceId,
      evidenceVersionId: source.sourceVersionId,
      evidenceTargetVersionId: versionId,
      members: [
        { artifactId: source.sourceId, description: "包含文件引用" },
        { artifactId, description: "被引用的文件" },
      ],
    });
  }
}

/** Recheck existing references when the referenced file gets another version. */
export async function recheckGroupsForTarget(
  db,
  { projectId, artifactId, versionId, createdBy } = {},
) {
  const [target] = await query(
    db,
    `SELECT v.filename FROM file_index_entries fi
    JOIN wiki_pages p ON p.id=fi.page_id JOIN versions v ON v.id=fi.indexed_version_id
    WHERE fi.project_id=? AND fi.artifact_id=? AND fi.indexed_version_id=? AND ${visibleFileIndexSql("p")}`,
    [projectId, artifactId, versionId],
  );
  if (!target) return;
  const filename = String(target.filename || "").trim();
  const normalized = filename.toLowerCase();
  if (
    filename.length < 5 ||
    new Set(["readme.md", "index.js", "index.ts", "package.json", "index.html"]).has(normalized)
  )
    return;
  const rows = await query(
    db,
    `SELECT g.id,g.evidence_artifact_id sourceId,g.evidence_version_id sourceVersionId,
      source_v.mime,source_v.filename,source_v.content
    FROM file_index_groups g JOIN wiki_pages group_page ON group_page.id=g.page_id AND group_page.status='current'
    JOIN file_index_group_members target_member ON target_member.group_id=g.id AND target_member.artifact_id=?
    JOIN file_index_entries source_index ON source_index.project_id=g.project_id AND source_index.artifact_id=g.evidence_artifact_id
      AND source_index.indexed_version_id=g.evidence_version_id
    JOIN wiki_pages source_page ON source_page.id=source_index.page_id
    JOIN versions source_v ON source_v.id=source_index.indexed_version_id
    WHERE g.project_id=? AND g.origin='automatic' AND g.manually_managed=0 AND g.evidence_kind='reference'
      AND g.evidence_artifact_id<>? AND NOT (g.evidence_target_version_id <=> ?) AND ${visibleFileIndexSql("source_page")}`,
    [artifactId, projectId, artifactId, versionId],
  );
  const { extractIndexText } = await import("./file-index-extract.js");
  for (const row of rows) {
    const [count] = await query(
      db,
      `SELECT COUNT(*) count FROM file_index_entries fi
      JOIN wiki_pages p ON p.id=fi.page_id JOIN versions v ON v.id=fi.indexed_version_id
      WHERE fi.project_id=? AND fi.artifact_id<>? AND LOWER(v.filename)=? AND p.status='current' AND ${visibleFileIndexSql("p")}`,
      [projectId, row.sourceId, normalized],
    );
    if (Number(count?.count || 0) !== 1) continue;
    const extracted = await extractIndexText({
      mime: row.mime,
      filename: row.filename,
      content: row.content,
    });
    if (!mentionsFilename(String(extracted.text || "").toLowerCase(), normalized)) continue;
    await saveFileIndexGroup(db, {
      projectId,
      createdBy,
      groupId: row.id,
      automatic: true,
      title: `关联文件：${filename}`.slice(0, 160),
      evidence: `文件内容明确引用了项目内唯一匹配的文件名「${filename}」。`,
      evidenceKind: "reference",
      evidenceArtifactId: row.sourceId,
      evidenceVersionId: row.sourceVersionId,
      evidenceTargetVersionId: versionId,
      members: [
        { artifactId: row.sourceId, description: "包含文件引用" },
        { artifactId, description: "被引用的文件" },
      ],
    });
  }
}

export async function hydrateFileIndexGroups(db, projectId, pages) {
  if (!pages.length) return pages;
  const groups = await query(
    db,
    `SELECT g.page_id pageId,g.id,g.origin,g.manually_managed manuallyManaged,g.evidence FROM file_index_groups g
    WHERE g.project_id=? AND g.page_id IN (${pages.map(() => "?").join(",")})`,
    [projectId, ...pages.map((p) => p.id)],
  );
  if (!groups.length) return pages;
  const members = await query(
    db,
    `SELECT fm.group_id groupId,fm.description,p.title,fi.page_id pageId
    FROM file_index_group_members fm JOIN file_index_entries fi ON fi.artifact_id=fm.artifact_id AND fi.project_id=?
    JOIN wiki_pages p ON p.id=fi.page_id WHERE fm.group_id IN (${groups.map(() => "?").join(",")})
      AND ${visibleFileIndexSql("p")} ORDER BY p.title,p.id`,
    [projectId, ...groups.map((g) => g.id)],
  );
  const byPage = new Map(groups.map((g) => [g.pageId, g]));
  const escape = (value) =>
    String(value || "")
      .replace(/[\r\n]+/g, " ")
      .replace(/[\\`*_\[\]<>#]/g, "\\$&");
  return pages.map((page) => {
    const group = byPage.get(page.id);
    if (!group) return page;
    const origin =
      group.origin === "automatic"
        ? Number(group.manuallyManaged)
          ? "自动发现，已人工修正"
          : "自动发现"
        : "人工指定";
    const lines = ["## 关联依据", group.evidence, "", `- 来源：${origin}`, "", "## 关联文件"];
    for (const member of members.filter((m) => m.groupId === group.id))
      lines.push(
        `- [${escape(member.title)}](/memory-entry/${member.pageId})：${escape(member.description || "关联文件")}`,
      );
    return { ...page, body: lines.join("\n") };
  });
}

export async function dismissFileIndexGroup(db, { projectId, groupId, userId } = {}) {
  if (typeof db.getConnection === "function")
    return transaction(db, (conn) => dismissFileIndexGroup(conn, { projectId, groupId, userId }));
  const [group] = await query(
    db,
    "SELECT page_id pageId FROM file_index_groups WHERE project_id=? AND id=? FOR UPDATE",
    [projectId, groupId],
  );
  if (!group) throw new HttpError(404, "关联索引不存在");
  // Dismissing a navigation group does not grant humans authority to invalidate file memory.
  await query(
    db,
    "UPDATE file_index_groups SET manually_managed=TRUE,dismissed_at=UTC_TIMESTAMP(3) WHERE id=?",
    [groupId],
  );
  return { groupId, pageId: group.pageId };
}

/** Explicit repair view: do not expose deleted file contents or stale evidence. */
export async function listFileIndexGroupsNeedingRepair(db, projectId) {
  const groups = await query(
    db,
    `SELECT g.id,g.page_id pageId,g.origin,p.title
    FROM file_index_groups g JOIN wiki_pages p ON p.id=g.page_id
    WHERE g.project_id=? AND g.dismissed_at IS NULL AND p.status='current' AND NOT ${visibleFileIndexSql("p")}
    ORDER BY g.updated_at DESC,g.id`,
    [projectId],
  );
  if (!groups.length) return [];
  const members = await query(
    db,
    `SELECT fm.group_id groupId,fm.artifact_id artifactId,fm.description
    FROM file_index_group_members fm JOIN file_index_groups g ON g.id=fm.group_id
    JOIN file_index_entries fi ON fi.project_id=g.project_id AND fi.artifact_id=fm.artifact_id
    JOIN wiki_pages p ON p.id=fi.page_id
    WHERE g.project_id=? AND fm.group_id IN (${groups.map(() => "?").join(",")})
      AND p.status='current' AND ${visibleFileIndexSql("p")}`,
    [projectId, ...groups.map((group) => group.id)],
  );
  return groups.map((group) => ({
    id: group.pageId,
    title: group.title,
    subject: "document",
    status: "current",
    body: "部分关联文件或关联依据已不可用。请重新选择可用文件并填写依据。",
    fileGroup: {
      id: group.id,
      origin: group.origin,
      evidence: "",
      members: members.filter((member) => member.groupId === group.id),
    },
  }));
}
