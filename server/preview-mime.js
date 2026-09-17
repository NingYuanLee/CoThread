const PREVIEW_MIME_BY_EXT = {
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

const STORED_MIME_BY_EXT = {
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
};

function fileExt(filename) {
  return String(filename || "").split(".").pop()?.toLowerCase() || "";
}

export function storedContentType(filename) {
  const ext = fileExt(filename);
  if (STORED_MIME_BY_EXT[ext]) return STORED_MIME_BY_EXT[ext];
  if (/^(txt|py|ts|csv|sql|ya?ml|log)$/.test(ext)) return "text/plain";
  return "application/octet-stream";
}

export function resolveStoredMime(filename, mime) {
  const inferred = storedContentType(filename);
  const current = String(mime || "").trim();
  if (!current || current === "application/octet-stream") return inferred;
  if (current === "text/plain" && inferred !== "text/plain") return inferred;
  return current;
}

export function previewContentType(mime, filename) {
  const ext = fileExt(filename);
  if (PREVIEW_MIME_BY_EXT[ext]) return PREVIEW_MIME_BY_EXT[ext];
  const normalized = String(mime || "").trim();
  if (normalized && normalized !== "application/octet-stream") {
    return /charset=/i.test(normalized) ? normalized : `${normalized}; charset=utf-8`;
  }
  return "application/octet-stream";
}
