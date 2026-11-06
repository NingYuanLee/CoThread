import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { precompressedStatic, preferredEncoding } from "../server/static-compression.ts";

test("preferredEncoding 优先 br，其次 gzip，都不接受则为空", () => {
  assert.equal(preferredEncoding("br, gzip"), "br");
  assert.equal(preferredEncoding("gzip, deflate"), "gzip");
  assert.equal(preferredEncoding("gzip;q=0"), null);
  assert.equal(preferredEncoding("br;q=0.5, gzip;q=1"), "gzip");
  assert.equal(preferredEncoding(undefined), null);
});

/** 起一个只挂静态中间件的小服务，模拟生产静态托管。 */
async function withServer(dist, request, run) {
  const server = createServer((req, res) => {
    precompressedStatic(dist)(req, res, () => {
      // 模拟 express.static 的回退：命中原始文件就原样返回，否则 404。
      const target = resolve(dist, "." + req.url.split("?")[0]);
      if (!target.startsWith(resolve(dist)) || !existsSync(target) || !statSync(target).isFile()) {
        res.statusCode = 404;
        res.end("not found");
        return;
      }
      const body = readFileSync(target);
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Length", String(body.length));
      res.end(body);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}${request.path}`, request.headers);
  } finally {
    // keep-alive 连接会拖住 close()，这里显式断开。
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function fetchBytes(url, headers) {
  const response = await fetch(url, { headers });
  const body = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    encoding: response.headers.get("content-encoding"),
    type: response.headers.get("content-type"),
    vary: response.headers.get("vary"),
    length: Number(response.headers.get("content-length") || 0),
    body,
  };
}

/**
 * fetch 会按 Content-Encoding 自动解压，压缩体积就看不到原始字节了。
 * 这里用 http.request 直接读原始响应字节。
 */
async function fetchRaw(url, headers) {
  const { request } = await import("node:http");
  return new Promise((resolve, reject) => {
    const req = request(url, { headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () =>
        resolve({
          status: res.statusCode,
          encoding: res.headers["content-encoding"] ?? null,
          type: res.headers["content-type"] ?? null,
          vary: res.headers.vary ?? null,
          length: Number(res.headers["content-length"] || 0),
          cacheControl: res.headers["cache-control"] ?? null,
          body: Buffer.concat(chunks),
        }),
      );
    });
    req.on("error", reject);
    req.end();
  });
}

test("命中预压缩产物时按 Accept-Encoding 返回压缩内容", async () => {
  const dist = mkdtempSync(join(tmpdir(), "cothread-static-"));
  try {
    const original = "body { color: red; }\n".repeat(200);
    writeFileSync(join(dist, "app.css"), original);
    writeFileSync(join(dist, "app.css.br"), Buffer.from("BROTLI-PAYLOAD"));
    writeFileSync(join(dist, "app.css.gz"), Buffer.from("GZIP-PAYLOAD"));

    const brotli = await withServer(
      dist,
      { path: "/app.css", headers: { "accept-encoding": "br, gzip" } },
      (url, headers) => fetchRaw(url, headers),
    );
    assert.equal(brotli.status, 200);
    assert.equal(brotli.encoding, "br");
    assert.equal(brotli.body.toString(), "BROTLI-PAYLOAD");
    assert.equal(brotli.vary, "Accept-Encoding");
    // assets 下的文件名带内容哈希，压缩响应也要带长期缓存头，
    // 否则命中压缩的请求会比未命中的请求少一层缓存。
    assert.equal(brotli.cacheControl, "no-store");
    assert.ok(brotli.type.includes("text/css"));

    const gzip = await withServer(
      dist,
      { path: "/app.css", headers: { "accept-encoding": "gzip" } },
      (url, headers) => fetchRaw(url, headers),
    );
    assert.equal(gzip.encoding, "gzip");
    assert.equal(gzip.body.toString(), "GZIP-PAYLOAD");
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test("assets 下的压缩响应带长期缓存头", async () => {
  const dist = mkdtempSync(join(tmpdir(), "cothread-static-"));
  try {
    mkdirSync(join(dist, "assets"), { recursive: true });
    writeFileSync(join(dist, "assets", "app.css"), "body { color: red; }\n".repeat(200));
    writeFileSync(join(dist, "assets", "app.css.br"), Buffer.from("BROTLI-PAYLOAD"));
    const result = await withServer(
      dist,
      { path: "/assets/app.css", headers: { "accept-encoding": "br, gzip" } },
      (url, headers) => fetchRaw(url, headers),
    );
    assert.equal(result.encoding, "br");
    assert.equal(result.cacheControl, "public, max-age=31536000, immutable");
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test("客户端不接受压缩时原样返回文件", async () => {
  const dist = mkdtempSync(join(tmpdir(), "cothread-static-"));
  try {
    const original = "body { color: red; }\n".repeat(200);
    writeFileSync(join(dist, "app.css"), original);
    writeFileSync(join(dist, "app.css.br"), Buffer.from("BROTLI-PAYLOAD"));
    const result = await withServer(dist, { path: "/app.css", headers: {} }, (url, headers) =>
      fetchBytes(url, headers),
    );
    assert.equal(result.status, 200);
    assert.equal(result.encoding, null);
    assert.equal(result.body.toString(), original);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test("预压缩产物缺失时退回原始文件", async () => {
  const dist = mkdtempSync(join(tmpdir(), "cothread-static-"));
  try {
    const original = "body { color: blue; }\n".repeat(200);
    writeFileSync(join(dist, "app.css"), original);
    const result = await withServer(
      dist,
      { path: "/app.css", headers: { "accept-encoding": "br, gzip" } },
      (url, headers) => fetchBytes(url, headers),
    );
    assert.equal(result.status, 200);
    assert.equal(result.encoding, null);
    assert.equal(result.body.toString(), original);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test("预压缩产物比原文件旧时不使用", async () => {
  const dist = mkdtempSync(join(tmpdir(), "cothread-static-"));
  try {
    const original = "body { color: green; }\n".repeat(200);
    const source = join(dist, "app.css");
    writeFileSync(source, original);
    writeFileSync(join(dist, "app.css.br"), Buffer.from("STALE-PAYLOAD"));
    // 让预压缩文件比原文件旧一小时。
    const old = new Date(Date.now() - 3600_000);
    utimesSync(join(dist, "app.css.br"), old, old);
    const result = await withServer(
      dist,
      { path: "/app.css", headers: { "accept-encoding": "br" } },
      (url, headers) => fetchBytes(url, headers),
    );
    assert.equal(result.encoding, null);
    assert.equal(result.body.toString(), original);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test("路径穿越请求不会命中 dist 内文件", async () => {
  const dist = mkdtempSync(join(tmpdir(), "cothread-static-"));
  try {
    writeFileSync(join(dist, "app.css"), "body{}");
    writeFileSync(join(dist, "app.css.br"), Buffer.from("X"));
    const result = await withServer(
      dist,
      { path: "/../secret.txt", headers: { "accept-encoding": "br" } },
      (url, headers) => fetchBytes(url, headers),
    );
    assert.equal(result.status, 404);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});
