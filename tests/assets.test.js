import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

test("server assets resolve beside the module when cwd is outside the release", async () => {
  const root = await mkdtemp(join(tmpdir(), "cothread-assets-"));
  try {
    const serverDir = join(root, "server"), assets = join(root, "runtime");
    const elsewhere = join(root, "elsewhere");
    await mkdir(serverDir, { recursive: true });
    await mkdir(assets, { recursive: true });
    await mkdir(elsewhere, { recursive: true });
    await writeFile(join(assets, "agent-patch.yml"), "x");
    const entry = join(serverDir, "assets.mjs");
    await copyFile(new URL("../server/assets.js", import.meta.url), entry);
    const result = spawnSync(process.execPath, ["--input-type=module", "-e",
      `import { assetPath } from ${JSON.stringify(pathToFileURL(entry).href)}; console.log(assetPath('runtime'));`],
      { cwd: elsewhere, encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), assets);
  } finally { await rm(root, { recursive: true, force: true }); }
});
