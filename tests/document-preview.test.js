import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { query } from "../server/db.js";
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
  assert.match(text, new RegExp(`base href="/api/versions/${html.id}/preview/"`));
  assert.match(text, /\.\/style\.css/);
  assert.equal((await service.versionPreview(user, html.id, "style.css")).mime, "text/css; charset=utf-8");
  assert.equal((await service.versionPreview(user, html.id, "script.js")).mime, "text/javascript; charset=utf-8");
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
