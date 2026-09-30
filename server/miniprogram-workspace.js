import { createHash, randomUUID } from "node:crypto";
import { query } from "./db.js";
import { HttpError } from "./service.js";
import { MINIPROGRAM_FIXED_FOLDERS, MINIPROGRAM_FOLDER_KINDS } from "./project-library.js";

export const MINIPROGRAM_ROOT_KIND = "project_miniprogram";
export { MINIPROGRAM_FIXED_FOLDERS, MINIPROGRAM_FOLDER_KINDS };

/** Display order of the four fixed subfolders, keyed by folder_kind. */
export const MINIPROGRAM_AREA_KINDS = MINIPROGRAM_FOLDER_KINDS;

export function isMiniprogramFixedFolderRow(row) {
  return Boolean(row) && MINIPROGRAM_FOLDER_KINDS.includes(row.folder_kind);
}

function systemKeyFor(kind, projectId) {
  return `project:${projectId}:${kind}`;
}

/**
 * Lazily create the miniprogram workspace root and its four fixed subfolders.
 * Idempotent; safe to call on every read/write path. Existing projects are not
 * migrated in bulk — the workspace only appears once a project uses it.
 */
export async function ensureMiniprogramWorkspace(db, projectId) {
  let [root] = await query(
    db,
    "SELECT id FROM document_folders WHERE project_id=? AND folder_kind=? AND parent_id IS NULL LIMIT 1",
    [projectId, MINIPROGRAM_ROOT_KIND],
  );
  if (!root) {
    const id = randomUUID();
    await query(
      db,
      `INSERT INTO document_folders(id,project_id,name,system_key,folder_kind)
       VALUES(?,?,?,?,?)`,
      [
        id,
        projectId,
        "小程序",
        systemKeyFor(MINIPROGRAM_ROOT_KIND, projectId),
        MINIPROGRAM_ROOT_KIND,
      ],
    );
    [root] = await query(
      db,
      "SELECT id FROM document_folders WHERE project_id=? AND folder_kind=? AND parent_id IS NULL LIMIT 1",
      [projectId, MINIPROGRAM_ROOT_KIND],
    );
  }
  for (const [name, , kind] of MINIPROGRAM_FIXED_FOLDERS) {
    const [existing] = await query(
      db,
      "SELECT id FROM document_folders WHERE project_id=? AND parent_id=? AND folder_kind=? LIMIT 1",
      [projectId, root.id, kind],
    );
    if (existing) continue;
    await query(
      db,
      `INSERT INTO document_folders(id,project_id,parent_id,name,system_key,folder_kind)
       VALUES(?,?,?,?,?,?)`,
      [randomUUID(), projectId, root.id, name, systemKeyFor(kind, projectId), kind],
    );
  }
  return root.id;
}

/** Resolve the workspace root and fixed subfolders. Returns nulls when absent. */
export async function miniprogramWorkspaceFolders(db, projectId) {
  const [root] = await query(
    db,
    "SELECT id,name,folder_kind,parent_id FROM document_folders WHERE project_id=? AND folder_kind=? AND parent_id IS NULL LIMIT 1",
    [projectId, MINIPROGRAM_ROOT_KIND],
  );
  const byKind = new Map();
  if (!root) return { rootId: null, root: null, byKind };
  const rows = await query(
    db,
    "SELECT id,name,folder_kind,parent_id FROM document_folders WHERE project_id=? AND parent_id=?",
    [projectId, root.id],
  );
  for (const row of rows) {
    if (row.folder_kind && !byKind.has(row.folder_kind)) byKind.set(row.folder_kind, row);
  }
  return { rootId: root.id, root, byKind };
}

/** All folders in the workspace subtree (root included). */
export async function miniprogramTree(db, projectId) {
  const { rootId, byKind } = await miniprogramWorkspaceFolders(db, projectId);
  if (!rootId) return { rootId: null, byKind, folders: [] };
  const folders = await query(
    db,
    `WITH RECURSIVE tree AS (
       SELECT id,parent_id,name,folder_kind FROM document_folders WHERE id=? AND project_id=?
       UNION ALL
       SELECT f.id,f.parent_id,f.name,f.folder_kind FROM document_folders f
       JOIN tree t ON f.parent_id=t.id WHERE f.project_id=?
     )
     SELECT id,parent_id,name,folder_kind FROM tree`,
    [rootId, projectId, projectId],
  );
  return { rootId, byKind, folders };
}

/**
 * Relative path of an artifact inside its fixed subfolder, e.g. "pages/index/index.wxml".
 * Folder names become path segments; the fixed subfolder itself is the area root.
 */
export function miniprogramRelativePath(artifactFolderId, filename, folders, areaFolderId) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const segments = [];
  let current = byId.get(artifactFolderId);
  const seen = new Set();
  while (current && current.id !== areaFolderId && !seen.has(current.id)) {
    seen.add(current.id);
    segments.unshift(current.name || current.id);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  segments.push(filename);
  return segments.filter(Boolean).join("/");
}

export function computeMiniprogramSourceHash(files) {
  const hash = createHash("sha256");
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(file.sha256 || "");
    hash.update("\n");
  }
  return hash.digest("hex");
}

/**
 * Current effective version of every file in the four fixed subfolders.
 * Immutable versions are used as-is; the newest version per artifact wins.
 */
export async function miniprogramSnapshot(db, projectId) {
  const { rootId, byKind, folders } = await miniprogramTree(db, projectId);
  const areas = {};
  for (const [, , kind] of MINIPROGRAM_FIXED_FOLDERS) {
    const folder = byKind.get(kind);
    areas[kind] = { folderId: folder?.id || null, files: [] };
  }
  if (!rootId) return { rootId: null, areas, files: [], sourceHash: null, workspaceHash: null };
  const folderIds = folders.map((folder) => folder.id);
  if (!folderIds.length) return { rootId, areas, files: [], sourceHash: null, workspaceHash: null };
  const placeholders = folderIds.map(() => "?").join(",");
  const rows = await query(
    db,
    `SELECT a.id artifact_id, a.title, a.folder_id, v.id version_id, v.filename, v.mime,
       v.sha256, v.byte_size, v.version
     FROM artifacts a
     JOIN versions v ON v.id=(
       SELECT v2.id FROM versions v2 WHERE v2.artifact_id=a.id
       ORDER BY v2.version DESC, v2.created_at DESC, v2.id DESC LIMIT 1)
     LEFT JOIN version_recycle vr ON vr.version_id=v.id
     WHERE a.project_id=? AND a.deleted_at IS NULL AND vr.version_id IS NULL
       AND a.folder_id IN (${placeholders})`,
    [projectId, ...folderIds],
  );
  const files = [];
  for (const row of rows) {
    const areaKind = areaKindForFolder(row.folder_id, folders, byKind);
    if (!areaKind) continue;
    const area = areas[areaKind];
    files.push({
      area: areaKind,
      path: miniprogramRelativePath(row.folder_id, row.filename, folders, area.folderId),
      artifactId: row.artifact_id,
      title: row.title,
      versionId: row.version_id,
      filename: row.filename,
      mime: row.mime,
      sha256: row.sha256,
      byteSize: Number(row.byte_size) || 0,
    });
  }
  for (const file of files) areas[file.area].files.push(file);
  for (const area of Object.values(areas)) {
    area.files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }
  return {
    rootId,
    areas,
    files,
    // Compiler inputs only: build caching must not be invalidated by the
    // compiled bundle that a build itself writes into miniprogram_web.
    sourceHash: computeMiniprogramSourceHash(areas.miniprogram_source?.files || []),
    workspaceHash: computeMiniprogramSourceHash(files),
  };
}

/** Folder kind of the fixed subfolder that contains the given folder. */
export function areaKindForFolder(folderId, folders, byKind) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  let current = byId.get(folderId);
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.folder_kind && MINIPROGRAM_FOLDER_KINDS.includes(current.folder_kind)) {
      return current.folder_kind;
    }
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return null;
}

/** Area folder ids keyed by folder_kind, for callers that need to write. */
export function miniprogramAreaFolderIds(byKind) {
  const ids = {};
  for (const [, , kind] of MINIPROGRAM_FIXED_FOLDERS) ids[kind] = byKind.get(kind)?.id || null;
  return ids;
}

export const MINIPROGRAM_MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Areas a caller may write source into through the workspace API. */
export const MINIPROGRAM_WRITABLE_AREAS = [
  "miniprogram_source",
  "miniprogram_admin",
  "miniprogram_server",
];

export function normalizeMiniprogramPath(value) {
  const normalized = String(value || "")
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .trim();
  if (!normalized) throw new HttpError(400, "请提供文件路径");
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new HttpError(400, `非法的小程序文件路径：${value}`);
  }
  if (segments.length > 24) throw new HttpError(400, "目录层级过深");
  return segments.join("/");
}

/**
 * Resolve (creating as needed) the folder chain for a relative path inside an
 * area, returning the parent folder id and the file name.
 */
async function resolvePathFolder(db, projectId, areaFolderId, segments) {
  let parentId = areaFolderId;
  for (const segment of segments.slice(0, -1)) {
    const [existing] = await query(
      db,
      "SELECT id FROM document_folders WHERE project_id=? AND parent_id=? AND name=? LIMIT 1",
      [projectId, parentId, segment],
    );
    if (existing) {
      parentId = existing.id;
      continue;
    }
    const id = randomUUID();
    await query(db, "INSERT INTO document_folders(id,project_id,parent_id,name) VALUES(?,?,?,?)", [
      id,
      projectId,
      parentId,
      segment,
    ]);
    parentId = id;
  }
  return { parentId, filename: segments[segments.length - 1] };
}

/**
 * Publish a source file into one of the writable miniprogram areas. Versions
 * are immutable: rewriting an existing path appends a new version instead of
 * mutating history, so the compiler can always rebuild any past snapshot.
 */
export async function publishMiniprogramSourceFile(db, actor, projectId, input) {
  const area = input.area || "miniprogram_source";
  if (!MINIPROGRAM_WRITABLE_AREAS.includes(area)) {
    throw new HttpError(400, `只能写入 ${MINIPROGRAM_WRITABLE_AREAS.join(" / ")} 目录`);
  }
  const relativePath = normalizeMiniprogramPath(input.path);
  const content = Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content || "");
  if (!content.length) throw new HttpError(400, "文件内容为空");
  if (content.length > MINIPROGRAM_MAX_FILE_BYTES) {
    throw new HttpError(
      413,
      `单个源文件超过 ${Math.round(MINIPROGRAM_MAX_FILE_BYTES / 1024 / 1024)} MiB 上限`,
    );
  }
  await ensureMiniprogramWorkspace(db, projectId);
  const { byKind } = await miniprogramWorkspaceFolders(db, projectId);
  const areaFolder = byKind.get(area);
  if (!areaFolder) throw new HttpError(409, `小程序目录缺失：${area}`);

  const { parentId, filename } = await resolvePathFolder(
    db,
    projectId,
    areaFolder.id,
    relativePath.split("/"),
  );

  // Append a version when the same file already exists in this folder.
  const [existing] = await query(
    db,
    `SELECT a.id artifact_id, v.version
     FROM artifacts a
     JOIN versions v ON v.id=(SELECT v2.id FROM versions v2 WHERE v2.artifact_id=a.id
       ORDER BY v2.version DESC, v2.created_at DESC, v2.id DESC LIMIT 1)
     LEFT JOIN version_recycle vr ON vr.version_id=v.id
     WHERE a.project_id=? AND a.folder_id=? AND a.deleted_at IS NULL AND vr.version_id IS NULL
       AND v.filename=?
     LIMIT 1`,
    [projectId, parentId, filename],
  );

  const sha256 = createHash("sha256").update(content).digest("hex");
  const mime = input.mime || guessSourceMime(filename);
  const versionId = randomUUID();

  if (existing) {
    await query(
      db,
      `INSERT INTO versions(id,artifact_id,thread_id,version,filename,mime,content,sha256,byte_size,note,created_by)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [
        versionId,
        existing.artifact_id,
        null,
        Number(existing.version) + 1,
        filename,
        mime,
        content,
        sha256,
        content.length,
        input.note || "",
        actor.id,
      ],
    );
    return {
      path: relativePath,
      area,
      artifactId: existing.artifact_id,
      versionId,
      version: Number(existing.version) + 1,
      sha256,
      byteSize: content.length,
      created: false,
    };
  }

  const artifactId = randomUUID();
  await query(
    db,
    "INSERT INTO artifacts(id,project_id,folder_id,title,created_by) VALUES(?,?,?,?,?)",
    [artifactId, projectId, parentId, filename, actor.id],
  );
  await query(
    db,
    `INSERT INTO versions(id,artifact_id,thread_id,version,filename,mime,content,sha256,byte_size,note,created_by)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    [
      versionId,
      artifactId,
      null,
      1,
      filename,
      mime,
      content,
      sha256,
      content.length,
      input.note || "",
      actor.id,
    ],
  );
  return {
    path: relativePath,
    area,
    artifactId,
    versionId,
    version: 1,
    sha256,
    byteSize: content.length,
    created: true,
  };
}

export function guessSourceMime(filename) {
  const ext = String(filename).split(".").pop()?.toLowerCase() || "";
  const table = {
    js: "text/javascript; charset=utf-8",
    ts: "text/typescript; charset=utf-8",
    mjs: "text/javascript; charset=utf-8",
    json: "application/json; charset=utf-8",
    wxml: "text/plain; charset=utf-8",
    wxss: "text/css; charset=utf-8",
    less: "text/less; charset=utf-8",
    scss: "text/scss; charset=utf-8",
    html: "text/html; charset=utf-8",
    css: "text/css; charset=utf-8",
    md: "text/markdown; charset=utf-8",
    txt: "text/plain; charset=utf-8",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
  };
  return table[ext] || "application/octet-stream";
}
