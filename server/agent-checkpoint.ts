import { mkdir, readdir, readFile, writeFile, rm, rename, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

/** 会话快照：相对路径 → base64 字节。 */
export type SessionFileMap = Record<string, string>;

/** 去重时被移动的一项。 */
export type MovedSessionLog = { id: string; kept: string; from: string; to: string };

/** 一个会话目录里日志的体量与最新写入时间。 */
type SessionLogFacts = { bytes: number; newest: number };

/** 会话目录的一份副本（含所在项目目录）。 */
type SessionCopy = SessionLogFacts & { project: string; dir: string };

// Match the pinned DSH JSONL backend's project-key encoding (UTF-16 units).
function projectKey(cwd: string): string {
  const encoded = cwd
    .replace(/[\\/:]+/g, "-")
    .replace(
      /[^A-Za-z0-9._-]/g,
      (char) => "~" + char.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0"),
    );
  return `--${(encoded.replace(/^-+/, "") || "root").slice(0, 251)}--`;
}

export function relocateSessionFiles(files: SessionFileMap, home: string): Map<string, Buffer> {
  const result = new Map<string, Buffer>();
  for (const [path, bytes] of Object.entries(files)) {
    if (path === "_cothread_context.json") continue;
    if (path.startsWith("_attachments/")) continue;
    if (!/^[A-Za-z0-9_./-]+$/.test(path) || path.startsWith("/") || path.split("/").includes(".."))
      throw new Error("无效会话快照路径");
    let target = path;
    let content = Buffer.from(bytes, "base64");
    // 会话日志可以是 session.jsonl，也可以是升级后的 session.vN.jsonl；
    // 只认前者会让旧路径的代数文件在恢复时原样写回（去重后又被复活）。
    const generation = path.match(/\/(session(?:\.v\d+)?\.jsonl)$/);
    if (generation) {
      const end = content.indexOf(10);
      if (end < 0) throw new Error("无效会话快照头部");
      const header = JSON.parse(content.subarray(0, end).toString("utf8"));
      if (
        header.type !== "session" ||
        !/^[0-9a-f-]{36}$/i.test(header.id) ||
        path.split("/").at(-2) !== header.id
      )
        throw new Error("无效会话快照标识");
      // The old cwd may be a Windows path or a recycled cloud directory. DSH
      // validates it on this OS and keys its storage directory from that header.
      header.cwd = home;
      target = `${projectKey(home)}/${header.id}/${generation[1]}`;
      content = Buffer.concat([
        Buffer.from(JSON.stringify(header) + "\n"),
        content.subarray(end + 1),
      ]);
    }
    if (result.has(target)) throw new Error("会话快照包含重复标识");
    result.set(target, content);
  }
  return result;
}

const SESSION_DIR_NAME =
  /^(?:session-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 一个会话目录里是否有 DSH 的 JSONL 日志，并给出体量与最新写入时间。 */
async function sessionLogFacts(dir: string): Promise<SessionLogFacts | null> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  let bytes = 0;
  let newest = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith("session.")) continue;
    const stats = await stat(join(dir, entry.name)).catch(() => null);
    if (!stats) continue;
    bytes += stats.size;
    newest = Math.max(newest, stats.mtimeMs);
  }
  return bytes > 0 ? { bytes, newest } : null;
}

/**
 * DSH 的 JSONL 后端按会话头里的 cwd 决定项目目录 key；同一个 home 改名或搬迁后，
 * 同一个 session id 会同时留在新旧两个项目目录里，findLog 遇到重复直接抛错，
 * 之后每次运行都在 model_run 前失败。开跑前收敛成一份，其余移入 trash 以便回滚。
 *
 * 保留策略：日志体量最大的一份（内容最完整），相同则取最新写入，再相同按目录名。
 * 返回被移动的项，空数组表示没有重复；
 */
export async function dedupeSessionLogs(
  home: string,
  { trashRoot, dryRun = false }: { trashRoot?: string; dryRun?: boolean } = {},
): Promise<MovedSessionLog[]> {
  const sessions = join(home, "sessions");
  const projectDirs = await readdir(sessions, { withFileTypes: true }).catch(() => []);
  const copiesById = new Map<string, SessionCopy[]>();
  for (const projectEntry of projectDirs) {
    if (!projectEntry.isDirectory()) continue;
    const projectDir = join(sessions, projectEntry.name);
    const children = await readdir(projectDir, { withFileTypes: true }).catch(() => []);
    for (const child of children) {
      if (!child.isDirectory() || !SESSION_DIR_NAME.test(child.name)) continue;
      const dir = join(projectDir, child.name);
      const facts = await sessionLogFacts(dir);
      if (!facts) continue;
      const copies = copiesById.get(child.name) || [];
      copies.push({ project: projectEntry.name, dir, ...facts });
      copiesById.set(child.name, copies);
    }
  }
  const trash = join(trashRoot || join(home, ".trash"), `session-dedupe-${Date.now()}`);
  const expectedProject = projectKey(home);
  const moved: MovedSessionLog[] = [];
  for (const [id, copies] of copiesById) {
    copies.sort(
      (left, right) =>
        Number(right.project === expectedProject) - Number(left.project === expectedProject) ||
        right.bytes - left.bytes ||
        right.newest - left.newest ||
        (left.project < right.project ? -1 : left.project > right.project ? 1 : 0),
    );
    const [keep, ...stale] = copies;
    const targetDir = join(sessions, expectedProject, id);
    for (const copy of stale) {
      const target = join(trash, copy.project, id);
      if (!dryRun) {
        await mkdir(resolve(target, ".."), { recursive: true });
        await rename(copy.dir, target);
      }
      moved.push({ id, kept: keep.dir, from: copy.dir, to: target });
    }
    // 保留下来的日志也必须落在当前 home 推算出的项目目录下并把 header.cwd 改回来：
    // 旧 key 的日志会被 DSH 当成另一个项目目录，下一次运行就再分裂出一份。
    if (keep.dir === targetDir) continue;
    if (!dryRun) {
      await rewriteSessionCwd(keep.dir, home);
      await mkdir(join(sessions, expectedProject), { recursive: true });
      try {
        await stat(targetDir);
        const parked = join(trash, expectedProject, id);
        await mkdir(resolve(parked, ".."), { recursive: true });
        await rename(targetDir, parked);
      } catch {
        /* 目标位置没有同名目录 */
      }
      await rename(keep.dir, targetDir);
    }
    moved.push({ id, kept: targetDir, from: keep.dir, to: targetDir });
  }
  return moved;
}

/** 改写会话目录里代数文件首行的 cwd，其余字节保持不变。 */
async function rewriteSessionCwd(dir: string, home: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
    const path = join(dir, entry.name);
    const text = await readFile(path, "utf8");
    const end = text.indexOf("\n");
    if (end < 0) continue;
    let header: { type?: string; cwd?: string } | undefined;
    try {
      header = JSON.parse(text.slice(0, end));
    } catch {
      continue;
    }
    if (header?.type !== "session" || header.cwd === home) continue;
    header.cwd = home;
    await writeFile(path, JSON.stringify(header) + text.slice(end));
  }
}

/** True when home/sessions already holds a log for this session id. */
export async function hasSessionLog(home: string, sessionId: unknown): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(String(sessionId || ""))) return false;
  const entries = await readdir(join(home, "sessions"), { recursive: true }).catch(() => []);
  return entries.some((entry) =>
    String(entry)
      .split(/[\\/]/)
      .includes(sessionId as string),
  );
}

export async function restoreSessionCheckpoint(files: SessionFileMap, home: string): Promise<void> {
  const records = relocateSessionFiles(files, home);
  const attachments = Object.entries(files).filter(([path]) => path.startsWith("_attachments/"));
  for (const [path] of attachments) {
    const relative = path.slice("_attachments/".length);
    if (!/^v1\/[A-Za-z0-9_./-]+$/.test(relative) || relative.split("/").includes(".."))
      throw new Error("无效附件快照路径");
  }
  const staged = join(home, `.restore-${randomUUID()}`);
  try {
    await mkdir(staged, { recursive: true });
    for (const [path, content] of records) {
      const target = join(staged, path);
      await mkdir(resolve(target, ".."), { recursive: true });
      await writeFile(target, content);
    }
    // The store is content-addressed and may also hold images from an unsaved
    // attempt. Restore the snapshot additively, without deleting those files.
    for (const [path, bytes] of attachments) {
      const target = join(home, "attachments", path.slice("_attachments/".length));
      await mkdir(resolve(target, ".."), { recursive: true });
      const content = Buffer.from(bytes, "base64");
      try {
        await writeFile(target, content, { flag: "wx" });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (!(await readFile(target)).equals(content))
          throw new Error(`附件快照与已有文件内容不一致: ${path}`);
      }
    }
    // DB is authoritative. Retaining the old cwd directory would leave two
    // logs with the same session ID, making later resume ambiguous.
    await rm(join(home, "sessions"), { recursive: true, force: true });
    await rename(staged, join(home, "sessions"));
  } finally {
    await rm(staged, { recursive: true, force: true });
  }
}
