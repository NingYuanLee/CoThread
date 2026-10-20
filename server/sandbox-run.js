import { finishSandboxRun } from "./thread-activity.js";
import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import { HttpError } from "./service.js";
import { modelDiscussion } from "./model-context.js";
import { resolveSandboxProvider } from "./sandbox-provider.js";

export async function executeRun(
  service,
  user,
  threadId,
  input,
  kind = "command",
  provider,
  onStarted,
) {
  // 不传 provider 时按 COTHREAD_SANDBOX_PROVIDER 解析；显式传入优先（测试用 stub）。
  const sandboxProvider = resolveSandboxProvider(provider);
  const command = z.string().trim().min(1).max(8000).parse(input.command);
  const runId = randomUUID();
  const context = await transaction(service.db, async (db) => {
    await service.thread(user, threadId, true, db);
    const [active] = await query(
      db,
      "SELECT id FROM sandbox_runs WHERE thread_id=? AND status='running'",
      [threadId],
    );
    if (active) throw new HttpError(409, "当前迭代已有执行任务");
    const context = modelDiscussion(await service.context(user, threadId, db));
    await query(
      db,
      "INSERT INTO sandbox_runs(id,thread_id,requested_by,kind,status,input) VALUES(?,?,?,?,'running',?)",
      [runId, threadId, user.id, kind, command],
    );
    return context;
  });
  onStarted?.({ id: runId, status: "running" });
  const progress = async (text) =>
    query(service.db, "UPDATE sandbox_runs SET progress=? WHERE id=?", [text, runId]);
  let sandbox;
  let output = "";
  let status = "failed";
  let stage = "create";
  try {
    await progress("正在准备本机工作区");
    sandbox = await sandboxProvider.create();
    await query(service.db, "UPDATE sandbox_runs SET sandbox_id=? WHERE id=?", [
      sandbox.sandboxId,
      runId,
    ]);
    const cwd = `/home/user/cothread/${threadId}`;
    stage = "copy-context";
    await progress("正在准备讨论和文档副本");
    await sandbox.files.makeDir(cwd);
    await sandbox.files.write(`${cwd}/context.json`, JSON.stringify(context, null, 2));
    const project = await service.project(user, context.project_id);
    const manifest = [];
    // Every immutable version gets its own safe ID-based filename; no client paths enter shell commands.
    for (const meta of project.versions.slice(0, 40)) {
      const version = await service.version(user, meta.id);
      await sandbox.files.write(`${cwd}/${version.id}`, new Uint8Array(version.content).buffer);
      manifest.push({
        id: version.id,
        title: version.title,
        version: version.version,
        filename: version.filename,
        path: `${cwd}/${version.id}`,
      });
    }
    await sandbox.files.write(`${cwd}/manifest.json`, JSON.stringify(manifest, null, 2));
    stage = "execute";
    await progress("正在执行命令");
    const result = await sandbox.commands.run(command, {
      cwd,
      timeoutMs: 120000,
    });
    output = `${result.stdout || ""}${result.stderr ? `\n${result.stderr}` : ""}`.slice(-100000);
    status = result.exitCode === 0 ? "succeeded" : "failed";
  } catch (error) {
    status = "failed";
    // Do not persist provider exception strings: they may contain credential-bearing URLs.
    output =
      error instanceof HttpError
        ? error.message
        : "沙箱执行失败。请检查服务可用性；群聊与文档数据不受影响。";
    console.error("Sandbox run failed", {
      kind,
      stage,
      type: error.name,
      exitCode: error.exitCode ?? null,
    });
  } finally {
    await progress(sandbox ? "正在回收沙箱" : "正在保存执行状态");
    if (sandbox) {
      try {
        await sandbox.kill();
      } catch {
        output += "\n本机工作区清理未确认。";
      }
    }
    await finishSandboxRun(service.db, runId, {
      status,
      output,
      progress: status === "succeeded" ? "已完成" : "未完成，可重试",
    });
  }
  return { id: runId, status, output };
}
