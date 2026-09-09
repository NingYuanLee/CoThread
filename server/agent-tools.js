import { z } from "zod/v3";
import { formatAgentAction } from "../shared/agent-label.js";
import { posix } from "node:path";
import { query } from "./db.js";
import { digest } from "./auth.js";
import { HttpError } from "./service.js";
import { modelDiscussion, modelProject } from "./model-context.js";
import { agentSession } from "./agent-session.js";
import { acquireSandbox, safeRemotePath, shellQuote } from "./agent-sandbox.js";
import { bindMakersSandbox } from "./makers-sandbox.js";

const titles = {
  list_messages: "读取", read_message: "读取", list_members: "读取", read_member: "读取",
  project_context: "读取",
  read_document: "读取",
  read_iteration: "读取",
  sandbox_command: "执行",
  sandbox_read: "读取",
  sandbox_write: "写入",
  publish_artifact: "保存",
};
export async function assertJob(service, user, job) {
  const thread = await service.thread(user, job.thread_id);
  await service.member(user, thread.project_id, true);
  const [record] = await query(
    service.db,
    "SELECT status FROM assistant_replies WHERE message_id=?",
    [job.message_id],
  );
  if (thread.status !== "active" || record?.status !== "running")
    throw new HttpError(409, "任务已停止或迭代已归档");
  return thread;
}
export function createAgentTools(
  service,
  user,
  job,
  { getSandbox } = {},
) {
  getSandbox ||= bindMakersSandbox(acquireSandbox);
  let calls = 0;
  const progress = (text) =>
    query(
      service.db,
      "UPDATE assistant_replies SET progress=? WHERE message_id=?",
      [text, job.message_id],
    );
  const root = `/home/user/cothread/${agentSession(job).id}`;
  const sandboxScope = job.parent_message_id ? job : job.thread_id;
  return async (name, args) => {
    const thread = await assertJob(service, user, job);
    if (!titles[name]) throw new HttpError(400, "未知工具");
    if (++calls > 40)
      throw new HttpError(429, "本次工具调用已达 40 次，请分步继续");
    const event = await query(
      service.db,
      "INSERT INTO agent_events(message_id,tool,status,input) VALUES(?,?,'running',?)",
      [job.message_id, name, JSON.stringify(args).slice(0, 16000)],
    );
    const label = formatAgentAction(name, args);
    await progress(label);
    try {
      let result;
      if (name === "project_context") {
        result = modelProject(await service.project(user, thread.project_id));
        result.versions = result.versions.filter((v) => !v.deleted_at);
      } else if (["list_members", "read_member"].includes(name)) {
        result = await service.conversationMembers(user, thread.project_id, name === "read_member" ? z.string().min(1).parse(args.memberId) : undefined);
      } else if (["list_messages", "read_message"].includes(name)) {
        const targetId = z.string().uuid().parse(args.threadId);
        const target = await service.thread(user, targetId);
        if (target.project_id !== thread.project_id) throw new HttpError(403, "仅可读取当前项目");
        result = name === "list_messages" ? await service.listMessages(user, targetId, args)
          : await service.readMessage(user, targetId, z.string().uuid().parse(args.messageId), args.before);
      } else if (name === "read_iteration") {
        const id = z.string().uuid().parse(args.threadId);
        const target = await service.thread(user, id);
        if (target.project_id !== thread.project_id)
          throw new HttpError(403, "仅可读取当前项目");
        await progress(formatAgentAction(name, args, target));
        result = modelDiscussion(await service.context(user, id, service.db, { display: true, limit: args.limit ?? 50, before: args.before }));
      } else if (name === "read_document") {
        const version = await service.version(
          user,
          z.string().uuid().parse(args.versionId),
        );
        if (version.project_id !== thread.project_id)
          throw new HttpError(403, "文档不属于当前项目");
        const sandbox = await getSandbox(service.db, sandboxScope, progress);
        await progress(formatAgentAction(name, args, version));
        const path = `documents/${version.id}/${version.filename}`;
        await sandbox.files.makeDir(`${root}/documents/${version.id}`);
        await sandbox.files.write(
          `${root}/${path}`,
          new Uint8Array(version.content).buffer,
        );
        const text =
          /^text\//.test(version.mime) ||
          /\.(md|txt|json|csv|js|ts|py|html|css|yaml|yml|sql)$/i.test(
            version.filename,
          );
        result = {
          id: version.id,
          title: version.title,
          version: version.version,
          path,
          sha256: version.sha256,
          content: text
            ? version.content.toString("utf8").slice(0, 50000)
            : undefined,
          note: text
            ? "正文最多返回 50000 字符，完整文件已复制到沙箱。"
            : "二进制文件已复制到沙箱，可使用命令解析。",
        };
      } else {
        const sandbox = await getSandbox(service.db, sandboxScope, progress);
        await progress(label);
        if (name === "sandbox_command") {
          const command = z.string().min(1).max(12000).parse(args.command);
          await progress(label);
          try {
            const output = await sandbox.commands.run(command, {
              cwd: root,
              timeoutMs: 90000,
            });
            result = {
              exitCode: output.exitCode,
              stdout: output.stdout.slice(-20000),
              stderr: output.stderr.slice(-10000),
            };
          } catch (error) {
            if (typeof error.exitCode !== "number") throw error;
            result = {
              exitCode: error.exitCode,
              stdout: String(error.stdout || "").slice(-20000),
              stderr: String(error.stderr || "").slice(-10000),
            };
          }
        } else {
          const path = await safeRemotePath(sandbox, root, args.path);
          if (name === "sandbox_write") {
            const content = z.string().max(200000).parse(args.content);
            await sandbox.files.makeDir(posix.dirname(path));
            await sandbox.files.write(path, content);
            result = {
              path: args.path,
              bytes: Buffer.byteLength(content),
              savedToProject: false,
            };
          } else {
            // Bound before transfer, and recheck during read to avoid unbounded SDK downloads.
            const code = `import pathlib,base64,json; p=pathlib.Path(${JSON.stringify(path)}); f=p.open('rb'); b=f.read(5242881); assert len(b)<=5242880, 'File exceeds 5 MiB'; print(base64.b64encode(b).decode())`;
            const output = await sandbox.commands.run(
              `python3 -c ${shellQuote(code)}`,
              { cwd: root, timeoutMs: 20000 },
            );
            const content = Buffer.from(output.stdout.trim(), "base64");
            if (name === "sandbox_read") {
              const offset = z
                .number()
                .int()
                .min(0)
                .default(0)
                .parse(args.offset);
              const limit = z
                .number()
                .int()
                .min(1)
                .max(50000)
                .default(16000)
                .parse(args.limit);
              result = {
                path: args.path,
                content: content.toString("utf8").slice(offset, offset + limit),
                bytes: content.length,
              };
            } else {
              await assertJob(service, user, job);
              const title = z.string().min(1).max(160).parse(args.title);
              const artifactId = z
                .string()
                .uuid()
                .optional()
                .parse(args.artifactId);
              const filename = posix.basename(path);
              const mime =
                /\.(md|txt|py|js|ts|css|html|csv|json|sql|yaml|yml)$/i.test(
                  filename,
                )
                  ? "text/plain"
                  : "application/octet-stream";
              result = await service.submitVersion(
                { ...user, kind: "agent" },
                job.thread_id,
                {
                  title,
                  filename,
                  mime,
                  artifactId,
                  note: args.note || "共序 Agent 生成，待人工审核",
                  contentBase64: content.toString("base64"),
                },
                digest(
                  `${job.message_id}:${artifactId || title}:${digest(content)}`,
                ),
                job.message_id,
              );
              result = {
                ...result,
                savedToProject: true,
                downloadUrl: `/api/versions/${result.id}/download`,
              };
            }
          }
        }
      }
      await query(
        service.db,
        "UPDATE agent_events SET status='completed',output=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?",
        [JSON.stringify(result).slice(0, 30000), event.insertId],
      );
      await progress("工具已完成，Agent 正在继续处理");
      return result;
    } catch (error) {
      let message =
        error instanceof HttpError || error instanceof z.ZodError
          ? error.message
          : String(error.stderr || error.message || "工具失败");
      for (const key of ["DEEPSEEK_API_KEY", "E2B_API_KEY"])
        if (process.env[key])
          message = message.split(process.env[key]).join("[REDACTED]");
      message = message.slice(-2000);
      await query(
        service.db,
        "UPDATE agent_events SET status='failed',output=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?",
        [message, event.insertId],
      );
      throw new HttpError(error.status || 400, message);
    }
  };
}
