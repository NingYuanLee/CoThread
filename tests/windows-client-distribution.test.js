import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("connector application distribution stays outside CoThread", async () => {
  const [server, management, panel, settings, client, build, pkg, sample, migration, main, readme] =
    await Promise.all([
      readFile(new URL("../server/local-executors.js", import.meta.url), "utf8"),
      readFile(new URL("../web/SystemManagement.tsx", import.meta.url), "utf8"),
      readFile(new URL("../web/LocalExecutorPanel.tsx", import.meta.url), "utf8"),
      readFile(new URL("../web/McpSettings.tsx", import.meta.url), "utf8"),
      readFile(new URL("../windows-client/main.cjs", import.meta.url), "utf8"),
      readFile(new URL("../scripts/build-windows-client.mjs", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      readFile(new URL("../.env.example", import.meta.url), "utf8"),
      readFile(
        new URL("../migrations/047_remove_connector_distribution.sql", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../web/WorkspaceApp.tsx", import.meta.url), "utf8"),
      readFile(new URL("../README.md", import.meta.url), "utf8"),
    ]);

  assert.doesNotMatch(
    server,
    /connector_releases|connector-release|download-info|download-availability|latestRelease|\/api\/local_executors\/download/,
  );
  assert.doesNotMatch(management, /ConnectorRelease|section === "connector"/);
  assert.doesNotMatch(panel, /download-info|download-availability|连接器\/releases/);
  assert.doesNotMatch(settings, /download-info|download-availability|连接器\/releases/);
  assert.doesNotMatch(panel, /本机 Agent 执行通道|connector-dialog|ModalBackdrop/);
  assert.match(panel, /LocalExecutorAccountSection/);
  assert.match(settings, /LocalExecutorAccountSection/);
  assert.doesNotMatch(main, /<LocalExecutorPanel/);
  assert.doesNotMatch(main, /下载免安装|下载或关联设备|下载、配对/);
  assert.doesNotMatch(readme, /可下载免安装/);
  assert.doesNotMatch(client, /pending-update|checkUpdate|verifyManifest|apply-update/);
  assert.doesNotMatch(build, /UPDATE_PUBLIC_KEY/);
  assert.doesNotMatch(pkg, /connector:sign/);
  assert.doesNotMatch(sample, /MODEL_PROVIDER|CONNECTOR_(?:DOWNLOAD|RELEASE|UPDATE)_/);
  assert.match(migration, /DROP TABLE IF EXISTS connector_release_chunks/);
  assert.match(migration, /DROP TABLE IF EXISTS connector_releases/);
});
