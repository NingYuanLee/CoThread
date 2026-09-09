import { resolve, relative, sep } from "node:path";
import { rename, mkdir } from "node:fs/promises";
import { createDatabase, query } from "../server/db.js";
import { releaseSandbox } from "../server/agent-sandbox.js";
import { digest } from "../server/auth.js";
const db = await createDatabase();
try {
  const [thread] = await query(
    db,
    "SELECT t.id FROM threads t JOIN users u ON u.id=t.created_by WHERE t.title='Agent 能力验收' AND u.email=? AND t.status='active' LIMIT 1",
    [process.env.ADMIN_EMAIL],
  );
  if (!thread) throw new Error("缺少专用验收迭代");
  const [active] = await query(
    db,
    "SELECT r.message_id FROM assistant_replies r JOIN messages m ON m.id=r.message_id WHERE m.thread_id=? AND r.status IN ('queued','running')",
    [thread.id],
  );
  if (active) throw new Error("验收迭代存在活动任务");
  const [session] = await query(
    db,
    "SELECT checkpoint,sandbox_id FROM agent_sessions WHERE thread_id=?",
    [thread.id],
  );
  if (!session?.checkpoint?.length) throw new Error("MySQL 会话快照不存在");
  await releaseSandbox(db, thread.id);
  const root = resolve(".local");
  const source = resolve(root, "agents", thread.id);
  const target = resolve(root, "recovery-check", thread.id + "-" + Date.now());
  for (const path of [source, target])
    if (relative(root, path).startsWith("..") || path === root)
      throw new Error("路径不属于本项目");
  await mkdir(resolve(target, ".."), { recursive: true });
  await rename(source, target);
  const versions = await query(
    db,
    "SELECT v.content,v.sha256 FROM versions v JOIN artifacts a ON a.id=v.artifact_id WHERE a.title=? AND a.project_id=(SELECT project_id FROM threads WHERE id=?)",
    ["Agent 求和示例", thread.id],
  );
  if (
    versions.length < 2 ||
    versions.some((v) => digest(v.content) !== v.sha256)
  )
    throw new Error("已保存版本校验失败");
  console.log({
    threadId: thread.id,
    localCacheMoved: true,
    sandboxReleased: true,
    mysqlCheckpointBytes: session.checkpoint.length,
    preservedVersions: versions.length,
  });
} finally {
  await db.end();
}
