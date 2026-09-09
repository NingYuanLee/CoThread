import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

test("packaged Agent resolves included assets even when started outside its bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "cothread-assets-"));
  try {
    const bundle = join(root, "agent-node"), assets = join(bundle, "included_files", "migrations");
    await mkdir(assets, { recursive: true });
    await writeFile(join(assets, "001.sql"), "SELECT 1;");
    const entry = join(bundle, "assets.mjs");
    await copyFile(new URL("../server/assets.js", import.meta.url), entry);
    const result = spawnSync(process.execPath, ["--input-type=module", "-e",
      `import { assetPath } from ${JSON.stringify(pathToFileURL(entry).href)}; console.log(assetPath('migrations'));`],
      { cwd: root, encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), assets);
  } finally { await rm(root, { recursive: true, force: true }); }
});
