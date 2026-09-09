import { Sandbox, ConnectionConfig } from "e2b";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { assetPath } from "./assets.js";
import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import { HttpError } from "./service.js";
import { generateReply } from "./replies.js";
import { modelDiscussion } from "./model-context.js";

// Adapted from D:\work\dsh runtime/_e2b-acs-compat.mjs (MIT; see THIRD_PARTY_NOTICES).
const originalHost = ConnectionConfig.prototype.getHost;
const originalUrl = ConnectionConfig.prototype.getSandboxUrl;
const originalDirectUrl = ConnectionConfig.prototype.getSandboxDirectUrl;
const kruise = (url) => /\/kruise\/api\/?$/i.test(url || "");
ConnectionConfig.prototype.getHost = function (sandboxId, port, domain) {
  return kruise(this.apiUrl)
    ? `${domain || this.domain}/kruise/${sandboxId}/${port}`
    : originalHost.call(this, sandboxId, port, domain);
};
ConnectionConfig.prototype.getSandboxUrl = function (sandboxId, options) {
  if (this.sandboxUrl || !kruise(this.apiUrl))
    return originalUrl.call(this, sandboxId, options);
  return `${new URL(this.apiUrl).protocol}//${this.getHost(sandboxId, options.envdPort || ConnectionConfig.envdPort, options.sandboxDomain)}`;
};
ConnectionConfig.prototype.getSandboxDirectUrl = function (sandboxId, options) {
  return !this.sandboxUrl && kruise(this.apiUrl)
    ? this.getSandboxUrl(sandboxId, options)
    : originalDirectUrl.call(this, sandboxId, options);
};
export function acsOptions() {
  const {
    E2B_API_KEY: apiKey,
    E2B_DOMAIN: domain,
    E2B_API_URL: apiUrl,
    E2B_SANDBOX_URL: sandboxUrl,
  } = process.env;
  if (!apiKey || !domain)
    throw new HttpError(503, "ACS 尚未配置，请设置 E2B_API_KEY 和 E2B_DOMAIN");
  if (!/^[a-zA-Z0-9.-]+(?::\d+)?$/.test(domain))
    throw new HttpError(503, "ACS 域名格式不正确");
  return {
    apiKey,
    domain,
    apiUrl: apiUrl || `https://api.${domain}`,
    ...(sandboxUrl ? { sandboxUrl } : {}),
    timeoutMs: Math.min(
      Math.max(Number(process.env.E2B_TIMEOUT_MS) || 300000, 60000),
      900000,
    ),
    requestTimeoutMs: 20000,
  };
}
const shellQuote = (text) => `'${text.replace(/'/g, `'"'"'`)}'`;
export async function executeRun(
  service,
  user,
  threadId,
  input,
  kind = "command",
  provider = Sandbox,
  onStarted,
) {
  const command =
    kind === "command"
      ? z.string().trim().min(1).max(8000).parse(input.command)
      : "总结当前迭代";
  const directSummary =
    kind === "summary" &&
    process.env.SUMMARY_MODE !== "dsh" &&
    provider === Sandbox;
  const options = directSummary ? {} : acsOptions();
  if (kind === "summary" && process.env.DSH_ENABLED === "false")
    throw new HttpError(503, "DSH 助手尚未启用，请先准备带 DSH 的 ACS 模板");
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
    query(service.db, "UPDATE sandbox_runs SET progress=? WHERE id=?", [
      text,
      runId,
    ]);
  let sandbox;
  let output = "";
  let status = "failed";
  let stage = "create";
  try {
    if (directSummary) {
      await progress("正在梳理讨论，等待模型返回");
      output = await generateReply(context, true);
      await transaction(service.db, async (db) => {
        await service.thread(user, threadId, true, db);
        await service.insertMessage(
          db,
          user,
          threadId,
          output,
          [],
          "assistant",
        );
      });
      status = "succeeded";
    } else {
      await progress("正在连接 ACS 沙箱");
      sandbox = await provider.create(
        process.env.E2B_TEMPLATE || "code-interpreter",
        { ...options, ...(kind === "summary" ? { timeoutMs: 600000 } : {}) },
      );
      await query(
        service.db,
        "UPDATE sandbox_runs SET sandbox_id=? WHERE id=?",
        [sandbox.sandboxId, runId],
      );
      const cwd = `/home/user/cothread/${threadId}`;
      stage = "copy-context";
      await progress("正在准备讨论和文档副本");
      await sandbox.files.makeDir(cwd);
      await sandbox.files.write(
        `${cwd}/context.json`,
        JSON.stringify(context, null, 2),
      );
      const project = await service.project(user, context.project_id);
      const manifest = [];
      // Every immutable version gets its own safe ID-based filename; no client paths enter shell commands.
      for (const meta of project.versions.slice(0, 40)) {
        const version = await service.version(user, meta.id);
        await sandbox.files.write(
          `${cwd}/${version.id}`,
          new Uint8Array(version.content).buffer,
        );
        manifest.push({
          id: version.id,
          title: version.title,
          version: version.version,
          filename: version.filename,
          path: `${cwd}/${version.id}`,
        });
      }
      await sandbox.files.write(
        `${cwd}/manifest.json`,
        JSON.stringify(manifest, null, 2),
      );
      let executable = command;
      if (kind === "summary") {
        const summaryContext = JSON.stringify({
          title: context.title,
          messages: context.messages,
          reviews: context.reviews,
          documents: manifest,
        });
        if (Buffer.byteLength(summaryContext) > 80000)
          throw new HttpError(
            413,
            "讨论过长，首版助手支持最多 80 KB 讨论上下文",
          );
        const prompt = `请总结以下迭代记录。按「已确认决定」「待决策问题」「下一步与负责人」组织，引用消息 ID 或文档版本 ID。\n${summaryContext}`;
        await sandbox.files.write(
          `${cwd}/summary-patch.yml`,
          await readFile(
            assetPath("runtime/summary-patch.yml"),
            "utf8",
          ),
        );
        await sandbox.files.write(
          `${cwd}/prepare-dsh.sh`,
          await readFile(
            assetPath("runtime/prepare-dsh.sh"),
            "utf8",
          ),
        );
        if (process.env.DSH_BOOTSTRAP !== "false") {
          stage = "prepare-dsh";
          await progress("正在准备助手环境，首次可能需要几分钟");
          const prepared = await sandbox.commands.run(
            `sh ${shellQuote(`${cwd}/prepare-dsh.sh`)}`,
            { cwd, timeoutMs: 180000 },
          );
          if (prepared.exitCode !== 0)
            throw new Error("DSH preparation failed");
          executable =
            "PATH=/home/user/.local/cothread-runtime/node/bin:$PATH /home/user/.local/cothread-runtime/dsh/node_modules/.bin/dsh";
        } else executable = "dsh";
        executable += ` --profile headless --patch ${shellQuote(`${cwd}/summary-patch.yml`)} ${shellQuote(prompt)}`;
      }
      stage = "execute";
      await progress(
        kind === "summary" ? "正在梳理讨论，等待模型返回" : "正在执行命令",
      );
      const result = await sandbox.commands.run(executable, {
        cwd,
        timeoutMs: 120000,
        ...(kind === "summary" && process.env.DEEPSEEK_API_KEY
          ? { envs: { DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY } }
          : {}),
      });
      output = (
        kind === "summary"
          ? result.stdout || ""
          : `${result.stdout || ""}${result.stderr ? `\n${result.stderr}` : ""}`
      ).slice(-100000);
      status = result.exitCode === 0 ? "succeeded" : "failed";
      if (kind === "summary" && status === "succeeded")
        await transaction(service.db, async (db) => {
          await service.thread(user, threadId, true, db);
          await service.insertMessage(
            db,
            user,
            threadId,
            output.slice(0, 20000) || "助手未返回文本",
            [],
            "assistant",
          );
        });
    }
  } catch (error) {
    status = "failed";
    // Do not persist provider exception strings: they may contain credential-bearing URLs.
    output =
      error instanceof HttpError
        ? error.message
        : "ACS 执行失败。请检查模板、网络和服务端配置；群聊与文档数据不受影响。";
    if (stage === "prepare-dsh")
      output =
        "助手环境准备失败或超时，尚未开始梳理讨论。请重试；群聊和文档均已保存。";
    let diagnostic = String(error.stderr || error.message || "").slice(-2500);
    for (const key of ["E2B_API_KEY", "DEEPSEEK_API_KEY"])
      if (process.env[key])
        diagnostic = diagnostic.split(process.env[key]).join("[REDACTED]");
    console.error("ACS run failed", {
      kind,
      stage,
      type: error.name,
      exitCode: error.exitCode ?? null,
      diagnostic: kind === "summary" ? diagnostic : undefined,
    });
  } finally {
    await progress(sandbox ? "正在回收沙箱" : "正在保存执行状态");
    if (sandbox) {
      try {
        await sandbox.kill();
      } catch {
        output += "\n沙箱清理未确认，将由 ACS 超时回收。";
      }
    }
    await query(
      service.db,
      "UPDATE sandbox_runs SET status=?,output=?,progress=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?",
      [
        status,
        output,
        status === "succeeded" ? "已完成" : "未完成，可重试",
        runId,
      ],
    );
  }
  return { id: runId, status, output };
}
