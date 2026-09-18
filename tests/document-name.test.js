import { test } from "node:test";
import assert from "node:assert/strict";
import { fileDisplayName, nextDuplicateName } from "../shared/document-name.js";

test("fileDisplayName uses title and keeps filename extension", () => {
  assert.equal(fileDisplayName({ title: "需求说明", filename: "req.md" }), "需求说明.md");
  assert.equal(fileDisplayName({ title: "notes.md", filename: "notes.md" }), "notes.md");
  assert.equal(fileDisplayName({ title: "纪要.md", filename: "notes.md" }), "纪要.md");
  assert.equal(fileDisplayName({ filename: "only.txt" }), "only.txt");
});

test("nextDuplicateName appends (n) before the extension", () => {
  assert.equal(nextDuplicateName("纪要.md", ["纪要.md"]), "纪要 (2).md");
  assert.equal(nextDuplicateName("纪要", ["纪要", "纪要 (2)"]), "纪要 (3)");
  assert.equal(nextDuplicateName("notes.md", ["NOTES.md"]), "notes (2).md");
});
