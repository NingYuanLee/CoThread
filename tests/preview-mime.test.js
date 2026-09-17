import { test } from "node:test";
import assert from "node:assert/strict";
import { previewContentType, resolveStoredMime, storedContentType } from "../server/preview-mime.js";

test("preview prefers filename over stored text/plain", () => {
  assert.equal(previewContentType("text/plain", "index.html"), "text/html; charset=utf-8");
  assert.equal(previewContentType("text/plain", "style.css"), "text/css; charset=utf-8");
  assert.equal(previewContentType("text/plain", "script.js"), "text/javascript; charset=utf-8");
  assert.equal(previewContentType("text/plain", "notes.txt"), "text/plain; charset=utf-8");
  assert.equal(previewContentType("application/pdf", "report.pdf"), "application/pdf; charset=utf-8");
});

test("agent stored mime maps html css js md json svg", () => {
  assert.equal(storedContentType("index.html"), "text/html");
  assert.equal(storedContentType("style.css"), "text/css");
  assert.equal(storedContentType("app.mjs"), "text/javascript");
  assert.equal(storedContentType("readme.md"), "text/markdown");
  assert.equal(storedContentType("data.json"), "application/json");
  assert.equal(storedContentType("mark.svg"), "image/svg+xml");
  assert.equal(storedContentType("main.py"), "text/plain");
  assert.equal(resolveStoredMime("page.html", "text/plain"), "text/html");
  assert.equal(resolveStoredMime("notes.txt"), "text/plain");
});
