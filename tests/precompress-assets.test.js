import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, brotliDecompressSync } from "node:zlib";

const script = "scripts/precompress-assets.mjs";

test("预压缩只处理文本类资源，跳过二进制与空文件", () => {
  const dist = mkdtempSync(join(tmpdir(), "cothread-precompress-"));
  try {
    mkdirSync(join(dist, "assets"), { recursive: true });
    writeFileSync(join(dist, "index.html"), "<html><body>hi</body></html>");
    writeFileSync(join(dist, "assets", "app.js"), "console.log(1);\n".repeat(200));
    writeFileSync(join(dist, "empty.css"), "");
    writeFileSync(
      join(dist, "logo.png"),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    execFileSync(process.execPath, [script, dist], { stdio: "pipe" });

    assert.ok(existsSync(join(dist, "index.html.br")), "html 应被压缩");
    assert.ok(existsSync(join(dist, "assets", "app.js.br")), "js 应被压缩");
    assert.ok(existsSync(join(dist, "assets", "app.js.gz")), "js 应产出 gzip");
    assert.equal(existsSync(join(dist, "empty.css.br")), false, "空文件不该压缩");
    assert.equal(existsSync(join(dist, "logo.png.br")), false, "二进制不该压缩");
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test("预压缩产物能还原原文", () => {
  const dist = mkdtempSync(join(tmpdir(), "cothread-precompress-"));
  try {
    const original = "console.log(1);\n".repeat(200);
    writeFileSync(join(dist, "app.js"), original);
    execFileSync(process.execPath, [script, dist], { stdio: "pipe" });
    const source = readFileSync(join(dist, "app.js"));
    assert.ok(gunzipSync(readFileSync(join(dist, "app.js.gz"))).equals(source));
    assert.ok(brotliDecompressSync(readFileSync(join(dist, "app.js.br"))).equals(source));
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});

test("压缩后不比原文件小则不产出产物", () => {
  const dist = mkdtempSync(join(tmpdir(), "cothread-precompress-"));
  try {
    // 单字符文本压缩后更大（压缩格式有固定头部开销）。
    writeFileSync(join(dist, "tiny.css"), "a");
    execFileSync(process.execPath, [script, dist], { stdio: "pipe" });
    assert.equal(existsSync(join(dist, "tiny.css.br")), false, "压完更大就不该保留 brotli 产物");
    assert.equal(existsSync(join(dist, "tiny.css.gz")), false, "压完更大就不该保留 gzip 产物");
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
});
