import { posix as pathPosix } from "node:path";
import { query } from "../db.ts";
import { previewConsoleProbeHtml } from "../../shared/html-preview.mjs";
import { signPreviewTicket } from "../../shared/preview-ticket.mjs";
import type { Db } from "../types.ts";

function rewriteRootRelativeAssetUrls(html: string): string {
  return html.replace(
    /(\s(?:href|src|action)=["'])\/([^"']+)(["'])/gi,
    (_, prefix: string, path: string, suffix: string) => `${prefix}${path}${suffix}`,
  );
}

function retargetPreviewNavigation(html: string): string {
  return html
    .replace(/(\s)target\s*=\s*(["'])(_parent|_top)\2/gi, "$1target=$2_self$2")
    .replace(/(\s)target\s*=\s*(_parent|_top)(?=[\s>/])/gi, '$1target="_self"');
}

function previewBaseHref(
  versionId: string,
  assetPath: string = "",
  userId?: string,
  ticket: string = "",
): string {
  const dir = pathPosix.dirname(String(assetPath || "").replace(/\\/g, "/"));
  const prefix =
    !dir || dir === "."
      ? ""
      : `${dir.split("/").filter(Boolean).map(encodeURIComponent).join("/")}/`;
  const token = ticket || signPreviewTicket(userId, versionId);
  return `/api/versions/${versionId}/preview/${token}/${prefix}`;
}

function injectPreviewBase(html: string, baseHref: string, nonce: string = ""): string {
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

export function asPreviewHtml(
  content: unknown,
  versionId: string,
  assetPath: string = "",
  userId?: string,
  ticket: string = "",
  nonce: string = "",
): Buffer {
  const html = Buffer.isBuffer(content) ? content.toString("utf8") : String(content ?? "");
  return Buffer.from(
    injectPreviewBase(html, previewBaseHref(versionId, assetPath, userId, ticket), nonce),
    "utf8",
  );
}

/** 文件夹里按名字找可预览的资产版本。 */
export async function previewAssetInFolder(
  db: Db,
  folderId: string | null | undefined,
  filename: string | null | undefined,
): Promise<Record<string, unknown> | null> {
  if (!folderId || !filename) return null;
  const [row] = await query<Record<string, unknown>>(
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

/** 按路径段逐层进入子文件夹；任何一段不存在即返回 null。 */
export async function walkPreviewSubfolders(
  db: Db,
  projectId: string,
  startFolderId: string,
  segments: string[],
): Promise<string | null> {
  let folderId = startFolderId;
  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") return null;
    const [child] = await query<{ id: string }>(
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
