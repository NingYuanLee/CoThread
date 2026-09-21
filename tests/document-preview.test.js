import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { query } from "../server/db.js";
import { libraryChange } from "../server/library.js";
import { Service } from "../server/service.js";
import { testDatabase } from "./database.js";

let database, db, service, user, project, thread;

before(async () => {
  database = await testDatabase();
  db = database.db;
  service = new Service(db);
  user = { id: randomUUID(), kind: "session", name: "预览成员" };
  await query(db, "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
    [user.id, `${user.id}@preview.test`, user.name, "unused"]);
  project = await service.createProject(user, { name: "HTML 预览" });
  thread = await service.createThread(user, project.id, { title: "预览迭代" });
});

after(async () => { await database?.close(); });

async function save(filename, body, mime = "text/plain") {
  const agent = { ...user, kind: "agent" };
  return service.submitVersion(agent, thread.id, {
    title: filename,
    filename,
    mime,
    contentBase64: Buffer.from(body).toString("base64"),
  });
}

test("versionPreview uses html css js types even when stored mime is text/plain", async () => {
  const htmlBody = `<!DOCTYPE html><html><head></head><body><link href="./style.css"><script src="./script.js"></script></body></html>`;
  const html = await save("index.html", htmlBody);
  await save("style.css", "body{color:red}");
  await save("script.js", "console.log(1)");
  const preview = await service.versionPreview(user, html.id, "");
  assert.equal(preview.mime, "text/html; charset=utf-8");
  const text = preview.content.toString("utf8");
  assert.match(text, new RegExp(`base href="/api/versions/${html.id}/preview/~t~[^/"]+/"`));
  assert.match(text, /data-cothread-preview-console/);
  assert.match(text, /\.\/style\.css/);
  assert.equal((await service.versionPreview(user, html.id, "style.css")).mime, "text/css; charset=utf-8");
  assert.equal((await service.versionPreview(user, html.id, "script.js")).mime, "text/javascript; charset=utf-8");
});

test("versionSource can return a byte prefix for large text files", async () => {
  const body = `${"a".repeat(4000)}TAIL`;
  const file = await save("bundle.js", body);
  const prefix = await service.versionSource(user, file.id, { maxBytes: 80 });
  assert.equal(prefix.content.length, 80);
  assert.equal(prefix.content.toString("utf8"), "a".repeat(80));
  const full = await service.versionSource(user, file.id);
  assert.equal(full.content.toString("utf8"), body);
});

test("versionPreview walks sibling library folders for nested assets", async () => {
  const [official] = await query(
    db,
    "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' AND parent_id IS NULL LIMIT 1",
    [project.id],
  );
  const html = await service.uploadOfficialDocument(user, project.id, {
    folderId: official.id,
    title: "嵌套预览",
    filename: "index.html",
    mime: "text/plain",
    contentBase64: Buffer.from(
      '<!DOCTYPE html><html><head></head><body><link href="./assets/css/style.css"><img src="assets/logo.png"></body></html>',
    ).toString("base64"),
  });
  const assets = await libraryChange(service, user, project.id, "folder", null, {
    name: "assets",
    parentId: official.id,
  });
  const cssFolder = await libraryChange(service, user, project.id, "folder", null, {
    name: "css",
    parentId: assets.id,
  });
  await service.uploadOfficialDocument(user, project.id, {
    folderId: cssFolder.id,
    title: "样式",
    filename: "style.css",
    mime: "text/plain",
    contentBase64: Buffer.from("body{color:navy}").toString("base64"),
  });
  await service.uploadOfficialDocument(user, project.id, {
    folderId: assets.id,
    title: "标志",
    filename: "logo.png",
    mime: "image/png",
    contentBase64: Buffer.from("png").toString("base64"),
  });
  await service.uploadOfficialDocument(user, project.id, {
    folderId: official.id,
    title: "同名干扰",
    filename: "style.css",
    mime: "text/plain",
    contentBase64: Buffer.from("body{color:red}").toString("base64"),
  });
  const css = await service.versionPreview(user, html.id, "assets/css/style.css");
  assert.equal(css.mime, "text/css; charset=utf-8");
  assert.equal(css.content.toString("utf8"), "body{color:navy}");
  const logo = await service.versionPreview(user, html.id, "./assets/logo.png");
  assert.equal(logo.mime, "image/png");
  assert.equal(logo.content.toString("utf8"), "png");
  await assert.rejects(
    service.versionPreview(user, html.id, "missing/style.css"),
    (error) => error.status === 404,
  );
});

test("versionPreview serves linked pages and nested iframe html with directory base", async () => {
  const [official] = await query(
    db,
    "SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' AND parent_id IS NULL LIMIT 1",
    [project.id],
  );
  const html = await service.uploadOfficialDocument(user, project.id, {
    folderId: official.id,
    title: "站点首页",
    filename: "index.html",
    mime: "text/plain",
    contentBase64: Buffer.from(
      '<!DOCTYPE html><html><body><a href="./about.html" target="_blank">关于</a><iframe src="embed/widget.html"></iframe></body></html>',
    ).toString("base64"),
  });
  await service.uploadOfficialDocument(user, project.id, {
    folderId: official.id,
    title: "关于",
    filename: "about.html",
    mime: "text/plain",
    contentBase64: Buffer.from(
      '<html><head></head><body><link href="./about.css"><a href="index.html">回首页</a></body></html>',
    ).toString("base64"),
  });
  await service.uploadOfficialDocument(user, project.id, {
    folderId: official.id,
    title: "关于样式",
    filename: "about.css",
    mime: "text/plain",
    contentBase64: Buffer.from("body{color:green}").toString("base64"),
  });
  const embed = await libraryChange(service, user, project.id, "folder", null, {
    name: "embed",
    parentId: official.id,
  });
  await service.uploadOfficialDocument(user, project.id, {
    folderId: embed.id,
    title: "嵌套页",
    filename: "widget.html",
    mime: "text/plain",
    contentBase64: Buffer.from(
      '<html><body><img src="./logo.png"><a href="../about.html" target="_top">关于</a></body></html>',
    ).toString("base64"),
  });
  await service.uploadOfficialDocument(user, project.id, {
    folderId: embed.id,
    title: "嵌套图",
    filename: "logo.png",
    mime: "image/png",
    contentBase64: Buffer.from("png").toString("base64"),
  });
  const home = await service.versionPreview(user, html.id, "");
  assert.match(home.content.toString("utf8"), /target="_self"/);
  const about = await service.versionPreview(user, html.id, "about.html");
  assert.equal(about.mime, "text/html; charset=utf-8");
  assert.match(
    about.content.toString("utf8"),
    new RegExp(`base href="/api/versions/${html.id}/preview/~t~[^/"]+/" target="_self"`),
  );
  assert.equal((await service.versionPreview(user, html.id, "about.css")).mime, "text/css; charset=utf-8");
  const widget = await service.versionPreview(user, html.id, "embed/widget.html");
  assert.equal(widget.mime, "text/html; charset=utf-8");
  const widgetText = widget.content.toString("utf8");
  assert.match(
    widgetText,
    new RegExp(`base href="/api/versions/${html.id}/preview/~t~[^/"]+/embed/" target="_self"`),
  );
  assert.match(widgetText, /target="_self"/);
  assert.equal(widgetText.includes('target="_top"'), false);
  const logo = await service.versionPreview(user, html.id, "embed/logo.png");
  assert.equal(logo.mime, "image/png");
  const cssViaParent = await service.versionPreview(user, html.id, "embed/../about.css");
  assert.equal(cssViaParent.content.toString("utf8"), "body{color:green}");
});

test("versionPreview rejects path traversal", async () => {
  const html = await save("page.html", "<html><body>ok</body></html>");
  await assert.rejects(service.versionPreview(user, html.id, "../secret.txt"), (error) => error.status === 403);
});

test("markdown png and pdf stay outside html preview", async () => {
  const md = await save("notes.md", "# hi");
  const png = await save("dot.png", "png", "image/png");
  const pdf = await save("doc.pdf", "%PDF", "application/pdf");
  await assert.rejects(service.versionPreview(user, md.id, ""), (error) => error.status === 404);
  await assert.rejects(service.versionPreview(user, png.id, ""), (error) => error.status === 404);
  await assert.rejects(service.versionPreview(user, pdf.id, ""), (error) => error.status === 404);
  const [mdRow] = await query(db, "SELECT mime FROM versions WHERE id=?", [md.id]);
  assert.equal(mdRow.mime, "text/markdown");
});
