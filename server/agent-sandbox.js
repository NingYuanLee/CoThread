import { query } from "./db.js";
import { agentSession } from "./agent-session.js";
import {
  resolveSandboxProvider,
  sandboxProviderName,
  sandboxProviderByName,
  parseSandboxReference,
  formatSandboxReference,
} from "./sandbox-provider.js";

export const shellQuote = (value) => `'${value.replace(/'/g, `'"'"'`)}'`;
const handles = new Map();
const pending = new Map();
const missingSandbox = (error) =>
  /not found|not running|expired|does not exist/i.test(error?.message || "");
function workspace(scope) {
  const spec = agentSession(scope),
    table = spec.sandboxTable || spec.table,
    key = spec.sandboxKey || spec.key,
    id = spec.sandboxRowId || spec.id;
  return { table, key, id, cacheKey: `${table}:${id}` };
}
async function withWorkspace(spec, operation) {
  const previous = pending.get(spec.cacheKey) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  pending.set(spec.cacheKey, current);
  try {
    return await current;
  } finally {
    if (pending.get(spec.cacheKey) === current) pending.delete(spec.cacheKey);
  }
}
function assertInstance(sandbox) {
  if (
    !sandbox ||
    typeof sandbox.sandboxId !== "string" ||
    typeof sandbox.files?.makeDir !== "function" ||
    typeof sandbox.setTimeout !== "function" ||
    typeof sandbox.kill !== "function"
  )
    throw new Error("沙箱实例必须提供 sandboxId、files.makeDir、setTimeout 和 kill");
}
export async function acquireSandbox(db, scope, progress, explicit) {
  const provider = resolveSandboxProvider(explicit),
    name = sandboxProviderName(provider),
    spec = workspace(scope);
  return withWorkspace(spec, async () => {
    const cached = handles.get(spec.cacheKey);
    if (cached) {
      if (cached.provider !== provider)
        throw new Error("工作区仍属于其它 provider，请先释放原工作区再切换");
      try {
        await cached.sandbox.setTimeout(900000);
        return cached.sandbox;
      } catch (error) {
        if (!missingSandbox(error)) throw error;
        handles.delete(spec.cacheKey);
      }
    }
    const [record] = await query(db, `SELECT sandbox_id FROM ${spec.table} WHERE ${spec.key}=?`, [
      spec.id,
    ]);
    const previous = record?.sandbox_id || null;
    let sandbox,
      created = false;
    if (previous) {
      const reference = parseSandboxReference(previous);
      if (reference.providerName !== name)
        throw new Error(
          `工作区属于 provider “${reference.providerName}”，请先释放原工作区再切换到 “${name}”`,
        );
      try {
        sandbox = await provider.connect(reference.sandboxId);
      } catch (error) {
        if (!missingSandbox(error)) throw error;
      }
    }
    try {
      if (!sandbox) {
        await progress("正在创建执行工作区");
        sandbox = await provider.create();
        created = true;
      }
      assertInstance(sandbox);
      await sandbox.setTimeout(900000);
      await sandbox.files.makeDir(`/home/user/cothread/${spec.id}`);
      const reference = formatSandboxReference(provider, sandbox.sandboxId);
      const result = await query(
        db,
        `UPDATE ${spec.table} SET sandbox_id=? WHERE ${spec.key}=? AND sandbox_id <=> ?`,
        [reference, spec.id, previous],
      );
      if (!result.affectedRows) throw new Error("工作区绑定已变化，请重试");
      handles.set(spec.cacheKey, { provider, sandbox, reference });
      return sandbox;
    } catch (error) {
      if (created && typeof sandbox?.kill === "function") {
        try {
          await sandbox.kill();
        } catch (cleanup) {
          throw new AggregateError(
            [error, cleanup],
            `创建工作区失败且回收未确认：${sandbox.sandboxId}`,
          );
        }
      }
      throw error;
    }
  });
}
export async function releaseSandbox(db, scope, explicit) {
  const spec = workspace(scope);
  return withWorkspace(spec, async () => {
    const cached = handles.get(spec.cacheKey);
    let sandbox = cached?.sandbox,
      reference = cached?.reference;
    if (cached && explicit && resolveSandboxProvider(explicit) !== cached.provider)
      throw new Error("不能用其它 provider 释放当前工作区");
    if (!cached) {
      const [record] = await query(db, `SELECT sandbox_id FROM ${spec.table} WHERE ${spec.key}=?`, [
        spec.id,
      ]);
      reference = record?.sandbox_id;
      if (!reference) return;
      const parsed = parseSandboxReference(reference),
        provider = sandboxProviderByName(parsed.providerName);
      if (explicit && resolveSandboxProvider(explicit) !== provider)
        throw new Error("不能用其它 provider 释放当前工作区");
      try {
        sandbox = await provider.connect(parsed.sandboxId);
      } catch (error) {
        if (!missingSandbox(error)) throw error;
      }
    }
    try {
      if (sandbox) await sandbox.kill();
    } catch (error) {
      if (!missingSandbox(error)) throw error;
    }
    handles.delete(spec.cacheKey);
    await query(
      db,
      `UPDATE ${spec.table} SET sandbox_id=NULL WHERE ${spec.key}=? AND sandbox_id=?`,
      [spec.id, reference],
    );
  });
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
