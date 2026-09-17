import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inlineHtmlPreviewAssets,
  resolvePreviewAssetPath,
} from "../shared/html-preview.mjs";

test("resolvePreviewAssetPath keeps relative css and js", () => {
  assert.equal(resolvePreviewAssetPath("./style.css"), "style.css");
  assert.equal(resolvePreviewAssetPath("script.js"), "script.js");
  assert.equal(
    resolvePreviewAssetPath(
      "/api/versions/bd31bf70-3f5e-498e-a4bf-31d1a0b4b353/preview/style.css",
    ),
    "style.css",
  );
  assert.equal(resolvePreviewAssetPath("https://cdn.example/a.css"), null);
  assert.equal(resolvePreviewAssetPath("../secret.css"), null);
});

test("inlineHtmlPreviewAssets embeds css and js", async () => {
  const html = `<!DOCTYPE html><html><head><base href="/api/versions/x/preview/"><link rel="stylesheet" href="./style.css"></head><body><script src="./script.js"></script></body></html>`;
  const assets = {
    "style.css": "body{color:red}",
    "script.js": "window.ready=1;</script>attack",
  };
  const out = await inlineHtmlPreviewAssets(html, async (path) => assets[path]);
  assert.equal(out.includes("<base"), false);
  assert.match(out, /<style>body\{color:red\}<\/style>/);
  assert.match(out, /<script>window\.ready=1;<\\\/script>attack<\/script>/);
  assert.equal(out.includes('href="./style.css"'), false);
  assert.equal(out.includes('src="./script.js"'), false);
});
