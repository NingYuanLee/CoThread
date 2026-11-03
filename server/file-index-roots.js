import { createHash } from "node:crypto";
import { query } from "./db.js";
import { folderRootKindInList } from "./documents/index.js";
import { visibleFileIndexSql } from "./file-index-visibility.js";

const ROOTS = {
  project_official: [
    "正式文件索引",
    "按主题查找正式资料；是否适用及替代关系以文件内容和明确记录为准。",
  ],
  project_cache: ["对话缓存索引", "按主题查找对话中的过程材料，不自动视作已确认的结论。"],
  project_outputs: ["沙箱产物索引", "按主题查找任务产物；产物不自动等同于已确认的正式文件。"],
  project_miniprogram: ["小程序文件索引", "区分小程序源文件、Web 产物、PC 管理后台和云函数。"],
};

function rootPageId(projectId, kind) {
  const hash = createHash("sha256")
    .update(`cothread:file-index-root:${projectId}:${kind}`)
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-b${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/** Called inside the file-index transaction; stable IDs make concurrent creation idempotent. */
export async function ensureFileIndexRoots(db, projectId, createdBy) {
  if (!createdBy) return;
  for (const [kind, [title, introduction]] of Object.entries(ROOTS)) {
    const id = rootPageId(projectId, kind);
    await query(
      db,
      `INSERT INTO wiki_pages(id,project_id,subject_type,memory_subtype,title,body,status,created_by,updated_by)
      VALUES(?,?,'document','reference_material',?,?,'current',?,?) ON DUPLICATE KEY UPDATE id=id`,
      [
        id,
        projectId,
        title,
        `## 用途\n${introduction}\n\n## 文件入口\n目录按当前可访问文件动态生成。`,
        createdBy,
        createdBy,
      ],
    );
    await query(
      db,
      `INSERT INTO file_index_roots(project_id,root_kind,page_id) VALUES(?,?,?)
      ON DUPLICATE KEY UPDATE page_id=page_id`,
      [projectId, kind, id],
    );
  }
}

function parseTopics(value) {
  try {
    const topics = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(topics)
      ? topics
          .filter((t) => typeof t === "string" && t.trim())
          .map((t) => t.trim().slice(0, 60))
          .slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

function miniprogramSection(folderId, folders) {
  const labels = {
    miniprogram_source: "小程序源文件",
    miniprogram_web: "小程序 Web 产物",
    miniprogram_admin: "PC 管理后台",
    miniprogram_server: "云函数",
  };
  let node = folders.find((folder) => folder.id === folderId);
  const seen = new Set();
  while (node && !seen.has(node.id)) {
    if (labels[node.folder_kind]) return labels[node.folder_kind];
    seen.add(node.id);
    node = folders.find((folder) => folder.id === node.parent_id);
  }
  return "其他小程序文件";
}

function plainText(value) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[\\`*_\[\]<>#]/g, "\\$&");
}

/** Root Markdown is assembled at read time so deleted or replaced files never persist in its body. */
export async function hydrateFileIndexRoots(db, projectId, pages) {
  if (!pages.length) return pages;
  const roots = await query(
    db,
    `SELECT page_id pageId,root_kind rootKind FROM file_index_roots
    WHERE project_id=? AND page_id IN (${pages.map(() => "?").join(",")})`,
    [projectId, ...pages.map((p) => p.id)],
  );
  if (!roots.length) return pages;
  const folders = await query(
    db,
    "SELECT id,parent_id,folder_kind FROM document_folders WHERE project_id=?",
    [projectId],
  );
  const files = await query(
    db,
    `SELECT fi.page_id pageId,fi.topics,a.folder_id folderId,p.title,v.mime,v.filename
    FROM file_index_entries fi JOIN wiki_pages p ON p.id=fi.page_id
    JOIN artifacts a ON a.id=fi.artifact_id AND a.project_id=fi.project_id
    JOIN versions v ON v.id=fi.indexed_version_id
    WHERE fi.project_id=? AND p.status='current' AND ${visibleFileIndexSql("p")}
    ORDER BY p.title,p.id LIMIT 5001`,
    [projectId],
  );
  const groups = await query(
    db,
    `SELECT DISTINCT p.id,p.title,a.folder_id folderId
    FROM file_index_groups g JOIN wiki_pages p ON p.id=g.page_id
    JOIN file_index_group_members gm ON gm.group_id=g.id
    JOIN artifacts a ON a.id=gm.artifact_id AND a.project_id=g.project_id
    WHERE g.project_id=? AND p.status='current' AND ${visibleFileIndexSql("p")}
    ORDER BY p.title,p.id`,
    [projectId],
  );
  const rootByPage = new Map(roots.map((root) => [root.pageId, root.rootKind]));
  return pages.map((page) => {
    const kind = rootByPage.get(page.id);
    if (!kind) return page;
    const grouped = new Map();
    for (const file of files) {
      if (folderRootKindInList(file.folderId, folders) !== kind) continue;
      const topics = parseTopics(file.topics);
      for (const topic of topics.length ? topics : ["待整理主题"]) {
        const key =
          kind === "project_miniprogram"
            ? `${miniprogramSection(file.folderId, folders)} / ${topic}`
            : topic;
        const group = grouped.get(key) || [];
        group.push(file);
        grouped.set(key, group);
      }
    }
    const lines = [`## 用途`, ROOTS[kind][1], "", "## 主题导航"];
    let remaining = 200;
    let omitted = 0;
    for (const [topic, members] of grouped) {
      const visible = members.slice(0, Math.min(100, remaining));
      omitted += members.length - visible.length;
      if (!visible.length) continue;
      lines.push("", `### ${plainText(topic)}`);
      for (const file of visible)
        lines.push(
          `- [${plainText(file.title)}](/memory-entry/${file.pageId})（${plainText(file.mime || "类型未知")}）`,
        );
      remaining -= visible.length;
    }
    if (!grouped.size) lines.push("- 当前没有可访问的文件索引。");
    if (omitted || files.length > 5000)
      lines.push("", "部分文件未在导航中展开，请按主题或文件名搜索。");
    const associated = new Map();
    for (const group of groups) {
      if (folderRootKindInList(group.folderId, folders) === kind) associated.set(group.id, group);
    }
    if (associated.size) {
      lines.push("", "## 相关文件组合");
      for (const group of [...associated.values()].slice(0, 100))
        lines.push(`- [${plainText(group.title)}](/memory-entry/${group.id})`);
      if (associated.size > 100) lines.push(`- 另有 ${associated.size - 100} 组，请按主题搜索。`);
    }
    return { ...page, body: lines.join("\n") };
  });
}
