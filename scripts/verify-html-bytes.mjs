import { createDatabase, query } from "../server/db.js";
import { Service } from "../server/service.js";

const versionId = process.argv[2] || "4db2590e-bad9-4ce7-bd14-9e7c8fc616a4";
const db = await createDatabase();
const service = new Service(db);
const [user] = await query(db, "SELECT id FROM users LIMIT 1");
const u = { id: user.id, kind: "session" };

const raw = await service.version(u, versionId);
const source = await service.versionSource(u, versionId);
const rawBuf = Buffer.isBuffer(raw.content) ? raw.content : Buffer.from(String(raw.content));
const srcBuf = Buffer.isBuffer(source.content) ? source.content : Buffer.from(String(source.content));

console.log("raw vs /source identical:", rawBuf.equals(srcBuf));
console.log("raw mime field:", raw.mime);
console.log("source mime:", source.mime);

const preview = await service.versionPreview(u, versionId, "");
const prevText = Buffer.isBuffer(preview.content)
  ? preview.content.toString("utf8")
  : String(preview.content);
const stripped = prevText.replace(/<base\s[^>]*>\s*/i, "");
const rawText = rawBuf.toString("utf8");
console.log("preview minus base equals raw:", stripped === rawText);

await db.end();
