import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inlineHtmlPreviewAssets,
  previewConsoleProbeHtml,
  resolvePreviewAssetPath,
} from "../shared/html-preview.mjs";

process.env.CREDENTIAL_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");

test("preview console probe accepts a CSP nonce without exposing arbitrary values", () => {
  assert.match(previewConsoleProbeHtml("preview_nonce-1"), /<script nonce="preview_nonce-1"/);
  assert.doesNotMatch(previewConsoleProbeHtml('bad" nonce="escape'), /bad" nonce="escape/);
});
const { readPreviewTicket, signPreviewTicket, splitPreviewAssetPath } =
  await import("../shared/preview-ticket.mjs");

test("resolvePreviewAssetPath keeps relative css and js", () => {
  assert.equal(resolvePreviewAssetPath("./style.css"), "style.css");
  assert.equal(resolvePreviewAssetPath("./assets/style.css"), "assets/style.css");
  assert.equal(resolvePreviewAssetPath("script.js"), "script.js");
  assert.equal(
    resolvePreviewAssetPath("/api/versions/bd31bf70-3f5e-498e-a4bf-31d1a0b4b353/preview/style.css"),
    "style.css",
  );
  assert.equal(
    resolvePreviewAssetPath(
      "/api/versions/bd31bf70-3f5e-498e-a4bf-31d1a0b4b353/preview/~t~abc.def/style.css",
    ),
    "style.css",
  );
  assert.equal(resolvePreviewAssetPath("https://cdn.example/a.css"), null);
  assert.equal(resolvePreviewAssetPath("../secret.css"), null);
});

test("inlineHtmlPreviewAssets embeds css and js", async () => {
  const html = `<!DOCTYPE html><html><head><base href="/api/versions/x/preview/"><link rel="stylesheet" href="./assets/style.css"></head><body><script src="./script.js"></script></body></html>`;
  const assets = {
    "assets/style.css": "body{color:red}",
    "script.js": "window.ready=1;</script>attack",
  };
  const out = await inlineHtmlPreviewAssets(html, async (path) => assets[path]);
  assert.equal(out.includes("<base"), false);
  assert.match(out, /<style>body\{color:red\}<\/style>/);
  assert.match(out, /<script>window\.ready=1;<\\\/script>attack<\/script>/);
  assert.equal(out.includes('href="./assets/style.css"'), false);
  assert.equal(out.includes('src="./script.js"'), false);
});

test("preview tickets bind user and version and strip out of asset paths", () => {
  const ticket = signPreviewTicket("user-1", "version-1");
  assert.match(ticket, /^~t~[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(readPreviewTicket(ticket)?.userId, "user-1");
  assert.equal(readPreviewTicket(ticket)?.versionId, "version-1");
  const bad = `${ticket.slice(0, -1)}${ticket.endsWith("A") ? "B" : "A"}`;
  assert.equal(readPreviewTicket(bad), null);
  assert.equal(splitPreviewAssetPath(`${ticket}/assets/style.css`).path, "assets/style.css");
  assert.equal(splitPreviewAssetPath("assets/style.css").path, "assets/style.css");
});

test("preview tickets require the configured signing key", () => {
  const previous = process.env.CREDENTIAL_ENCRYPTION_KEY;
  delete process.env.CREDENTIAL_ENCRYPTION_KEY;
  assert.throws(() => signPreviewTicket("user-1", "version-1"), /CREDENTIAL_ENCRYPTION_KEY/);
  if (previous === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
  else process.env.CREDENTIAL_ENCRYPTION_KEY = previous;
});
