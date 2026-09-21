import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isOurDevProcess, looksLikeTrackedDevCommand, resolveDevPorts } from "../scripts/dev-runtime.js";
import { isApiPath } from "../scripts/dev-gateway.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiEntry = resolve(root, "server/index.js");
const viteEntry = resolve(root, "scripts/vite-app.mjs");

test("dev gateway treats MCP query strings as API traffic", () => {
  assert.equal(isApiPath("/mcp"), true);
  assert.equal(isApiPath("/mcp?v=0.3.0"), true);
  assert.equal(isApiPath("/mcp/"), true);
  assert.equal(isApiPath("/index.html"), false);
});
  assert.deepEqual(resolveDevPorts({}), { uiPort: 3100, apiPort: 3101, vitePort: 3102 });
  assert.deepEqual(resolveDevPorts({ PORT: "3200" }), { uiPort: 3200, apiPort: 3201, vitePort: 3202 });
  assert.throws(() => resolveDevPorts({ PORT: "3100", API_PORT: "3100" }), /不能相同/);
});

test("only this repo's server or vite command lines are reclaimable", () => {
  assert.equal(isOurDevProcess(`node ${apiEntry} --api-only`, root), true);
  assert.equal(isOurDevProcess(`node ${viteEntry}`, root), true);
  assert.equal(isOurDevProcess("node D:\\other-app\\server\\index.js --api-only", root), false);
  assert.equal(isOurDevProcess("", root), false);
  assert.equal(looksLikeTrackedDevCommand("node.exe --env-file=.env server/index.js --api-only"), true);
  assert.equal(looksLikeTrackedDevCommand("node.exe scripts/dev.js"), true);
  assert.equal(looksLikeTrackedDevCommand("node.exe other.js"), false);
});
