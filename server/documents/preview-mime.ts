const PREVIEW_MIME_BY_EXT: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
};

const STORED_MIME_BY_EXT: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  json: "application/json",
  svg: "image/svg+xml",
  md: "text/markdown",
  markdown: "text/markdown",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  zip: "application/zip",
};

/** 规范化上传声明的 MIME；非法或空返回 undefined。 */
export function normalizeUploadMime(mime: unknown): string | undefined {
  const current = String(mime || "").trim();
  if (!current) return undefined;
  const type = current.split(";")[0].trim().toLowerCase();
  if (!/^[\w.+-]+\/[\w.+-]+$/.test(type)) return undefined;
  return type;
}

function fileExt(filename: unknown): string {
  return (
    String(filename || "")
      .split(".")
      .pop()
      ?.toLowerCase() || ""
  );
}

/** 按扩展名给出入库后应记录的 Content-Type。 */
export function storedContentType(filename: unknown): string {
  const ext = fileExt(filename);
  if (STORED_MIME_BY_EXT[ext]) return STORED_MIME_BY_EXT[ext];
  if (
    /^(txt|py|ts|tsx|jsx|csv|sql|ya?ml|jsonc|log|env|ini|conf|toml|properties|sh|bash|gitignore)$/.test(
      ext,
    )
  )
    return "text/plain";
  return "application/octet-stream";
}

/** 已上传声明的 MIME 与扩展名推断冲突时，以扩展名为准的两个特例。 */
export function resolveStoredMime(filename: unknown, mime: unknown): string {
  const inferred = storedContentType(filename);
  const current = normalizeUploadMime(mime);
  if (!current || current === "application/octet-stream") return inferred;
  if (current === "text/plain" && inferred !== "text/plain") return inferred;
  return current;
}

/** 预览响应头：已知扩展名优先，其余补 charset。 */
export function previewContentType(mime: unknown, filename: unknown): string {
  const ext = fileExt(filename);
  if (PREVIEW_MIME_BY_EXT[ext]) return PREVIEW_MIME_BY_EXT[ext];
  const normalized = String(mime || "").trim();
  if (normalized && normalized !== "application/octet-stream") {
    return /charset=/i.test(normalized) ? normalized : `${normalized}; charset=utf-8`;
  }
  return "application/octet-stream";
}
