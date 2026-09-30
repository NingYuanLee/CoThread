import { posix as pathPosix } from "node:path";
import { query } from "./db.js";
import { previewConsoleProbeHtml } from "../shared/html-preview.mjs";
import { signPreviewTicket } from "../shared/preview-ticket.mjs";

function rewriteRootRelativeAssetUrls(html) {
  return html.replace(
    /(\s(?:href|src|action)=["'])\/([^"']+)(["'])/gi,
    (_, prefix, path, suffix) => `${prefix}${path}${suffix}`,
  );
}

function retargetPreviewNavigation(html) {
  return html
    .replace(/(\s)target\s*=\s*(["'])(_parent|_top)\2/gi, "$1target=$2_self$2")
    .replace(/(\s)target\s*=\s*(_parent|_top)(?=[\s>/])/gi, '$1target="_self"');
}

function previewBaseHref(versionId, assetPath = "", userId, ticket = "") {
  const dir = pathPosix.dirname(String(assetPath || "").replace(/\\/g, "/"));
  const prefix =
    !dir || dir === "."
      ? ""
      : `${dir.split("/").filter(Boolean).map(encodeURIComponent).join("/")}/`;
  const token = ticket || signPreviewTicket(userId, versionId);
  return `/api/versions/${versionId}/preview/${token}/${prefix}`;
}

function injectPreviewBase(html, baseHref, nonce = "") {
  const document = retargetPreviewNavigation(rewriteRootRelativeAssetUrls(html));
  const baseTag = `<base href="${baseHref}" target="_self">`;
  const probe = /data-cothread-preview-console/i.test(document)
    ? ""
    : previewConsoleProbeHtml(nonce);
  const headInject = `${baseTag}${probe}`;
  if (/<base\s/i.test(document)) return document.replace(/<base\s[^>]*>/i, headInject);
  if (/<head[\s>]/i.test(document))
    return document.replace(/<head(\s[^>]*)?>/i, `<head$1>${headInject}`);
  if (/<html[\s>]/i.test(document))
    return document.replace(/<html(\s[^>]*)?>/i, `<html$1><head>${headInject}</head>`);
  return `<!DOCTYPE html><html><head>${headInject}</head><body>${document}</body></html>`;
}

export function asPreviewHtml(content, versionId, assetPath = "", userId, ticket = "", nonce = "") {
  const html = Buffer.isBuffer(content) ? content.toString("utf8") : String(content ?? "");
  return Buffer.from(
    injectPreviewBase(html, previewBaseHref(versionId, assetPath, userId, ticket), nonce),
    "utf8",
  );
}

export async function previewAssetInFolder(db, folderId, filename) {
  if (!folderId || !filename) return null;
  const [row] = await query(
    db,
    `SELECT v.content, v.mime, v.filename FROM versions v
     JOIN artifacts a ON a.id = v.artifact_id
     WHERE a.folder_id = ? AND a.deleted_at IS NULL
       AND (v.filename = ? OR v.filename LIKE CONCAT('%/', ?))
     ORDER BY
       CASE WHEN v.filename = ? THEN 0 WHEN v.filename LIKE CONCAT('%/', ?) THEN 1 ELSE 2 END,
       v.version DESC
     LIMIT 1`,
    [folderId, filename, filename, filename, filename],
  );
  return row || null;
}

export async function walkPreviewSubfolders(db, projectId, startFolderId, segments) {
  let folderId = startFolderId;
  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") return null;
    const [child] = await query(
      db,
      `SELECT id FROM document_folders
       WHERE project_id=? AND parent_id=? AND name=?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [projectId, folderId, segment],
    );
    if (!child) return null;
    folderId = child.id;
  }
  return folderId;
}
