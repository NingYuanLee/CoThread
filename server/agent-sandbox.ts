import { query } from "./db.ts";
import { agentSession } from "./agent-session.ts";
import {
  resolveSandboxProvider,
  sandboxProviderName,
  sandboxProviderByName,
  parseSandboxReference,
  formatSandboxReference,
} from "./sandbox-provider.ts";
import type { SandboxProvider } from "./sandbox-provider.ts";
import type { Db } from "./types.ts";

/** 沙箱执行器的能力面。 */
export type Sandbox = {
  sandboxId: string;
  files: {
    makeDir(path: string): Promise<unknown>;
    write(path: string, data: unknown): Promise<unknown>;
  };
  setTimeout(ms: number): Promise<unknown>;
  kill(): Promise<unknown>;
  virtualPath?(path: string): string;
  commands: {
    run(
      command: string,
      options: { cwd: string; timeoutMs: number },
    ): Promise<{
      exitCode: number;
      stdout: string;
    }>;
  };
};

/** 需要恢复持久工作区时，provider 必须能按标识重连。 */
type ConnectableProvider = SandboxProvider & { connect(sandboxId: string): Promise<Sandbox> };

/** 工作区落点：表 + 键 + 该行 id。 */
type WorkspaceSpec = { table: string; key: string; id: string; cacheKey: string };

/** 已缓存的沙箱句柄。 */
type SandboxHandle = { provider: SandboxProvider; sandbox: Sandbox; reference: string };

export const shellQuote = (value: string): string => `'${value.replace(/'/g, `'"'"'`)}'`;
const handles = new Map<string, SandboxHandle>();
const pending = new Map<string, Promise<unknown>>();

const missingSandbox = (error: unknown): boolean =>
  /not found|not running|expired|does not exist/i.test(
    (error as { message?: string } | null)?.message || "",
  );

function workspace(scope: unknown): WorkspaceSpec {
  const spec = agentSession(scope as never);
  const table = spec.sandboxTable || spec.table;
  const key = spec.sandboxKey || spec.key;
  const id = spec.sandboxRowId || spec.id;
  return { table, key, id, cacheKey: `${table}:${id}` };
}

/** 同一工作区的操作串行执行，避免并发创建两份沙箱。 */
async function withWorkspace<T>(spec: WorkspaceSpec, operation: () => Promise<T>): Promise<T> {
  const previous = pending.get(spec.cacheKey) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  pending.set(spec.cacheKey, current);
  try {
    return await current;
  } finally {
    if (pending.get(spec.cacheKey) === current) pending.delete(spec.cacheKey);
  }
}

function assertInstance(sandbox: unknown): asserts sandbox is Sandbox {
  const candidate = sandbox as Partial<Sandbox> | null | undefined;
  if (
    !candidate ||
    typeof candidate.sandboxId !== "string" ||
    typeof candidate.files?.makeDir !== "function" ||
    typeof candidate.setTimeout !== "function" ||
    typeof candidate.kill !== "function"
  )
    throw new Error("沙箱实例必须提供 sandboxId、files.makeDir、setTimeout 和 kill");
}

export async function acquireSandbox(
  db: Db,
  scope: unknown,
  progress: (message: string) => unknown,
  explicit?: unknown,
): Promise<Sandbox> {
  const provider = resolveSandboxProvider(explicit);
  const name = sandboxProviderName(provider);
  const spec = workspace(scope);
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
    const [record] = await query<{ sandbox_id?: string | null }>(
      db,
      `SELECT sandbox_id FROM ${spec.table} WHERE ${spec.key}=?`,
      [spec.id],
    );
    const previous = record?.sandbox_id || null;
    let sandbox: Sandbox | undefined;
    let created = false;
    if (previous) {
      const reference = parseSandboxReference(previous);
      if (reference.providerName !== name)
        throw new Error(
          `工作区属于 provider “${reference.providerName}”，请先释放原工作区再切换到 “${name}”`,
        );
      try {
        // 能走到这里说明要恢复持久工作区，provider 必须具备 connect。
        sandbox = (await (provider as ConnectableProvider).connect(reference.sandboxId)) as Sandbox;
      } catch (error) {
        if (!missingSandbox(error)) throw error;
      }
    }
    try {
      if (!sandbox) {
        await progress("正在创建执行工作区");
        sandbox = (await provider.create()) as Sandbox;
        created = true;
      }
      assertInstance(sandbox);
      await sandbox.setTimeout(900000);
      await sandbox.files.makeDir(`/home/user/cothread/${spec.id}`);
      const reference = formatSandboxReference(provider, sandbox.sandboxId);
      const result = (await query(
        db,
        `UPDATE ${spec.table} SET sandbox_id=? WHERE ${spec.key}=? AND sandbox_id <=> ?`,
        [reference, spec.id, previous],
      )) as unknown as { affectedRows?: number };
      if (!result.affectedRows) throw new Error("工作区绑定已变化，请重试");
      handles.set(spec.cacheKey, { provider, sandbox, reference });
      return sandbox;
    } catch (error) {
      if (created && sandbox && typeof sandbox.kill === "function") {
        const failing = sandbox;
        try {
          await failing.kill();
        } catch (cleanup) {
          throw new AggregateError(
            [error, cleanup],
            `创建工作区失败且回收未确认：${failing.sandboxId}`,
          );
        }
      }
      throw error;
    }
  });
}

export async function releaseSandbox(db: Db, scope: unknown, explicit?: unknown): Promise<void> {
  const spec = workspace(scope);
  return withWorkspace(spec, async () => {
    const cached = handles.get(spec.cacheKey);
    let sandbox: Sandbox | undefined = cached?.sandbox;
    let reference: string | undefined | null = cached?.reference;
    if (cached && explicit && resolveSandboxProvider(explicit) !== cached.provider)
      throw new Error("不能用其它 provider 释放当前工作区");
    if (!cached) {
      const [record] = await query<{ sandbox_id?: string | null }>(
        db,
        `SELECT sandbox_id FROM ${spec.table} WHERE ${spec.key}=?`,
        [spec.id],
      );
      reference = record?.sandbox_id;
      if (!reference) return;
      const parsed = parseSandboxReference(reference);
      const provider = sandboxProviderByName(parsed.providerName);
      if (explicit && resolveSandboxProvider(explicit) !== provider)
        throw new Error("不能用其它 provider 释放当前工作区");
      try {
        sandbox = (await (provider as ConnectableProvider).connect(parsed.sandboxId)) as Sandbox;
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

/** 工作区内的相对路径校验。 */
export function relativePath(value: unknown): string {
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

export async function safeRemotePath(
  sandbox: Sandbox,
  root: string,
  value: unknown,
): Promise<string> {
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
