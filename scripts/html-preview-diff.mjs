import { createDatabase, query } from "../server/db.js";
import { Service } from "../server/service.js";

const versionId = process.argv[2] || "4db2590e-bad9-4ce7-bd14-9e7c8fc616a4";

const db = await createDatabase();
const service = new Service(db);
const [user] = await query(db, "SELECT id FROM users LIMIT 1");
const sessionUser = { id: user.id, kind: "session" };

const raw = await service.version(sessionUser, versionId);
const source = Buffer.isBuffer(raw.content)
  ? raw.content.toString("utf8")
  : String(raw.content ?? "");
const preview = (
  await service.versionPreview(sessionUser, versionId, "")
).content.toString("utf8");

function stripPreviewInjections(html) {
  return html
    .replace(/<base\s[^>]*>/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

const normSource = stripPreviewInjections(source);
const normPreview = stripPreviewInjections(preview);

console.log("filename:", raw.filename);
console.log("source length:", source.length);
console.log("preview length:", preview.length);
console.log("normalized equal:", normSource === normPreview);
if (normSource !== normPreview) {
  console.log("--- source (first 400) ---");
  console.log(source.slice(0, 400));
  console.log("--- preview (first 400) ---");
  console.log(preview.slice(0, 400));
}

// Simulate browser base resolution for a sample external ref
const sampleHtml = `<!DOCTYPE html><html><head><link rel="stylesheet" href="style.css"></head><body><p>hi</p></body></html>`;
const withBase = preview.replace(
  /<head(\s[^>]*)?>/i,
  `<head$1><base href="/api/versions/${versionId}/preview/">`,
);
const baseMatch = withBase.match(/<base\s[^>]*href=["']([^"']+)["']/i);
console.log("sample base href:", baseMatch?.[1]);

await db.end();
