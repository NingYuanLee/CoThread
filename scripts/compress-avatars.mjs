import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDatabase, query } from "../server/db.js";

// Preview by default. --apply backs up originals before optimistic updates.
const apply = process.argv.includes("--apply");
const db = await createDatabase();
try {
  const users = await query(db, "SELECT id,avatar FROM users WHERE avatar IS NOT NULL");
  const changes = [];
  for (const user of users) {
    const compressed = await new Promise((resolveOutput, reject) => {
      const child = spawn("python", [resolve("scripts/compress-avatars.py")], { windowsHide: true });
      let output = "";
      child.stdout.on("data", (chunk) => { output += chunk; });
      child.stderr.resume();
      child.on("error", reject);
      child.on("close", (code) => code === 0 ? resolveOutput(output.trim()) : reject(new Error("Avatar compression failed")));
      child.stdin.end(user.avatar);
    });
    if (compressed.length < user.avatar.length) changes.push({ ...user, compressed });
  }
  const before = changes.reduce((n, u) => n + Buffer.byteLength(u.avatar), 0);
  const after = changes.reduce((n, u) => n + Buffer.byteLength(u.compressed), 0);
  let updated = 0;
  if (apply && changes.length) {
    const folder = resolve(".local", `avatar-backup-${Date.now()}`);
    await mkdir(folder, { recursive: true });
    await writeFile(resolve(folder, "originals.json"), JSON.stringify(changes.map(({ id, avatar }) => ({ id, avatar }))));
    for (const { id, avatar, compressed } of changes) {
      const result = await query(db, "UPDATE users SET avatar=? WHERE id=? AND avatar=?", [compressed, id, avatar]);
      updated += result.affectedRows;
    }
  }
  console.log({ mode: apply ? "apply" : "preview", candidates: changes.length, updated, before, after });
} finally { await db.end(); }
