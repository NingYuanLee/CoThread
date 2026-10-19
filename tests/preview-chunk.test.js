import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function sourceFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === "node_modules" || name === "dist") continue;
    if (statSync(path).isDirectory()) sourceFiles(path, acc);
    else if (name.endsWith(".tsx") || name.endsWith(".ts")) acc.push(path);
  }
  return acc;
}

test("preview libraries are not statically imported", () => {
  const banned = /from\s+["'](?:docx-preview|xlsx|mermaid|jszip)["']/;
  const offenders = [];
  for (const file of sourceFiles("web")) {
    if (banned.test(readFileSync(file, "utf8"))) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});
