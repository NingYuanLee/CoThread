import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("connector application distribution stays outside CoThread", async () => {
  const [server, management, panel, client, build, pkg, sample, migration, main, readme] = await Promise.all([
    readFile(new URL("../server/connectors.js", import.meta.url), "utf8"),
    readFile(new URL("../web/SystemManagement.tsx", import.meta.url), "utf8"),
    readFile(new URL("../web/ConnectorPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../connector/main.cjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/build-connector.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../migrations/047_remove_connector_distribution.sql", import.meta.url), "utf8"),
    readFile(new URL("../web/main.tsx", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(server, /connector_releases|connector-release|download-info|download-availability|latestRelease|\/api\/connectors\/download/);
  assert.doesNotMatch(management, /ConnectorRelease|section === "connector"/);
  assert.doesNotMatch(panel, /download-info|download-availability|连接器\/releases/);
  assert.doesNotMatch(main, /下载免安装|下载或关联设备|下载、配对/);
  assert.doesNotMatch(readme, /可下载免安装/);
  assert.doesNotMatch(client, /pending-update|checkUpdate|verifyManifest|apply-update/);
  assert.doesNotMatch(build, /UPDATE_PUBLIC_KEY/);
  assert.doesNotMatch(pkg, /connector:sign/);
  assert.doesNotMatch(sample, /MODEL_PROVIDER|CONNECTOR_(?:DOWNLOAD|RELEASE|UPDATE)_/);
  assert.match(migration, /DROP TABLE IF EXISTS connector_release_chunks/);
  assert.match(migration, /DROP TABLE IF EXISTS connector_releases/);
});
