import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * 生产静态资源预压缩。
 *
 * 构建产物没有反向代理兜底（生产由 Node 直接托管 dist），
 * 13MB 的 dist 原本按原始字节传输。构建时同步产出 .gz / .br，
 * 运行时按 Accept-Encoding 直接送对应文件，省掉逐请求压缩的 CPU 开销。
 *
 * 找不到预压缩文件时退回原始文件，行为与不启用压缩一致。
 */

/** 只有文本类资源值得压缩；二进制已压缩过，再压几乎无收益。 */
const COMPRESSIBLE = new Set([
  ".html",
  ".css",
  ".js",
  ".mjs",
  ".json",
  ".svg",
  ".xml",
  ".txt",
  ".map",
  ".webmanifest",
]);

/**
 * 压缩版本不比原文件小就退回原样：极小的文本压缩后可能反而更大
 * （压缩格式有固定头部开销）。
 */
const MIN_COMPRESS_BYTES = 0;

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function contentTypeFor(extension: string): string {
  return CONTENT_TYPES[extension] || "application/octet-stream";
}

/** 客户端同时声明 br 和 gzip 时优先 br。 */
function preferredEncoding(header: string | undefined): "br" | "gzip" | null {
  if (!header) return null;
  const accepted = new Map<string, number>();
  for (const part of header.split(",")) {
    const [rawName, ...params] = part.trim().split(";");
    const name = rawName.trim().toLowerCase();
    if (!name) continue;
    let quality = 1;
    for (const param of params) {
      const match = /^q=([0-9.]+)$/i.exec(param.trim());
      if (match) quality = Number(match[1]);
    }
    accepted.set(name, quality);
  }
  const brotli = accepted.get("br");
  const gzip = accepted.get("gzip");
  // 按 q 值比较，而不是无条件优先 br：客户端显式降级时应当尊重。
  if (brotli && brotli > 0 && (!gzip || gzip <= 0 || brotli >= gzip)) return "br";
  if (gzip && gzip > 0) return "gzip";
  return null;
}

/** 把请求路径解析成 dist 内的相对路径；越界一律拒绝。 */
function resolveWithin(dist: string, requestPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const target = resolve(dist, "." + (decoded.startsWith("/") ? decoded : "/" + decoded));
  const inside = relative(dist, target);
  if (inside.startsWith("..") || inside.startsWith(sep) || resolve(dist, inside) !== target)
    return null;
  return target;
}

/** 预压缩产物是否可用：文件存在且不比原文件旧。 */
function compressedVariant(source: string, encoding: "br" | "gzip") {
  const candidate = `${source}${encoding === "br" ? ".br" : ".gz"}`;
  if (!existsSync(candidate)) return null;
  try {
    const sourceStat = statSync(source);
    const candidateStat = statSync(candidate);
    // 预压缩文件比原文件旧说明它没跟上这次构建，不能用。
    if (candidateStat.mtimeMs < sourceStat.mtimeMs) return null;
    if (candidateStat.size === 0) return null;
    return { path: candidate, size: candidateStat.size };
  } catch {
    return null;
  }
}

/**
 * 静态资源中间件：命中预压缩产物就带 Content-Encoding 发送，否则原样发送。
 * 没命中压缩条件时调用 next()，交给后续的 express.static 处理。
 */
export function precompressedStatic(dist: string): RequestHandler {
  return (request: Request, response: Response, next: NextFunction) => {
    if (request.method !== "GET" && request.method !== "HEAD") return next();
    // Express 有 request.path；裸 http 请求只有 url，这里两种都兼容。
    const requestPath =
      typeof request.path === "string" ? request.path : String(request.url || "").split("?")[0];
    const source = resolveWithin(dist, requestPath);
    if (!source) return next();
    let stats;
    try {
      stats = statSync(source);
    } catch {
      return next();
    }
    if (!stats.isFile()) return next();
    const extension = extname(source).toLowerCase();
    if (!COMPRESSIBLE.has(extension) || stats.size < MIN_COMPRESS_BYTES) return next();
    const encoding = preferredEncoding(request.headers["accept-encoding"]);
    if (!encoding) return next();
    const variant = compressedVariant(source, encoding);
    if (!variant) return next();
    // 压缩版本不比原文件小就退回原样。
    if (variant.size >= stats.size) return next();
    response.setHeader("Content-Encoding", encoding);
    response.setHeader("Content-Type", contentTypeFor(extension));
    response.setHeader("Content-Length", String(variant.size));
    response.setHeader("Vary", "Accept-Encoding");
    // 缓存头与 express.static 的 setHeaders 保持一致：assets 下的文件名带内容哈希，
    // 可以长期缓存；其余资源不缓存。
    if (requestPath.startsWith("/assets/"))
      response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    else response.setHeader("Cache-Control", "no-store");
    if (request.method === "HEAD") {
      response.status(200).end();
      return;
    }
    void pipeline(createReadStream(variant.path), response).catch(() => {
      if (!response.headersSent) response.status(500).end();
      else response.destroy();
    });
  };
}

export { preferredEncoding };
