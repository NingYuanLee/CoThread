// B1/B2 的 HTTP 层最小验证：预览主响应与 /preview/*assetPath 资源子请求必须按扩展名给出 Content-Type。
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/auth.js";
import { query } from "../server/db.js";
import { Service } from "../server/service.js";
import { testDatabase } from "./database.js";

const password = "Test-only!Password-" + randomUUID();

let database, db, service, server, base, cookie, user, thread;

before(async () => {
  database = await testDatabase();
  db = database.db;
  service = new Service(db);
  server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const id = randomUUID();
  const email = `preview-http-${id}@example.com`;
  user = { id, email, name: "预览 HTTP 成员", kind: "session" };
  await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)", [
    id,
    email,
    user.name,
    await hashPassword(password),
  ]);
  const login = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.status, 200);
  cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const project = await service.createProject(user, { name: "预览 HTTP" });
  thread = await service.createThread(user, project.id, { title: "预览 HTTP 迭代" });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await database?.close();
});

// 全部按存量数据形态写入：库内 mime = text/plain，正确类型只能由扩展名决定。
async function save(filename, body, mime = "text/plain") {
  return service.submitVersion({ ...user, kind: "agent" }, thread.id, {
    title: filename,
    filename,
    mime,
    contentBase64: Buffer.from(body).toString("base64"),
  });
}

async function head(path) {
  const res = await fetch(`${base}${path}`, { headers: { Cookie: cookie } });
  await res.arrayBuffer();
  return {
    status: res.status,
    type: res.headers.get("content-type"),
    nosniff: res.headers.get("x-content-type-options"),
  };
}

test("preview route serves html/htm by extension even when stored mime is text/plain", async () => {
  const html = await save(
    "index.html",
    '<!DOCTYPE html><html><head></head><body><link href="./style.css"><script src="./script.js"></script></body></html>',
  );
  const htm = await save("legacy.htm", "<html><body>htm</body></html>");
  for (const id of [html.id, htm.id]) {
    const res = await head(`/api/versions/${id}/preview/`);
    assert.equal(res.status, 200);
    assert.equal(res.type, "text/html; charset=utf-8");
    assert.equal(res.nosniff, "nosniff");
  }
});

test("asset subrequests under /preview/*assetPath share the same mime mapping", async () => {
  const html = await save(
    "page.html",
    '<!DOCTYPE html><html><head></head><body><link href="./style.css"><script src="./script.js"></script></body></html>',
  );
  await save("style.css", "body{color:red}");
  await save("script.js", "console.log(1)");
  const css = await head(`/api/versions/${html.id}/preview/style.css`);
  assert.equal(css.status, 200);
  assert.equal(css.type, "text/css; charset=utf-8");
  const js = await head(`/api/versions/${html.id}/preview/script.js`);
  assert.equal(js.status, 200);
  assert.equal(js.type, "text/javascript; charset=utf-8");
});

test("preview keeps nosniff, refuses traversal, and /source stays text/plain", async () => {
  const html = await save("safe.html", "<html><body>safe</body></html>");
  await save("secret.txt", "top secret");
  assert.equal((await head(`/api/versions/${html.id}/preview/`)).nosniff, "nosniff");
  assert.equal((await head(`/api/versions/${html.id}/preview/..%2Fsecret.txt`)).status, 403);
  const source = await head(`/api/versions/${html.id}/source`);
  assert.equal(source.status, 200);
  assert.equal(source.type, "text/plain; charset=utf-8");
});
