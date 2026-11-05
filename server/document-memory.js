import { createHash, randomUUID } from "node:crypto";
import JSZip from "jszip";
import sharp from "sharp";
import { query, transaction } from "./db.ts";
import { DEFAULT_MEMORY_SUBTYPES } from "../shared/memory-taxonomy.js";
import { renderFileIndex } from "./file-index-format.js";
import { ensureFileIndexRoots } from "./file-index-roots.js";
import { fileIndexFolderPath } from "./file-index-path.js";

const KIND_LABEL = { code: "代码", image: "图片", archive: "压缩包", text: "文本", other: "文件" };

/** 按 MIME 与扩展名判断文档种类，供文档记忆写「怎么读」。 */
export function documentKindOf(mime, filename) {
  const type = String(mime || "").toLowerCase();
  const name = String(filename || "").toLowerCase();
  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/.test(name)) return "image";
  if (
    /(zip|tar|gzip|7z|rar|compressed|x-zip)/.test(type) ||
    /\.(zip|tar|gz|tgz|7z|rar|bz2|xz)$/.test(name)
  )
    return "archive";
  if (
    /(javascript|typescript|java|python|rust|golang|x-sh|x-c|json|yaml|xml|sql)/.test(type) ||
    /\.(js|mjs|cjs|ts|tsx|jsx|java|py|rs|go|c|cc|cpp|h|hpp|sh|ps1|json|yml|yaml|xml|sql|css|html)$/.test(
      name,
    )
  )
    return "code";
  if (
    /^(text\/|application\/pdf|application\/msword|application\/vnd\.|markdown)/.test(type) ||
    /\.(md|txt|docx?|xlsx?|pptx?|pdf|csv)$/.test(name)
  )
    return "text";
  return "other";
}

export function documentKindLabel(kind) {
  return KIND_LABEL[kind] || KIND_LABEL.other;
}

function formatSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "大小未知";
  if (value < 1024) return value + " B";
  if (value < 1024 * 1024) return Math.round(value / 1024) + " KB";
  return (value / 1024 / 1024).toFixed(1) + " MB";
}

/**
 * 能确定性解析的内容直接解析：zip 列文件清单，图片记尺寸与格式。
 * 解析失败不抛错，交给正文里的「清单待补」兜底。
 */
export async function describeContent({ mime, filename, content } = {}) {
  if (!content || !content.length) return null;
  const kind = documentKindOf(mime, filename);
  try {
    if (kind === "archive" && (/zip/i.test(mime || "") || /\.zip$/i.test(filename || ""))) {
      const zip = await JSZip.loadAsync(content);
      const files = Object.values(zip.files).filter((entry) => !entry.dir);
      const names = files.map((entry) => entry.name).filter(Boolean);
      const top = [...new Set(names.map((name) => name.split("/").filter(Boolean)[0]))]
        .filter(Boolean)
        .slice(0, 30);
      return {
        type: "zip",
        count: files.length,
        top,
        sample: names.slice(0, 40),
      };
    }
    if (kind === "image") {
      const meta = await sharp(content).metadata();
      return {
        type: "image",
        width: meta.width || 0,
        height: meta.height || 0,
        format: meta.format || "",
      };
    }
  } catch {
    return { type: "unreadable" };
  }
  return null;
}

const READ_HINT = {
  text: "可直接读正文；需要原文再按版本打开。",
  image: "图片：先看尺寸与画面摘要，需要原图再打开。",
  archive: "压缩包：先看清单与入口文件，按需解压，不整包读取。",
  code: "代码：先看入口与目录结构，按模块按需读取。",
  other: "二进制：要先知道它是什么，再决定是否打开。",
};

/** 单文档记忆正文：是什么、关键版本、变更要点、何时该看。 */
export function documentMemoryMarkdown({
  title,
  kind,
  filename,
  version,
  sha256,
  byteSize,
  note,
  summary,
  mime,
  path,
  extractedText,
  recognitionStatus,
  recognitionNote,
  listing = null,
} = {}) {
  const label = documentKindLabel(kind);
  const lines = [
    renderFileIndex({
      title,
      filename,
      mime,
      path,
      version,
      summary,
      extractedText,
      status: recognitionStatus || (summary ? "partial" : "unrecognized"),
      reason:
        recognitionNote ||
        (summary ? "摘要未声明完整识别范围，请按出处核对原文件。" : "尚无经内容分析的摘要。"),
    }),
    "",
    "## 是什么",
    label + "文件《" + (filename || title || "未命名") + "》 · " + formatSize(byteSize),
    "",
    "## 关键版本",
    "v" + Number(version || 0) + (sha256 ? " · sha256 " + String(sha256).slice(0, 12) : ""),
    "",
    "## 变更要点",
    String(note || "").trim() || "- 等待老翁整理摘要",
    "",
    "## 何时该看",
    "- " + (READ_HINT[kind] || READ_HINT.other),
  ];
  if (listing?.type === "zip") {
    lines.push("", "## 清单", "- 共 " + listing.count + " 个文件");
    if (listing.top.length) lines.push("- 顶层：" + listing.top.join("、"));
    if (listing.sample.length)
      lines.push(
        "- 文件：" + listing.sample.slice(0, 20).join("、") + (listing.count > 20 ? " …" : ""),
      );
  } else if (listing?.type === "image") {
    lines.push(
      "",
      "## 清单",
      "- 尺寸：" + listing.width + "×" + listing.height + " · 格式：" + (listing.format || "未知"),
    );
  } else if (listing?.type === "unreadable") {
    lines.push("", "## 清单", "- 内容无法直接解析，需要时再解压或打开查看。");
  }
  return lines.join("\n");
}

/** 文档组记忆正文：是什么、包含、入口、何时该看。 */
export function documentGroupMarkdown({ folderName, members = [] } = {}) {
  const list = members.length
    ? members
        .map(
          (member) =>
            "- " +
            (member.title || member.filename || "未命名") +
            "（" +
            (member.kindLabel || "文件") +
            (member.version ? " · v" + member.version : "") +
            "）",
        )
        .join("\n")
    : "- 暂无成员";
  const entry = members[0];
  return [
    "## 是什么",
    "「" + (folderName || "文档组") + "」下的文档组，共 " + members.length + " 个文件。",
    "",
    "## 共享摘要",
    "这些文件共同构成「" +
      (folderName || "文档组") +
      "」的正式资料集合；先结合下面的文件清单判断每份文件的职责，再按入口文件顺序阅读。",
    "",
    "## 包含",
    list,
    "",
    "## 入口",
    entry ? "- 先从《" + (entry.title || entry.filename || "未命名") + "》看起" : "- 暂无",
    "",
    "## 何时该看",
    "- 找某一类文件时先看这组清单，不必逐个打开。",
  ].join("\n");
}

function filePageId(projectId, artifactId) {
  const hash = createHash("sha256")
    .update(`cothread:file-index:${projectId}:${artifactId}`)
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

async function upsertPage(
  db,
  projectId,
  { title, body, createdBy, artifactId, versionId, recognitionStatus, sources = [] },
) {
  const clean = String(title || "")
    .trim()
    .slice(0, 160);
  if (!clean) return null;
  const [registered] = await query(
    db,
    "SELECT page_id id,indexed_version_id versionId,indexed_content_sha256 contentHash FROM file_index_entries WHERE project_id=? AND artifact_id=? FOR UPDATE",
    [projectId, artifactId],
  );
  const [existing] = registered
    ? [registered]
    : await query(
        db,
        `SELECT DISTINCT p.id FROM wiki_pages p
     JOIN wiki_page_sources s ON s.page_id=p.id AND s.source_kind='document_version'
     JOIN versions v ON v.id=s.source_id
     WHERE p.project_id=? AND p.subject_type='document' AND p.status<>'superseded' AND v.artifact_id=?
       AND NOT EXISTS (SELECT 1 FROM wiki_page_sources other_source JOIN versions other_version
         ON other_source.source_kind='document_version' AND other_version.id=other_source.source_id
         WHERE other_source.page_id=p.id AND other_version.artifact_id<>?)
       AND NOT EXISTS (SELECT 1 FROM file_index_entries other_index
         WHERE other_index.page_id=p.id AND other_index.artifact_id<>?)
     ORDER BY p.id LIMIT 1`,
        [projectId, artifactId, artifactId, artifactId],
      );
  const { captureDocumentRevision, recordMemoryEvidence } = await import("./memory-history.js");
  const [version] = await query(db, "SELECT sha256,mime FROM versions WHERE id=?", [versionId]);
  if (!version) return null;
  const contentHash = createHash("sha256")
    .update(version.sha256 + ":" + version.mime)
    .digest("hex");
  const changed =
    !!registered && (registered.versionId !== versionId || registered.contentHash !== contentHash);
  const pageId = changed
    ? filePageId(projectId, artifactId + ":" + versionId + ":" + contentHash)
    : existing?.id || filePageId(projectId, artifactId);
  const text = String(body || "").slice(0, 20000);
  const contentRevisionId = await captureDocumentRevision(db, projectId, versionId);
  await query(
    db,
    "INSERT INTO wiki_pages(id,project_id,subject_type,memory_subtype,title,body,status,created_by,updated_by,source_family) VALUES(?,?,'document',?,?,?,'current',?,?,'project_file') ON DUPLICATE KEY UPDATE id=id",
    [pageId, projectId, DEFAULT_MEMORY_SUBTYPES.document, clean, text, createdBy, createdBy],
  );
  if (changed) {
    const { assertCanSupersedeMemory } = await import("./memory-policy.js");
    assertCanSupersedeMemory({ sourceFamily: "project_file", automatedFileMaintenance: true });
    await query(db, "UPDATE wiki_pages SET status='superseded' WHERE id=?", [registered.id]);
    const { createMemoryRelation } = await import("./memory-graph.js");
    await createMemoryRelation(db, {
      projectId,
      fromPageId: pageId,
      toPageId: registered.id,
      relation: "supersedes",
      note: "文件内容修订自动替代",
      createdBy,
    });
  }
  await query(
    db,
    "INSERT INTO file_index_entries(project_id,artifact_id,page_id,indexed_version_id,recognition_status,indexed_content_sha256,content_revision_id) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE page_id=VALUES(page_id),indexed_version_id=VALUES(indexed_version_id),indexed_content_sha256=VALUES(indexed_content_sha256),content_revision_id=VALUES(content_revision_id)",
    [projectId, artifactId, pageId, versionId, recognitionStatus, contentHash, contentRevisionId],
  );
  if (changed || !registered)
    await recordMemoryEvidence(db, {
      projectId,
      pageId,
      sourceFamily: "project_file",
      sourceKind: "document_version",
      sourceId: versionId,
      sourceRevision: contentRevisionId,
      evidence: { artifactId, versionId, contentHash, contentRevisionId },
    });
  if (changed) {
    await query(
      db,
      "UPDATE file_index_entries SET topics=NULL,extracted_text=NULL,recognition_note=NULL WHERE project_id=? AND artifact_id=?",
      [projectId, artifactId],
    );
  }
  await query(
    db,
    "UPDATE wiki_pages SET title=?,body=?,status='current',source_family='project_file',updated_by=? WHERE id=?",
    [clean, text, createdBy, pageId],
  );
  await query(
    db,
    "UPDATE file_index_entries SET recognition_status=? WHERE project_id=? AND artifact_id=?",
    [recognitionStatus, projectId, artifactId],
  );
  for (const source of sources) {
    if (!source?.id) continue;
    const kind = source.kind || "document_version";
    const [dup] = await query(
      db,
      "SELECT id FROM wiki_page_sources WHERE page_id=? AND source_kind=? AND source_id=? LIMIT 1",
      [pageId, kind, source.id],
    );
    if (dup) continue;
    await query(
      db,
      "INSERT INTO wiki_page_sources(id,page_id,source_kind,source_id,label) VALUES(?,?,?,?,?)",
      [randomUUID(), pageId, kind, source.id, String(source.label || "").slice(0, 240)],
    );
  }
  const { captureMemoryRevision } = await import("./memory-history.js");
  await captureMemoryRevision(
    db,
    { id: pageId, title: clean, body: text, status: "current" },
    { captureKind: "file_index_snapshot" },
  );
  return pageId;
}

/**
 * 同步单文件记忆：按文件身份而非标题匹配。同目录不代表文件有关联。
 */
export async function syncDocumentMemory(db, { projectId, artifactId, versionId, createdBy } = {}) {
  if (!projectId || !artifactId || !versionId) return null;
  if (typeof db.getConnection === "function") {
    return transaction(db, (conn) =>
      syncDocumentMemory(conn, { projectId, artifactId, versionId, createdBy }),
    );
  }
  // Serialize updates for the same artifact before reading its current version,
  // summary and recognition data. Otherwise a slower first pass can overwrite
  // an OCR result written by a concurrent pass for the same version.
  const [artifact] = await query(
    db,
    "SELECT id FROM artifacts WHERE id=? AND project_id=? FOR UPDATE",
    [artifactId, projectId],
  );
  if (!artifact) return null;
  const [row] = await query(
    db,
    `SELECT a.id,a.title,a.folder_id folderId,f.name folderName,
       v.id versionId,v.filename,v.mime,v.version,v.sha256,v.byte_size byteSize,v.note,v.content,
       s.summary summary,fi.recognition_status recognitionStatus,fi.extracted_text extractedText,fi.recognition_note recognitionNote
     FROM artifacts a
     JOIN versions v ON v.id=? AND v.artifact_id=a.id
     LEFT JOIN agent_document_summaries s ON s.version_id=v.id
     LEFT JOIN file_index_entries fi ON fi.project_id=a.project_id AND fi.artifact_id=a.id AND fi.indexed_version_id=v.id
     LEFT JOIN document_folders f ON f.id=a.folder_id
     WHERE a.id=? AND a.project_id=? AND a.deleted_at IS NULL AND a.purged_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM version_recycle current_recycle WHERE current_recycle.version_id=v.id)
       AND NOT EXISTS (
         SELECT 1 FROM versions newer LEFT JOIN version_recycle recycled ON recycled.version_id=newer.id
         WHERE newer.artifact_id=a.id AND newer.version>v.version AND recycled.version_id IS NULL
       ) FOR UPDATE`,
    [versionId, artifactId, projectId],
  );
  if (!row) return null;
  const kind = documentKindOf(row.mime, row.filename);
  const path = await fileIndexFolderPath(db, projectId, row.folderId);
  const listing =
    Number(row.byteSize) > 0 && Number(row.byteSize) <= 8 * 1024 * 1024
      ? await describeContent({
          mime: row.mime,
          filename: row.filename,
          content: row.content,
        })
      : null;
  // 数据库仍存四种识别状态；索引页对“还没有结论”的文件显示等待识别，
  // 避免把尚未处理写成暂不支持。
  const dbRecognitionStatus = row.recognitionStatus || (row.summary ? "partial" : "unrecognized");
  const shownRecognitionStatus =
    dbRecognitionStatus === "unrecognized" && !row.summary && !row.recognitionNote
      ? "pending"
      : dbRecognitionStatus;
  const pageId = await upsertPage(db, projectId, {
    title: row.title || row.filename,
    artifactId,
    versionId,
    recognitionStatus: dbRecognitionStatus,
    body: documentMemoryMarkdown({
      title: row.title,
      kind,
      filename: row.filename,
      version: row.version,
      sha256: row.sha256,
      byteSize: row.byteSize,
      note: row.summary ? String(row.summary).slice(0, 2000) : String(row.note || "").trim(),
      summary: row.summary || "",
      mime: row.mime,
      path,
      extractedText: row.extractedText,
      recognitionStatus: shownRecognitionStatus,
      recognitionNote: row.recognitionNote,
      listing,
    }),
    createdBy,
    sources: [{ kind: "document_version", id: versionId, label: row.filename }],
  });
  if (pageId && row.summary) {
    const { refreshDocumentSummaryCache } = await import("./memory-cache.js");
    await refreshDocumentSummaryCache(db, projectId, versionId).catch(() => {});
  }
  if (pageId) await ensureFileIndexRoots(db, projectId, createdBy);
  if (pageId && createdBy) {
    const { discoverLinkedFileGroup, recheckGroupsForTarget, discoverWaitingFileReferences } =
      await import("./file-index-groups.js");
    await discoverLinkedFileGroup(db, { projectId, artifactId, createdBy });
    await recheckGroupsForTarget(db, { projectId, artifactId, versionId, createdBy });
    await discoverWaitingFileReferences(db, { projectId, artifactId, versionId, createdBy });
  }
  return { pageId, groupId: null, kind };
}

/** Rebuild after a version is recycled/restored or the artifact is moved/renamed. */
export async function syncCurrentDocumentMemory(db, { projectId, artifactId, createdBy } = {}) {
  const [row] = await query(
    db,
    `SELECT v.id FROM versions v
    JOIN artifacts a ON a.id=v.artifact_id
    LEFT JOIN version_recycle r ON r.version_id=v.id
    WHERE a.id=? AND a.project_id=? AND a.deleted_at IS NULL AND a.purged_at IS NULL
      AND r.version_id IS NULL ORDER BY v.version DESC,v.created_at DESC,v.id DESC LIMIT 1`,
    [artifactId, projectId],
  );
  if (!row) return null;
  return syncDocumentMemory(db, { projectId, artifactId, versionId: row.id, createdBy });
}
