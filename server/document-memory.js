import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import sharp from "sharp";
import { query } from "./db.js";
import { createMemoryRelation } from "./memory-graph.js";
import { DEFAULT_MEMORY_SUBTYPES } from "../shared/memory-taxonomy.js";

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
  listing = null,
} = {}) {
  const label = documentKindLabel(kind);
  const lines = [
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

async function upsertPage(db, projectId, { title, body, createdBy, sources = [] }) {
  const clean = String(title || "")
    .trim()
    .slice(0, 160);
  if (!clean) return null;
  const [existing] = await query(
    db,
    `SELECT id FROM wiki_pages
     WHERE project_id=? AND subject_type='document' AND status<>'superseded' AND title=?
     ORDER BY updated_at DESC LIMIT 1`,
    [projectId, clean],
  );
  const pageId = existing?.id || randomUUID();
  const text = String(body || "").slice(0, 20000);
  if (existing) {
    await query(db, "UPDATE wiki_pages SET body=?,updated_by=? WHERE id=?", [
      text,
      createdBy,
      pageId,
    ]);
  } else {
    await query(
      db,
      `INSERT INTO wiki_pages(id,project_id,subject_type,memory_subtype,title,body,status,created_by,updated_by)
       VALUES(?,?,'document',?,?,?,'current',?,?)`,
      [pageId, projectId, DEFAULT_MEMORY_SUBTYPES.document, clean, text, createdBy, createdBy],
    );
  }
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
  return pageId;
}

/**
 * 正式文件新版本落库后同步文档记忆：
 * 一句话说明是什么、怎么读，并把所在文件夹聚成「文档组」记忆，组与成员用 relates 相连。
 */
export async function syncDocumentMemory(db, { projectId, artifactId, versionId, createdBy } = {}) {
  if (!projectId || !artifactId || !versionId) return null;
  const [row] = await query(
    db,
    `SELECT a.id,a.title,a.folder_id folderId,f.name folderName,
       v.id versionId,v.filename,v.mime,v.version,v.sha256,v.byte_size byteSize,v.note,v.content,
       s.summary summary
     FROM artifacts a
     JOIN versions v ON v.id=?
     LEFT JOIN agent_document_summaries s ON s.version_id=v.id
     LEFT JOIN document_folders f ON f.id=a.folder_id
     WHERE a.id=? AND a.project_id=?`,
    [versionId, artifactId, projectId],
  );
  if (!row) return null;
  const kind = documentKindOf(row.mime, row.filename);
  const listing =
    Number(row.byteSize) > 0 && Number(row.byteSize) <= 8 * 1024 * 1024
      ? await describeContent({
          mime: row.mime,
          filename: row.filename,
          content: row.content,
        })
      : null;
  const pageId = await upsertPage(db, projectId, {
    title: row.title || row.filename,
    body: documentMemoryMarkdown({
      title: row.title,
      kind,
      filename: row.filename,
      version: row.version,
      sha256: row.sha256,
      byteSize: row.byteSize,
      note:
        String(row.note || "").trim() ||
        (row.summary ? "老翁摘要：" + String(row.summary).slice(0, 600) : ""),
      listing,
    }),
    createdBy,
    sources: [{ kind: "document_version", id: versionId, label: row.filename }],
  });
  let groupId = null;
  if (row.folderId && row.folderName) {
    const members = await query(
      db,
      `SELECT a.title,v.version,v.mime,v.filename FROM artifacts a
       LEFT JOIN versions v ON v.id=(
         SELECT id FROM versions WHERE artifact_id=a.id ORDER BY version DESC LIMIT 1
       )
       WHERE a.folder_id=? AND a.deleted_at IS NULL ORDER BY a.title LIMIT 100`,
      [row.folderId],
    );
    groupId = await upsertPage(db, projectId, {
      title: "文档组：" + row.folderName,
      body: documentGroupMarkdown({
        folderName: row.folderName,
        members: members.map((member) => ({
          title: member.title,
          filename: member.filename,
          version: Number(member.version || 0),
          kindLabel: documentKindLabel(documentKindOf(member.mime, member.filename)),
        })),
      }),
      createdBy,
    });
    if (groupId)
      await createMemoryRelation(db, {
        projectId,
        fromPageId: groupId,
        toPageId: pageId,
        relation: "relates",
        note: "文档组包含",
        createdBy,
      });
  }
  const { refreshDocumentSummaryCache } = await import("./memory-cache.js");
  await refreshDocumentSummaryCache(db, projectId, versionId).catch(() => {});
  return { pageId, groupId, kind };
}
