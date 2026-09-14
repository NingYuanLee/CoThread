import { query } from "./db.js";
import { agentSession } from "./agent-session.js";
import { currentMakersSandbox, makersWorkspace } from "./makers-sandbox.js";
import { LocalSandbox } from "./local-sandbox.js";

export const shellQuote = (value) => `'${value.replace(/'/g, `'"'"'`)}'`;
const handles = new Map();
export async function acquireSandbox(
  db,
  threadId,
  progress,
  provider = LocalSandbox,
) {
  const { table, key, id: workspaceId } = agentSession(threadId);
  if (currentMakersSandbox() || process.env.COTHREAD_MAKERS === "true") {
    await progress("正在准备 Makers 沙箱工作区");
    return makersWorkspace(workspaceId);
  }
  let sandbox = handles.get(workspaceId);
  if (sandbox) {
    try {
      await sandbox.setTimeout(900000);
      return sandbox;
    } catch (error) {
      if (!/not found|not running|expired|does not exist/i.test(error.message))
        throw error;
      handles.delete(workspaceId);
    }
  }
  const [record] = await query(
    db,
    `SELECT sandbox_id FROM ${table} WHERE ${key}=?`,
    [workspaceId],
  );
  if (record?.sandbox_id) {
    try {
      sandbox = await provider.connect(record.sandbox_id);
    } catch (error) {
      if (!/not found|not running|expired|does not exist/i.test(error.message))
        throw error;
    }
  }
  if (!sandbox) {
    await progress("正在创建本机工作区");
    sandbox = await provider.create();
  }
  await sandbox.files.makeDir(`/home/user/cothread/${workspaceId}`);
  await query(db, `UPDATE ${table} SET sandbox_id=? WHERE ${key}=?`, [
    sandbox.sandboxId,
    workspaceId,
  ]);
  handles.set(workspaceId, sandbox);
  return sandbox;
}
export async function releaseSandbox(db, threadId) {
  const { table, key, id: workspaceId } = agentSession(threadId);
  if (currentMakersSandbox() || process.env.COTHREAD_MAKERS === "true") {
    // The managed instance is shared by active children and owned by Makers.
    handles.delete(workspaceId);
    return;
  }
  let sandbox = handles.get(workspaceId);
  handles.delete(workspaceId);
  if (!sandbox) {
    const [record] = await query(
      db,
      `SELECT sandbox_id FROM ${table} WHERE ${key}=?`,
      [workspaceId],
    );
    if (record?.sandbox_id) {
      try {
        sandbox = await LocalSandbox.connect(record.sandbox_id);
      } catch {}
    }
  }
  if (sandbox) await sandbox.kill();
  await query(
    db,
    `UPDATE ${table} SET sandbox_id=NULL WHERE ${key}=?`,
    [workspaceId],
  );
}

export function relativePath(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 240 ||
    value.startsWith("/") ||
    /[\\\x00-\x1f:]/.test(value) ||
    value.split("/").some((p) => !p || p === "." || p === "..")
  )
    throw new Error("请使用工作区内的相对路径");
  return value;
}
export async function safeRemotePath(sandbox, root, value) {
  const path = `${root}/${relativePath(value)}`;
  if (sandbox.virtualPath) return sandbox.virtualPath(path);
  const code = `import os; p=os.path.realpath(${JSON.stringify(path)}); root=${JSON.stringify(root)}; assert os.path.commonpath([p,root])==root, 'Path leaves workspace'; print(p)`;
  const result = await sandbox.commands.run(`python3 -c ${shellQuote(code)}`, {
    cwd: root,
    timeoutMs: 15000,
  });
  if (result.exitCode !== 0) throw new Error("文件路径越出工作区");
  return result.stdout.trim();
}
