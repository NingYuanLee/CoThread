import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { query } from "./db.js";
import { searchProjectMemory } from "./memory-search.js";
import { intactConversationMemorySql } from "./conversation-memory-integrity.js";
import { visibleFileIndexSql, visibleFileSourceSql } from "./file-index-visibility.js";
import { hydrateFileIndexRoots } from "./file-index-roots.js";
import { hydrateFileIndexGroups } from "./file-index-groups.js";
import { hydrateFileIndexPaths } from "./file-index-path.js";

const specs = [
  {
    name: "search_memory",
    description: "搜索当前项目的现行记忆。需要更新搜索结果时先用 read_memory 读详情。",
    parameters: { query: { type: "string", required: true } },
  },
  {
    name: "read_memory",
    description: "分段读取当前项目的一条现行记忆及出处；有 nextOffset 时继续读取。",
    parameters: { pageId: { type: "string", required: true }, offset: { type: "number" } },
  },
  {
    name: "read_message",
    description: "分段读取当前项目的一条消息及作者、所属迭代；有 nextOffset 时继续读取。",
    parameters: { messageId: { type: "string", required: true }, offset: { type: "number" } },
  },
  {
    name: "read_document",
    description: "读取当前项目文档版本的文本片段。",
    parameters: {
      versionId: { type: "string", required: true },
      offset: { type: "number" },
      limit: { type: "number" },
    },
  },
  {
    name: "get_task",
    description: "读取当前项目任务及执行记录。",
    parameters: { taskId: { type: "string", required: true } },
  },
];

/** The bridge binds every lookup to one project, even if the account owns others. */
export async function startConversationToolBridge(db, context) {
  const token = randomBytes(24).toString("hex");
  let calls = 0;
  let returnedChars = 0;
  const pages = new Map();
  const sliceText = (value, offset) => {
    const chars = Array.from(String(value || ""));
    const start = Math.min(chars.length, Math.max(0, Math.trunc(Number(offset) || 0)));
    const end = Math.min(chars.length, start + 6000);
    return {
      text: chars.slice(start, end).join(""),
      offset: start,
      totalChars: chars.length,
      nextOffset: end < chars.length ? end : null,
    };
  };
  const handler = async (name, args) => {
    if (++calls > 20) throw new Error("本轮只读查询次数已达上限");
    const projectId = context.window.projectId;
    if (name === "search_memory") {
      const text = String(args.query || "")
        .trim()
        .slice(0, 200);
      if (!text) throw new Error("请输入检索词");
      return searchProjectMemory(db, projectId, { query: text, limit: 10, depth: 0 });
    }
    if (name === "read_memory") {
      const [page] = await query(
        db,
        `SELECT id,title,body,status,subject_type subjectType,
        about_user_id aboutUserId,memory_subtype subtype,NOT ${intactConversationMemorySql("p")} sourceNeedsReview FROM wiki_pages p
        WHERE id=? AND project_id=? AND status='current' AND ${visibleFileIndexSql("p")}`,
        [String(args.pageId || ""), projectId],
      );
      if (!page) throw new Error("记忆不存在或不在当前项目");
      if (
        Number(page.sourceNeedsReview) &&
        !(context.stalePages || []).some((item) => item.id === page.id)
      )
        throw new Error("记忆来源已变化，不在本轮核对范围");
      // Do not replace an earlier snapshot from the model's initial context.
      if (!context.pages.some((item) => item.id === page.id) && !pages.has(page.id))
        pages.set(page.id, page);
      const sources = await query(
        db,
        `SELECT s.source_kind kind,s.source_id id,s.label FROM wiki_page_sources s
         WHERE s.page_id=? AND ${visibleFileSourceSql("s")} LIMIT 50`,
        [page.id],
      );
      const [root] = await hydrateFileIndexRoots(db, projectId, [page]);
      const [group] = await hydrateFileIndexGroups(db, projectId, [root]);
      const [hydrated] = await hydrateFileIndexPaths(db, projectId, [group]);
      const { body, ...meta } = hydrated;
      return { ...meta, ...sliceText(body, args.offset), sources };
    }
    if (name === "read_message") {
      const [message] = await query(
        db,
        `SELECT m.id,m.thread_id threadId,m.author_id authorId,u.name author,
        m.body,m.sequence,m.created_at createdAt FROM messages m JOIN threads t ON t.id=m.thread_id
        JOIN users u ON u.id=m.author_id WHERE m.id=? AND t.project_id=?`,
        [String(args.messageId || ""), projectId],
      );
      if (!message) throw new Error("消息不存在或不在当前项目");
      const { body, ...meta } = message;
      return { ...meta, ...sliceText(body, args.offset) };
    }
    if (name === "read_document" || name === "get_task") {
      const id = String(name === "get_task" ? args.taskId || "" : args.versionId || "");
      const sql =
        name === "get_task"
          ? "SELECT id FROM agent_tasks WHERE id=? AND project_id=?"
          : "SELECT v.id FROM versions v JOIN artifacts a ON a.id=v.artifact_id WHERE v.id=? AND a.project_id=? AND a.deleted_at IS NULL";
      const [row] = await query(db, sql, [id, projectId]);
      if (!row) throw new Error("对象不存在或不在当前项目");
      const { Service } = await import("./service.js");
      const { callMcpTool } = await import("./mcp.js");
      const user = { id: context.window.projectOwner, kind: "session" };
      return callMcpTool(
        new Service(db),
        user,
        name,
        name === "get_task"
          ? { taskId: id }
          : {
              versionId: id,
              offset: Math.max(0, Math.trunc(Number(args.offset) || 0)),
              limit: Math.max(1, Math.min(8000, Math.trunc(Number(args.limit) || 6000))),
            },
      );
    }
    throw new Error("不支持的只读工具");
  };
  const bridge = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    const supplied = Buffer.from(req.headers.authorization || "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (
      req.method !== "POST" ||
      req.url !== "/tool" ||
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      res.writeHead(403).end("{}");
      return;
    }
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 16000) throw new Error("查询参数过长");
      }
      const request = JSON.parse(body);
      if (!specs.some((spec) => spec.name === request.name)) throw new Error("不支持的只读工具");
      const value = await handler(request.name, request.args || {});
      let output = JSON.stringify(value);
      if (output.length > 12000)
        output = JSON.stringify({
          truncated: true,
          totalChars: output.length,
          preview: output.slice(0, 11000),
          note: "结果过长，只显示预览；请按需缩小范围核对。",
        });
      if (returnedChars + output.length > 60000) throw new Error("本轮只读查询的上下文预算已用完");
      returnedChars += output.length;
      res.end(JSON.stringify(output));
    } catch (error) {
      res
        .writeHead(400)
        .end(JSON.stringify({ error: String(error?.message || "查询失败").slice(0, 300) }));
    }
  });
  await new Promise((resolve, reject) => {
    bridge.once("error", reject);
    bridge.listen(0, "127.0.0.1", resolve);
  });
  return {
    env: {
      COTHREAD_BRIDGE_URL: `http://127.0.0.1:${bridge.address().port}`,
      COTHREAD_BRIDGE_TOKEN: token,
      COTHREAD_ALLOWED_TOOLS: JSON.stringify(specs.map((spec) => spec.name)),
      COTHREAD_MCP_TOOLS: JSON.stringify(specs),
    },
    snapshots: () => [...pages.values()],
    close: () =>
      new Promise((resolve, reject) =>
        bridge.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
