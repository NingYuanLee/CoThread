/**
 * 预览派生文件的存储层（文档内核）。
 *
 * 旧版二进制 Office（如 WPS 把 `.doc` 存成 `.docx` 后缀）不能被 docx-preview 直接渲染，
 * 转换结果存在 `version_renditions`，由预览路由读取。此表属于文档库派生数据，按内核
 * 边界约定只能由本目录写入。
 *
 * 失效规则：行上记录 `source_sha256`。同一版本 ID 被原位替换内容时（仓库支持该路径），
 * 源哈希变化即视为过期，读取方不会使用旧派生文件，重新转换会重置记录。
 */
import { query } from "../db.js";
import type { Db } from "../types.ts";

/** `version_renditions` 的一行。`content` 只在带 `withContent` 查询时存在。 */
export type RenditionRow = {
  version_id: string;
  kind: string;
  status: "pending" | "ready" | "failed";
  source_sha256: string;
  sha256: string | null;
  byte_size: number | null;
  filename: string | null;
  mime: string | null;
  error: string;
  attempts: number;
  content?: Buffer;
};

export const RENDITION_KINDS = new Set(["docx", "xlsx", "pptx"]);

/** 同一版本自动转换失败的最大尝试次数，超过后等人工重新触发。 */
export const RENDITION_MAX_ATTEMPTS = 3;

const RENDITION_COLUMNS =
  "version_id,kind,status,source_sha256,sha256,byte_size,filename,mime,error,attempts";

/** 读取派生记录；`withContent` 为真时一并取出字节。 */
export async function getRendition(
  db: Db,
  versionId: string,
  { withContent = false }: { withContent?: boolean } = {},
): Promise<RenditionRow | null> {
  const [row] = await query(
    db,
    `SELECT ${RENDITION_COLUMNS}${withContent ? ",content" : ""}
     FROM version_renditions WHERE version_id=?`,
    [versionId],
  );
  return row || null;
}

/**
 * 声明一次转换：没有记录时插入 pending，已有记录时累计尝试次数。
 * 源哈希变化会清空旧产物并重置状态。返回更新后的记录。
 */
export async function claimRendition(
  db: Db,
  {
    versionId,
    kind,
    sourceSha256,
    filename,
    mime,
  }: {
    versionId: string;
    kind: string;
    sourceSha256: string;
    filename: string;
    mime: string;
  },
): Promise<RenditionRow | null> {
  await query(
    db,
    `INSERT INTO version_renditions(version_id,kind,status,source_sha256,filename,mime,attempts)
     VALUES(?,?,'pending',?,?,?,1)
     ON DUPLICATE KEY UPDATE
       status=IF(source_sha256<>VALUES(source_sha256),'pending',IF(status='ready','ready','pending')),
       content=IF(source_sha256<>VALUES(source_sha256),NULL,content),
       sha256=IF(source_sha256<>VALUES(source_sha256),NULL,sha256),
       byte_size=IF(source_sha256<>VALUES(source_sha256),NULL,byte_size),
       error=IF(source_sha256<>VALUES(source_sha256),'',error),
       kind=VALUES(kind),filename=VALUES(filename),mime=VALUES(mime),
       attempts=IF(source_sha256<>VALUES(source_sha256),1,attempts+1),
       source_sha256=VALUES(source_sha256)`,
    [versionId, kind, sourceSha256, filename, mime],
  );
  return getRendition(db, versionId);
}

/** 转换成功：写入字节与哈希，状态置为 ready。 */
export async function completeRendition(
  db: Db,
  {
    versionId,
    sourceSha256,
    content,
    sha256,
    byteSize,
    filename,
    mime,
  }: {
    versionId: string;
    sourceSha256: string;
    content: Buffer;
    sha256: string;
    byteSize: number;
    filename: string;
    mime: string;
  },
): Promise<void> {
  await query(
    db,
    `UPDATE version_renditions
     SET status='ready',sha256=?,byte_size=?,content=?,error='',filename=?,mime=?
     WHERE version_id=? AND source_sha256=?`,
    [sha256, byteSize, content, filename, mime, versionId, sourceSha256],
  );
}

/** 转换失败：记录原因，保留尝试次数供退避判断。 */
export async function failRendition(
  db: Db,
  { versionId, sourceSha256, error }: { versionId: string; sourceSha256: string; error: unknown },
): Promise<void> {
  await query(
    db,
    `UPDATE version_renditions SET status='failed',error=?
     WHERE version_id=? AND source_sha256=?`,
    [String(error || "转换失败").slice(0, 500), versionId, sourceSha256],
  );
}
