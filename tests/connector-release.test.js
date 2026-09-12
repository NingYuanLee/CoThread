import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { createReleaseManifest } from "../server/connectors.js";
import { readFile } from "node:fs/promises";

test("connector release manifests hash and sign the uploaded executable", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const bytes = Buffer.from("MZ-test-connector");
  const manifest = createReleaseManifest(bytes, "0.2.0", "https://example.test/api/connector/releases/id/download", privateKey);

  assert.match(manifest.sha256, /^[a-f0-9]{64}$/);
  assert.equal(verify(null, Buffer.from(`${manifest.version}\n${manifest.url}\n${manifest.sha256}`), publicKey,
    Buffer.from(manifest.signature, "base64")), true);
});

test("super-administrator UI publishes chunked connector releases", async () => {
  const [ui, main, server, httpApp, migration] = await Promise.all([
    readFile(new URL("../web/SystemManagement.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web/main.tsx", import.meta.url), "utf8"),
    readFile(new URL("../server/connectors.js", import.meta.url), "utf8"),
    readFile(new URL("../server/http-app.js", import.meta.url), "utf8"),
    readFile(new URL("../migrations/036_connector_releases.sql", import.meta.url), "utf8"),
  ]);

  assert.match(main, /\["admin-connector", "连接器管理"\]/);
  assert.match(ui, /section === "connector"/);
  assert.match(ui, /readAsDataURL\(releaseFile\)/);
  assert.match(server, /service\.systemAdmin\(req\.user\)/);
  assert.match(server, /\/api\/admin\/connector-release/);
  assert.match(server, /connector_release_chunks/);
  assert.match(migration, /CREATE TABLE connector_releases/);
  assert.ok(httpApp.indexOf("registerRequestParts(app, db)") < httpApp.indexOf("registerConnectorBrowserRoutes(app, db, service)"),
    "large request parts must be reassembled before connector administration routes run");
});
