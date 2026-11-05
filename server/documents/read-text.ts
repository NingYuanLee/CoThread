export const DOCUMENT_TEXT_READ_DEFAULT = 6000;
export const DOCUMENT_TEXT_READ_MAX = 8000;

const TEXT_EXTENSION =
  /\.(md|markdown|txt|json|csv|tsv|js|jsx|ts|tsx|mjs|cjs|py|html?|css|xml|yaml|yml|sql|log|svg|ini|toml|sh|ps1)$/i;
const TEXT_MIME = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-javascript",
  "application/yaml",
  "application/x-yaml",
  "application/sql",
  "image/svg+xml",
]);

/** 版本行里本文件会用到的列。 */
type DocumentVersionRow = {
  id: string;
  artifact_id?: string;
  project_id?: string;
  title?: string;
  filename?: string;
  version?: number;
  mime?: string;
  sha256?: string;
  byte_size?: number | string;
  folder_id?: string | null;
  content?: Buffer | string | null;
};

export function isDocumentText(mime: unknown, filename: unknown): boolean {
  const type = String(mime || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (type.startsWith("text/")) return true;
  if (TEXT_MIME.has(type) || type.endsWith("+json") || type.endsWith("+xml")) return true;
  return TEXT_EXTENSION.test(String(filename || ""));
}

function metaOf(version: DocumentVersionRow) {
  return {
    id: version.id,
    artifactId: version.artifact_id,
    projectId: version.project_id,
    title: version.title,
    filename: version.filename,
    version: version.version,
    mime: version.mime,
    sha256: version.sha256,
    byteSize: Number(version.byte_size) || 0,
    folderId: version.folder_id ?? null,
  };
}

/** 分页结果；`afterEnd` 只在偏移超过正文长度时为真。 */
export type PaginatedText = {
  offset: number;
  limit: number;
  returned: number;
  totalChars: number;
  truncated: boolean;
  nextOffset: number | null;
  content: string;
  afterEnd: boolean;
};

/** 按字符偏移切分正文，供文本文件与提取出的 Office 正文共用。 */
export function paginateText(
  body: string,
  { offset = 0, limit = DOCUMENT_TEXT_READ_DEFAULT }: { offset?: number; limit?: number } = {},
): PaginatedText {
  const start = Math.max(0, Math.trunc(Number(offset) || 0));
  const size = Math.min(
    DOCUMENT_TEXT_READ_MAX,
    Math.max(1, Math.trunc(Number(limit) || DOCUMENT_TEXT_READ_DEFAULT)),
  );
  if (start > body.length) {
    return {
      offset: start,
      limit: size,
      returned: 0,
      totalChars: body.length,
      truncated: false,
      nextOffset: null,
      content: "",
      afterEnd: true,
    };
  }
  const content = body.slice(start, start + size);
  const end = start + content.length;
  const truncated = end < body.length;
  return {
    offset: start,
    limit: size,
    returned: content.length,
    totalChars: body.length,
    truncated,
    nextOffset: truncated ? end : null,
    content,
    afterEnd: false,
  };
}

export function readDocumentContent(
  version: DocumentVersionRow,
  { offset = 0, limit = DOCUMENT_TEXT_READ_DEFAULT }: { offset?: number; limit?: number } = {},
) {
  const meta = metaOf(version);
  if (!isDocumentText(version.mime, version.filename)) {
    return {
      ...meta,
      text: false,
      note: "二进制文件不返回正文，只提供类型、大小和哈希。",
    };
  }
  const raw = Buffer.isBuffer(version.content)
    ? version.content
    : Buffer.from(version.content || "");
  if (raw.includes(0)) {
    return {
      ...meta,
      text: false,
      note: "文件含有空字节，不作为文本返回。",
    };
  }
  const body = raw.toString("utf8");
  const page = paginateText(body, { offset, limit });
  if (page.afterEnd) {
    const { afterEnd: _ignored, ...rest } = page;
    return { ...meta, text: true, ...rest, note: "偏移已经超过正文长度。" };
  }
  const { afterEnd: _ignored, ...rest } = page;
  return { ...meta, text: true, ...rest };
}
