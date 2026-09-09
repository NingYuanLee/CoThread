import { mkdir, writeFile, rm, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

// Match the pinned DSH JSONL backend's project-key encoding (UTF-16 units).
function projectKey(cwd) {
  const encoded = cwd.replace(/[\\/:]+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, (char) => "~" + char.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0"));
  return `--${(encoded.replace(/^-+/, "") || "root").slice(0, 251)}--`;
}

export function relocateSessionFiles(files, home) {
  const result = new Map();
  for (const [path, bytes] of Object.entries(files)) {
    if (path === "_cothread_context.json") continue;
    if (!/^[A-Za-z0-9_./-]+$/.test(path) || path.startsWith("/") || path.split("/").includes(".."))
      throw new Error("无效会话快照路径");
    let target = path, content = Buffer.from(bytes, "base64");
    if (path.endsWith("/session.jsonl")) {
      const end = content.indexOf(10);
      if (end < 0) throw new Error("无效会话快照头部");
      const header = JSON.parse(content.subarray(0, end).toString("utf8"));
      if (header.type !== "session" || !/^[0-9a-f-]{36}$/i.test(header.id)
        || path.split("/").at(-2) !== header.id) throw new Error("无效会话快照标识");
      // The old cwd may be a Windows path or a recycled cloud directory. DSH
      // validates it on this OS and keys its storage directory from that header.
      header.cwd = home;
      target = `${projectKey(home)}/${header.id}/session.jsonl`;
      content = Buffer.concat([Buffer.from(JSON.stringify(header) + "\n"), content.subarray(end + 1)]);
    }
    if (result.has(target)) throw new Error("会话快照包含重复标识");
    result.set(target, content);
  }
  return result;
}

export async function restoreSessionCheckpoint(files, home) {
  const records = relocateSessionFiles(files, home);
  const staged = join(home, `.restore-${randomUUID()}`);
  try {
    await mkdir(staged, { recursive: true });
    for (const [path, content] of records) {
      const target = join(staged, path);
      await mkdir(resolve(target, ".."), { recursive: true });
      await writeFile(target, content);
    }
    // DB is authoritative. Retaining the old cwd directory would leave two
    // logs with the same session ID, making later resume ambiguous.
    await rm(join(home, "sessions"), { recursive: true, force: true });
    await rename(staged, join(home, "sessions"));
  } finally { await rm(staged, { recursive: true, force: true }); }
}
