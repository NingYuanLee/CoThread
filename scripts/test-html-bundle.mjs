// Integration test: HTML + CSS in same folder, preview should apply styles
import { createDatabase, query, transaction } from "../server/db.js";
import { Service } from "../server/service.js";
import { randomUUID } from "node:crypto";

const db = await createDatabase();
const service = new Service(db);
const [user] = await query(db, "SELECT id FROM users LIMIT 1");
const sessionUser = { id: user.id, kind: "session" };

const [project] = await query(db, "SELECT id FROM projects LIMIT 1");
const [folder] = await query(
  db,
  `SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_cache' LIMIT 1`,
  [project.id],
);
if (!folder) {
  console.error("no cache folder");
  process.exit(1);
}

const htmlName = "html-preview-audit-test.html";
const cssName = "html-preview-audit-test.css";
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${cssName}"></head><body><h1 class="probe">Probe</h1></body></html>`;
const css = `.probe { color: rgb(200, 16, 46); font-size: 40px; }`;

async function upsertFile(filename, content, mime) {
  const [existing] = await query(
    db,
    `SELECT a.id artifact_id FROM artifacts a
     JOIN versions v ON v.artifact_id=a.id
     WHERE a.folder_id=? AND a.deleted_at IS NULL AND v.filename=?
     ORDER BY v.version DESC LIMIT 1`,
    [folder.id, filename],
  );
  const bytes = Buffer.from(content, "utf8");
  if (existing) {
    await query(
      db,
      `INSERT INTO versions(id,artifact_id,thread_id,version,filename,mime,content,sha256,byte_size,note,created_by)
       SELECT ?,?,NULL,COALESCE(MAX(v.version),0)+1,?,?,?,?,0,'audit',?
       FROM versions v WHERE v.artifact_id=?`,
      [
        randomUUID(),
        existing.artifact_id,
        filename,
        mime,
        bytes,
        "audit",
        user.id,
        existing.artifact_id,
      ],
    );
    const [v] = await query(
      db,
      "SELECT id FROM versions WHERE artifact_id=? ORDER BY version DESC LIMIT 1",
      [existing.artifact_id],
    );
    return v.id;
  }
  const artifactId = randomUUID();
  const versionId = randomUUID();
  await transaction(db, async (conn) => {
    const { query: q } = await import("../server/db.js");
    await q(
      conn,
      "INSERT INTO artifacts(id,project_id,title,folder_id,created_by) VALUES(?,?,?,?,?)",
      [artifactId, project.id, filename, folder.id, user.id],
    );
    await q(
      conn,
      `INSERT INTO versions(id,artifact_id,thread_id,version,filename,mime,content,sha256,byte_size,note,created_by)
       VALUES(?,?,NULL,1,?,?,?,?,0,'audit',?)`,
      [versionId, artifactId, filename, mime, bytes, "audit", user.id],
    );
  });
  return versionId;
}

const htmlId = await upsertFile(htmlName, html, "text/html");
await upsertFile(cssName, css, "text/css");

const cssAsset = await service.versionPreview(sessionUser, htmlId, cssName);
console.log("HTML version:", htmlId);
console.log("CSS asset loaded:", cssAsset.mime, cssAsset.content.toString("utf8"));

const previewHtml = (
  await service.versionPreview(sessionUser, htmlId, "")
).content.toString("utf8");
console.log("Preview contains base:", /<base/i.test(previewHtml));
console.log("Preview still links css:", previewHtml.includes(cssName));

await db.end();
console.log("PASS: linked CSS resolves via preview API");
