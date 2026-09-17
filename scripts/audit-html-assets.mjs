import { createDatabase, query } from "../server/db.js";
import { Service } from "../server/service.js";

const db = await createDatabase();
const service = new Service(db);
const [user] = await query(db, "SELECT id FROM users LIMIT 1");
const sessionUser = { id: user.id, kind: "session" };

const htmlRows = await query(
  db,
  `SELECT v.id, v.filename, a.folder_id, a.project_id, a.title
   FROM versions v
   JOIN artifacts a ON a.id = v.artifact_id
   WHERE v.filename LIKE '%.html' OR v.filename LIKE '%.htm'
   ORDER BY v.created_at DESC`,
);

console.log(`HTML versions: ${htmlRows.length}\n`);

for (const row of htmlRows) {
  const raw = await service.version(sessionUser, row.id);
  const source = Buffer.isBuffer(raw.content)
    ? raw.content.toString("utf8")
    : String(raw.content ?? "");

  const refs = [...source.matchAll(/(?:href|src)=["']([^"']+)["']/gi)].map(
    (m) => m[1],
  );
  const rel = refs.filter(
    (h) =>
      !/^https?:/i.test(h) &&
      !/^#/.test(h) &&
      !/^data:/i.test(h) &&
      !/^mailto:/i.test(h),
  );

  console.log("=".repeat(60));
  console.log(row.title, "·", row.filename);
  console.log("version:", row.id);
  console.log("folder:", row.folder_id || "(none)");

  const preview = (
    await service.versionPreview(sessionUser, row.id, "")
  ).content.toString("utf8");
  const onlyBaseDiff =
    preview.replace(/<base\s[^>]*>/i, "").replace(/\s+/g, " ") ===
    source.replace(/\s+/g, " ");

  console.log("preview mutation: only <base> inject:", onlyBaseDiff);

  if (!rel.length) {
    console.log("external refs: (none — inline only)");
    console.log("verdict: preview should match file when opened locally");
    continue;
  }

  console.log("relative refs:", rel);
  for (const ref of rel) {
    const path = ref.replace(/^\.\//, "");
    try {
      const asset = await service.versionPreview(sessionUser, row.id, path);
      console.log(
        `  OK ${ref} → ${asset.filename} (${asset.content.length} bytes, ${asset.mime})`,
      );
    } catch (e) {
      console.log(`  FAIL ${ref} → ${e.message}`);
    }
  }

  const fails = [];
  for (const ref of rel) {
    const path = ref.replace(/^\.\//, "");
    try {
      await service.versionPreview(sessionUser, row.id, path);
    } catch {
      fails.push(ref);
    }
  }
  if (fails.length) {
    console.log(
      "verdict: RENDERER+LIBRARY — preview cannot match file; missing assets in same folder",
    );
  } else if (rel.some((h) => h.startsWith("/"))) {
    console.log(
      "verdict: FILE — root-absolute paths (/…) resolve to app host, not document folder",
    );
  } else {
    console.log("verdict: assets resolvable; check sandbox/scripts if still differs");
  }
}

await db.end();
