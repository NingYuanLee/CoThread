#!/usr/bin/env node
// 构建后预压缩 dist 静态资源：产出 .br 与 .gz 兄弟文件。
// 生产由 Node 直接托管 dist、没有反向代理，压缩必须落在构建产物里。
import { createReadStream, createWriteStream, readdirSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createBrotliCompress, createGzip, constants as zlibConstants } from "node:zlib";
import { pipeline } from "node:stream/promises";

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

// 压缩后必须真的更小才保留产物：极小的文本压缩后可能反而更大
// （gzip 头有固定开销），这类文件保持原样。
const MIN_BYTES = 0;

function collect(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) collect(p, out);
    else if (entry.isFile()) out.push(p);
  }
  return out;
}

async function compressTo(source, target, encoding) {
  const stream =
    encoding === "br"
      ? createBrotliCompress({
          params: {
            [zlibConstants.BROTLI_PARAM_QUALITY]: zlibConstants.BROTLI_MAX_QUALITY,
            [zlibConstants.BROTLI_PARAM_SIZE_HINT]: statSync(source).size,
          },
        })
      : createGzip({ level: zlibConstants.Z_BEST_COMPRESSION });
  await pipeline(createReadStream(source), stream, createWriteStream(target));
}

const dist = process.argv[2] || "dist";
const files = collect(dist, []);
let rawTotal = 0;
let brTotal = 0;
let gzTotal = 0;
let count = 0;
for (const file of files) {
  const extension = file.slice(file.lastIndexOf(".")).toLowerCase();
  if (!COMPRESSIBLE.has(extension)) continue;
  const size = statSync(file).size;
  if (size < MIN_BYTES) continue;
  await compressTo(file, `${file}.br`, "br");
  await compressTo(file, `${file}.gz`, "gzip");
  const brSize = statSync(`${file}.br`).size;
  const gzSize = statSync(`${file}.gz`).size;
  // 压完不比原文件小就丢弃产物：极小的文本压缩后可能反而更大。
  if (brSize >= size) {
    rmSync(`${file}.br`, { force: true });
  } else {
    rawTotal += size;
    brTotal += brSize;
    count += 1;
  }
  if (gzSize >= size) {
    rmSync(`${file}.gz`, { force: true });
  } else {
    gzTotal += gzSize;
  }
}
console.log(
  `预压缩 ${count} 个文件：原始 ${(rawTotal / 1024 / 1024).toFixed(2)}MB ` +
    `-> br ${(brTotal / 1024 / 1024).toFixed(2)}MB ` +
    `-> gzip ${(gzTotal / 1024 / 1024).toFixed(2)}MB`,
);
