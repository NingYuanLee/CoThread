import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createMakersApp } from "../server/makers.js";

test("Makers per-request module evaluation retains the same HTTP app", async () => {
  const key = Symbol.for("cothread.makers.http-app.v1");
  const source = (await readFile(new URL("../cloud-functions/[[default]].js", import.meta.url), "utf8"))
    .replace('"../server/makers.js"', JSON.stringify(new URL("../server/makers.js", import.meta.url).href));
  const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  try {
    const first = (await import(dataUrl + "#first-evaluation")).default;
    const second = (await import(dataUrl + "#second-evaluation")).default;
    assert.equal(first, second);
  } finally { delete globalThis[key]; }
});

test("Makers shares concurrent initialization, retries failures and skips warm initialization", async () => {
  let calls = 0, release;
  const gate = new Promise((resolve) => { release = resolve; });
  const db = { execute: async () => [[{ value: 1 }]] };
  const server = createMakersApp(async () => {
    calls++;
    if (calls === 1) throw Object.assign(new Error("unavailable"), { code: "TEST_UNAVAILABLE" });
    await gate;
    return db;
  }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/health`;
  try {
    const failure = await fetch(url);
    assert.equal(failure.status, 503);
    await failure.arrayBuffer();
    const pending = [fetch(url), fetch(url)];
    release();
    const responses = await Promise.all(pending);
    for (const response of responses) {
      assert.equal(response.status, 200);
      await response.arrayBuffer();
    }
    assert.equal(calls, 2);
    const warm = await fetch(url);
    assert.match(warm.headers.get("server-timing"), /init;dur=0\.0/);
    await warm.arrayBuffer();
    assert.equal(calls, 2);
  } finally { release(); await new Promise((resolve) => server.close(resolve)); }
});
