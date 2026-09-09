import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const scopes = new AsyncLocalStorage();
const prepared = new Map();
const checkpoints = new Map();
const root = "/home/user/cothread";
const quote = (value) => `'${value.replace(/'/g, `'"'"'`)}'`;
export const currentMakersSandbox = () => scopes.getStore();
export function bindMakersSandbox(fn) {
  const scope = scopes.getStore();
  return (...args) => scope ? scopes.run(scope, () => fn(...args)) : fn(...args);
}

export async function withMakersSandbox(sandbox, operation) {
  const scope = { sandbox, ready: null, used: false };
  return scopes.run(scope, async () => {
    try { return await operation(); }
    finally {
      // One checkpoint for the shared conversation sandbox, after all children
      // settle. Never let one child kill the instance used by its siblings.
      if (scope.used && sandbox?.persist) {
        const previous = checkpoints.get(scope.instanceId) || Promise.resolve();
        const saving = previous.catch(() => {}).then(() => sandbox.persist({ path: root, timeout: 180 }));
        checkpoints.set(scope.instanceId, saving);
        try { await saving; }
        finally { if (checkpoints.get(scope.instanceId) === saving) checkpoints.delete(scope.instanceId); }
      }
    }
  });
}

export async function makersWorkspace(workspaceId) {
  const scope = scopes.getStore();
  if (!scope?.sandbox) throw new Error("Makers 沙箱上下文不可用，请从云端 Agent 入口执行。");
  const native = scope.sandbox;
  scope.ready ??= (async () => {
    await native.files.makeDir(root);
    const info = await native.getInfo();
    scope.instanceId = info.instanceId;
    let initializing = prepared.get(info.instanceId);
    if (!initializing) {
      initializing = (async () => {
        const marker = `${root}/.makers-instance`;
        const sameInstance = await native.files.exists(marker) && await native.files.read(marker) === info.instanceId;
        if (!sameInstance && native.restore) await native.restore({ path: root, timeout: 180 });
        await native.files.makeDir(root);
        await native.files.write(marker, info.instanceId);
      })().catch((error) => { prepared.delete(info.instanceId); throw error; });
      prepared.set(info.instanceId, initializing);
      if (prepared.size > 64) prepared.delete(prepared.keys().next().value);
    }
    await initializing;
    scope.used = true;
  })().catch((error) => { scope.ready = null; throw error; });
  await scope.ready;
  await native.files.makeDir(`${root}/${workspaceId}`);
  const commands = { run: async (command, options = {}) => {
    const result = await native.commands.run(command, {
      ...(options.cwd ? { cwd: options.cwd } : {}),
      ...(options.envs ? { env: options.envs } : {}),
      timeout: Math.max(1, Math.ceil((options.timeoutMs || 90000) / 1000)),
    });
    if (result.stdout) options.onStdout?.({ line: result.stdout });
    if (result.stderr) options.onStderr?.({ line: result.stderr });
    return result;
  } };
  return {
    sandboxId: scope.instanceId,
    commands,
    files: {
      makeDir: (path) => native.files.makeDir(path),
      read: (path) => native.files.read(path),
      write: async (path, content) => {
        if (typeof content === "string") return native.files.write(path, content);
        // Native files.write is text-only. Transfer binary in bounded chunks,
        // then decode inside the sandbox; never send binary to the model.
        const encoded = Buffer.from(content instanceof ArrayBuffer ? new Uint8Array(content) : content).toString("base64");
        const prefix = `${path}.upload-${randomUUID()}`;
        const parts = [];
        try {
          for (let offset = 0; offset < encoded.length; offset += 262144) {
            const part = `${prefix}-${parts.length}`;
            parts.push(part);
            await native.files.write(part, encoded.slice(offset, offset + 262144));
          }
          const python = `import pathlib,base64; out=pathlib.Path(${JSON.stringify(path)}).open('wb'); parts=${JSON.stringify(parts)}; [out.write(base64.b64decode(pathlib.Path(p).read_text())) for p in parts]; out.close()`;
          const result = await commands.run(`python3 -c ${quote(python)}`, { timeoutMs: 30000 });
          if (result.exitCode !== 0) throw new Error("沙箱二进制文件写入失败");
        } finally { await Promise.allSettled(parts.map((part) => native.files.remove(part))); }
      },
    },
    // Lifetime belongs to Makers, not a child task.
    setTimeout: (milliseconds) => native.extendTimeout(Math.ceil(milliseconds / 1000)),
    kill: async () => {},
  };
}
