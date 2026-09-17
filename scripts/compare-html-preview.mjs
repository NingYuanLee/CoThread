import { createDatabase, query } from "../server/db.js";
import { Service } from "../server/service.js";

const db = await createDatabase();
const service = new Service(db);
const [user] = await query(db, "SELECT id FROM users LIMIT 1");
if (!user) {
  console.error("no user");
  process.exit(1);
}
const sessionUser = { id: user.id, kind: "session" };

const rows = await query(
  db,
  `SELECT v.id, v.filename, a.title
   FROM versions v
   JOIN artifacts a ON a.id = v.artifact_id
   WHERE v.filename LIKE '%.html' OR v.filename LIKE '%.htm'
   ORDER BY v.created_at DESC
   LIMIT 5`,
);

if (!rows.length) {
  console.log("No HTML files in DB");
  await db.end();
  process.exit(0);
}

for (const row of rows) {
  const raw = await service.version(sessionUser, row.id);
  const sourceBuf = Buffer.isBuffer(raw.content)
    ? raw.content
    : Buffer.from(String(raw.content ?? ""), "utf8");
  const sourceText = sourceBuf.toString("utf8");

  const previewRoot = await service.versionPreview(sessionUser, row.id, "");
  const previewText = Buffer.isBuffer(previewRoot.content)
    ? previewRoot.content.toString("utf8")
    : String(previewRoot.content ?? "");

  const injectedBase = /<base\s/i.test(previewText) && !/<base\s/i.test(sourceText);
  const previewLonger = previewText.length - sourceText.length;

  console.log("---");
  console.log(row.filename, row.id);
  console.log("source bytes:", sourceBuf.length);
  console.log("preview bytes:", previewText.length, "delta:", previewLonger);
  console.log("injected base only in preview:", injectedBase);
  if (injectedBase) {
    const m = previewText.match(/<base\s[^>]*>/i);
    console.log("base tag:", m?.[0]);
  }

  const hrefs = [...sourceText.matchAll(/(?:href|src)=["']([^"']+)["']/gi)].map(
    (m) => m[1],
  );
  const unique = [...new Set(hrefs)].slice(0, 12);
  console.log("relative refs in source:", unique.filter((h) => !/^https?:/i.test(h) && !/^#/));

  for (const ref of unique.filter((h) => !/^https?:/i.test(h) && !/^#/.test(h) && !/^data:/i.test(h)).slice(0, 5)) {
    try {
      await service.versionPreview(sessionUser, row.id, ref.replace(/^\.\//, ""));
      console.log("  asset OK:", ref);
    } catch (e) {
      console.log("  asset FAIL:", ref, "-", e.message);
    }
  }
}

await db.end();
