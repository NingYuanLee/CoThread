// B1/B2 的 HTTP 层最小验证：预览主响应与 /preview/*assetPath 资源子请求必须按扩展名给出 Content-Type。
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/auth.js";
import { query } from "../server/db.js";
import { libraryChange } from "../server/library.js";
import { Service } from "../server/service.js";
import { testDatabase } from "./database.js";

const password = "Test-only!Password-" + randomUUID();

let database, db, service, server, base, cookie, user, thread, project;

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
  project = await service.createProject(user, { name: "预览 HTTP" });
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

test("preview nested assets resolve through sibling library folders", async () => {
  const [official] = await query(
    db,
    "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' AND parent_id IS NULL LIMIT 1",
    [project.id],
  );
  const html = await service.uploadOfficialDocument(user, project.id, {
    folderId: official.id,
    title: "嵌套预览 HTTP",
    filename: "page.html",
    mime: "text/plain",
    contentBase64: Buffer.from(
      '<!DOCTYPE html><html><head></head><body><link href="./assets/style.css"></body></html>',
    ).toString("base64"),
  });
  const assets = await libraryChange(service, user, project.id, "folder", null, {
    name: "assets",
    parentId: official.id,
  });
  await service.uploadOfficialDocument(user, project.id, {
    folderId: assets.id,
    title: "样式",
    filename: "style.css",
    mime: "text/plain",
    contentBase64: Buffer.from("body{color:navy}").toString("base64"),
  });
  const css = await head(`/api/versions/${html.id}/preview/assets/style.css`);
  assert.equal(css.status, 200);
  assert.equal(css.type, "text/css; charset=utf-8");
});

test("preview serves html navigations and nested iframe pages", async () => {
  const [official] = await query(
    db,
    "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' AND parent_id IS NULL LIMIT 1",
    [project.id],
  );
  const html = await service.uploadOfficialDocument(user, project.id, {
    folderId: official.id,
    title: "站点 HTTP",
    filename: "index.html",
    mime: "text/plain",
    contentBase64: Buffer.from(
      '<!DOCTYPE html><html><body><a href="./about.html">关于</a><iframe src="./embed.html"></iframe></body></html>',
    ).toString("base64"),
  });
  await service.uploadOfficialDocument(user, project.id, {
    folderId: official.id,
    title: "关于 HTTP",
    filename: "about.html",
    mime: "text/plain",
    contentBase64: Buffer.from("<html><body>about</body></html>").toString("base64"),
  });
  await service.uploadOfficialDocument(user, project.id, {
    folderId: official.id,
    title: "嵌套 HTTP",
    filename: "embed.html",
    mime: "text/plain",
    contentBase64: Buffer.from("<html><body>embed</body></html>").toString("base64"),
  });
  const about = await head(`/api/versions/${html.id}/preview/about.html`);
  assert.equal(about.status, 200);
  assert.equal(about.type, "text/html; charset=utf-8");
  const embed = await head(`/api/versions/${html.id}/preview/embed.html`);
  assert.equal(embed.status, 200);
  assert.equal(embed.type, "text/html; charset=utf-8");
});

test("sandboxed preview assets authenticate with the signed URL ticket, not cookies", async () => {
  const html = await save(
    "ticket.html",
    '<!DOCTYPE html><html><head></head><body><link href="./ticket.css"></body></html>',
  );
  await save("ticket.css", "body{color:navy}");
  const page = await fetch(`${base}/api/versions/${html.id}/preview/`, {
    headers: { Cookie: cookie },
  });
  assert.equal(page.status, 200);
  const body = await page.text();
  const href = body.match(/base href="([^"]+)"/)?.[1];
  assert.match(href || "", /\/preview\/~t~[^/]+\//);
  const cssPath = new URL("./ticket.css", `http://127.0.0.1${href}`).pathname;
  const css = await fetch(`${base}${cssPath}`);
  assert.equal(css.status, 200);
  assert.equal(css.headers.get("content-type"), "text/css; charset=utf-8");
  assert.equal(await css.text(), "body{color:navy}");
  const denied = await fetch(`${base}/api/versions/${html.id}/preview/ticket.css`);
  assert.equal(denied.status, 401);
});

test("preview document redirects onto a ticketed URL so nested iframes can load", async () => {
  const html = await save(
    "frames.html",
    '<!DOCTYPE html><html><body><iframe src="./inner.html"></iframe></body></html>',
  );
  await save("inner.html", "<html><body>inner</body></html>");
  const bounce = await fetch(`${base}/api/versions/${html.id}/preview/`, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  assert.equal(bounce.status, 302);
  const location = bounce.headers.get("location") || "";
  assert.match(location, new RegExp(`/api/versions/${html.id}/preview/~t~[^/]+/$`));
  const innerPath = new URL("./inner.html", `http://127.0.0.1${location}`).pathname;
  const inner = await fetch(`${base}${innerPath}`);
  assert.equal(inner.status, 200);
  assert.equal(inner.headers.get("content-type"), "text/html; charset=utf-8");
  assert.match(await inner.text(), /inner/);
});

test("source serves svg as image/svg+xml for file-tree icons", async () => {
  const svg = await save(
    "mark.svg",
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="#3a7"/></svg>',
  );
  const res = await head(`/api/versions/${svg.id}/source`);
  assert.equal(res.status, 200);
  assert.equal(res.type, "image/svg+xml");
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
