import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { query } from "./db.ts";
import { searchProjectMemory } from "./memory-search.ts";
import { isMemorySubject } from "../shared/memory-kinds.js";
import {
  intactConversationMemorySql,
  readableConversationMemorySql,
} from "./conversation-memory-integrity.ts";
import { visibleFileIndexSql, visibleFileSourceSql } from "./file-index-visibility.ts";
import { hydrateFileIndexRoots } from "./file-index-roots.ts";
import { hydrateFileIndexGroups } from "./file-index-groups.ts";
import { fileIndexFolderPath, hydrateFileIndexPaths } from "./file-index-path.ts";
import type { Db } from "./types.ts";
import type { loadConversationContext } from "./conversation-memory-context.ts";

/** 联合分析上下文（由 `loadConversationContext` 定义，桥接只读它）。 */
type ConversationContext = Awaited<ReturnType<typeof loadConversationContext>>;
/** 记忆页快照：桥接缓存到 `pages` 的那一条。 */
type ConversationPageSnapshot = ConversationContext["pages"][number];
/** `isMemorySubject` 接受的取值。 */
type MemorySubject = Parameters<typeof isMemorySubject>[0];

const specs = [
  {
    name: "search_memory",
    description:
      "搜索当前项目的现行记忆；可按 query 检索，也可用 subjects（utterance、discussion、project、task、document）限定类型（如项目进程 project、主要任务 task）。depth=1 可沿关联关系再展开一层（最多 2）。需要更新搜索结果时先用 read_memory 读详情。",
    parameters: {
      query: { type: "string" },
      subjects: { type: "array", items: { type: "string" } },
      depth: { type: "number" },
    },
  },
  {
    name: "read_memory",
    description: "分段读取当前项目的一条现行记忆及出处；有 nextOffset 时继续读取。",
    parameters: { pageId: { type: "string", required: true }, offset: { type: "number" } },
  },
  {
    name: "search_discussion_memory",
    description:
      "查当前项目的核心议题记忆，可跨迭代；不传关键词返回最近更新的议题。提炼出议题时先查，相关就更新原议题而不是新增；更新前先用 read_memory 读取目标（登记核对快照）。",
    parameters: { query: { type: "string" }, limit: { type: "number" } },
  },
  {
    name: "search_statement_memory",
    description:
      "查当前项目的关键发言记忆，可按成员和迭代过滤（默认本次迭代）。用于同一成员同迭代的前后对照：矛盾、改口、继承或关联；发言是追加事件，改口用 correctsPageId 关联原话。",
    parameters: {
      memberId: { type: "string" },
      threadId: { type: "string" },
      query: { type: "string" },
      limit: { type: "number" },
    },
  },
  {
    name: "search_messages",
    description:
      "查当前项目的消息：默认当前迭代且只取本次窗口之前的消息（可用 beforeSequence 指定更晚的截止），也可按内容/作者关键词搜索。用于补充前文、核对原话。",
    parameters: {
      threadId: { type: "string" },
      beforeSequence: { type: "number" },
      query: { type: "string" },
      limit: { type: "number" },
    },
  },
  {
    name: "search_files",
    description:
      "搜当前项目的文件记忆：按文件名/标题/识别说明/主题/提取文字关键词，可按识别结果过滤；不传关键词返回最近更新的文件。用于确认某个文件是否存在、内容识别到哪一步。",
    parameters: {
      query: { type: "string" },
      recognitionStatus: { type: "string" },
      limit: { type: "number" },
    },
  },
  {
    name: "read_file_memory",
    description:
      "读取当前项目某个文件的索引记忆：页面正文（用途、内容描述、识别状态）、版本、路径和识别文字摘录；可按 pageId 或 artifactId，正文支持 offset 分段。需要原文时用 read_document(versionId)。",
    parameters: {
      pageId: { type: "string" },
      artifactId: { type: "string" },
      offset: { type: "number" },
    },
  },
  {
    name: "get_project",
    description:
      "读取当前项目信息：名称、描述和项目现状摘录（状态页需全文时用 read_memory(pageId)）。",
    parameters: {},
  },
  {
    name: "get_iteration",
    description:
      "读取迭代目标与背景：默认本次迭代，可传 threadId；背景或目标过长会截断并标注 totalChars。",
    parameters: { threadId: { type: "string" } },
  },
  {
    name: "list_iterations",
    description: "列出当前项目的迭代（标题、状态、创建/归档时间和目标/背景摘录），用于跨迭代追溯。",
    parameters: { limit: { type: "number" } },
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
export async function startConversationToolBridge(db: Db, context: ConversationContext) {
  const token = randomBytes(24).toString("hex");
  let calls = 0;
  let returnedChars = 0;
  const pages = new Map<string, ConversationPageSnapshot>();
  const sliceText = (value: unknown, offset: unknown) => {
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
  const handler = async (name: string, args: Record<string, unknown>) => {
    if (++calls > 20) throw new Error("本轮只读查询次数已达上限");
    const projectId = context.window.projectId;
    if (name === "search_memory") {
      const text = String(args.query || "")
        .trim()
        .slice(0, 200);
      const rawSubjects: unknown[] = Array.isArray(args.subjects)
        ? args.subjects
        : String(args.subjects || "").split(",");
      const subjects = [...new Set(rawSubjects.map((item) => String(item).trim()))].filter(
        (item) => item && isMemorySubject(item as MemorySubject),
      );
      if (!text && !subjects.length) throw new Error("请输入检索词或指定 subjects");
      const depth = Math.min(Math.max(Number(args.depth) || 0, 0), 2);
      return searchProjectMemory(db, projectId, {
        query: text,
        subjects,
        limit: 10,
        depth,
      });
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
    if (name === "search_discussion_memory") {
      const text = String(args.query || "")
        .trim()
        .slice(0, 200);
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
      const result = await searchProjectMemory(db, projectId, {
        query: text,
        subjects: ["discussion"],
        limit,
        depth: 0,
      });
      return { scope: "discussion", ...result };
    }
    if (name === "search_statement_memory") {
      const memberId =
        String(args.memberId || "")
          .trim()
          .slice(0, 36) || null;
      const threadId =
        String(args.threadId || "")
          .trim()
          .slice(0, 36) ||
        context.window.threadId ||
        null;
      const text = String(args.query || "")
        .trim()
        .slice(0, 200);
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
      const where = [
        "p.project_id=?",
        "p.status='current'",
        readableConversationMemorySql("p"),
        "p.subject_type='utterance'",
      ];
      const params = [projectId];
      if (memberId) {
        where.push("p.about_user_id=?");
        params.push(memberId);
      }
      if (threadId) {
        where.push(`EXISTS (SELECT 1 FROM wiki_page_sources s JOIN messages m ON m.id=s.source_id
          WHERE s.page_id=p.id AND s.source_kind='message' AND m.thread_id=?)`);
        params.push(threadId);
      }
      if (text) {
        where.push("(p.title LIKE ? OR p.body LIKE ?)");
        params.push(`%${text}%`, `%${text}%`);
      }
      const rows = await query(
        db,
        `SELECT p.id,p.title,LEFT(p.body,300) excerpt,p.about_user_id memberId,
        p.memory_subtype subtype,p.updated_at updatedAt,
        (SELECT GROUP_CONCAT(DISTINCT t.title SEPARATOR '、') FROM wiki_page_sources s
          JOIN messages m ON m.id=s.source_id AND s.source_kind='message'
          JOIN threads t ON t.id=m.thread_id WHERE s.page_id=p.id) threads
        FROM wiki_pages p WHERE ${where.join(" AND ")}
        ORDER BY p.updated_at DESC LIMIT ?`,
        [...params, limit],
      );
      return { scope: "statement", threadId, memberId, count: rows.length, rows };
    }
    if (name === "search_messages") {
      const threadId =
        String(args.threadId || "")
          .trim()
          .slice(0, 36) || context.window.threadId;
      const requestedBefore = Number(args.beforeSequence);
      // 默认只取本次窗口之前的消息，避免把窗口之后的内容当成前文。
      const beforeSequence =
        Number.isFinite(requestedBefore) && requestedBefore > 0
          ? Math.trunc(requestedBefore)
          : Number(context.window.firstSequence) || null;
      const text = String(args.query || "")
        .trim()
        .slice(0, 200);
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
      const where = ["t.project_id=?", "m.source<>'system'", "m.body<>''"];
      const params: (string | number)[] = [projectId];
      if (threadId) {
        where.push("m.thread_id=?");
        params.push(threadId);
      }
      if (Number.isFinite(beforeSequence) && beforeSequence != null && beforeSequence > 0) {
        where.push("m.sequence<?");
        params.push(Math.trunc(beforeSequence));
      }
      if (text) {
        where.push("(m.body LIKE ? OR u.name LIKE ?)");
        params.push(`%${text}%`, `%${text}%`);
      }
      const rows = await query(
        db,
        `SELECT m.id,m.author_id authorId,u.name author,m.thread_id threadId,
        t.title threadTitle,m.sequence,LEFT(m.body,800) excerpt,m.created_at createdAt
        FROM messages m JOIN threads t ON t.id=m.thread_id JOIN users u ON u.id=m.author_id
        WHERE ${where.join(" AND ")} ORDER BY m.sequence DESC LIMIT ?`,
        [...params, limit],
      );
      rows.reverse();
      return {
        threadId,
        count: rows.length,
        // 继续往更早翻页时，把当前最早一条的 sequence 作为下一次 beforeSequence。
        nextBeforeSequence: rows[0]?.sequence ?? null,
        rows,
      };
    }
    if (name === "search_files") {
      const text = String(args.query || "")
        .trim()
        .slice(0, 200);
      const status = String(args.recognitionStatus || "").trim();
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
      const where = [
        "p.project_id=?",
        "p.status='current'",
        "p.subject_type='document'",
        visibleFileIndexSql("p"),
      ];
      const params = [projectId];
      if (["recognized", "partial", "unrecognized", "failed"].includes(status)) {
        where.push("fi.recognition_status=?");
        params.push(status);
      }
      if (text) {
        where.push(`(a.title LIKE ? OR v.filename LIKE ? OR fi.recognition_note LIKE ?
          OR CAST(fi.topics AS CHAR) LIKE ? OR fi.extracted_text LIKE ?)`);
        params.push(`%${text}%`, `%${text}%`, `%${text}%`, `%${text}%`, `%${text}%`);
      }
      const rows = await query(
        db,
        `SELECT p.id pageId,p.title title,a.id artifactId,a.folder_id folderId,
        v.id versionId,v.filename filename,v.version version,v.mime mime,
        fi.recognition_status recognitionStatus,fi.recognition_note recognitionNote,
        fi.topics topics,LEFT(COALESCE(fi.extracted_text,''),400) extractedExcerpt,
        p.updated_at updatedAt
        FROM wiki_pages p
        JOIN file_index_entries fi ON fi.page_id=p.id AND fi.project_id=p.project_id
        JOIN artifacts a ON a.id=fi.artifact_id AND a.project_id=fi.project_id
        LEFT JOIN versions v ON v.id=fi.indexed_version_id
        WHERE ${where.join(" AND ")}
        ORDER BY p.updated_at DESC LIMIT ?`,
        [...params, limit],
      );
      for (const row of rows) {
        row.path = await fileIndexFolderPath(db, projectId, row.folderId);
        delete row.folderId;
      }
      return { count: rows.length, rows };
    }
    if (name === "read_file_memory") {
      const pageId = String(args.pageId || "")
        .trim()
        .slice(0, 36);
      const artifactId = String(args.artifactId || "")
        .trim()
        .slice(0, 36);
      if (!pageId && !artifactId) throw new Error("需要 pageId 或 artifactId");
      const [row] = await query(
        db,
        `SELECT p.id pageId,p.title title,p.body body,a.id artifactId,a.folder_id folderId,
        v.id versionId,v.filename filename,v.version version,v.mime mime,
        fi.recognition_status recognitionStatus,fi.recognition_note recognitionNote,
        fi.topics topics,LEFT(COALESCE(fi.extracted_text,''),1500) extractedExcerpt
        FROM wiki_pages p
        JOIN file_index_entries fi ON fi.page_id=p.id AND fi.project_id=p.project_id
        JOIN artifacts a ON a.id=fi.artifact_id AND a.project_id=fi.project_id
        LEFT JOIN versions v ON v.id=fi.indexed_version_id
        WHERE p.project_id=? AND p.status='current' AND p.subject_type='document'
          AND ${visibleFileIndexSql("p")}
          AND ${pageId ? "p.id=?" : "a.id=?"}
        LIMIT 1`,
        pageId ? [projectId, pageId] : [projectId, artifactId],
      );
      if (!row) throw new Error("文件记忆不存在或不可访问");
      const [hydrated] = await hydrateFileIndexPaths(db, projectId, [{ ...row, id: row.pageId }]);
      const { body, folderId, ...meta } = hydrated;
      return { ...meta, ...sliceText(body, args.offset) };
    }
    if (name === "get_project") {
      const [project] = await query(
        db,
        "SELECT id,name,description,created_at createdAt,archived_at archivedAt FROM projects WHERE id=?",
        [projectId],
      );
      if (!project) throw new Error("项目不存在");
      const { readProjectStatus } = await import("./project-status.ts");
      const projectStatus = await readProjectStatus(db, projectId).catch(() => null);
      const related = await query(
        db,
        `SELECT p.id pageId,p.title,p.subject_type subjectType,LEFT(p.body,200) excerpt,
        p.updated_at updatedAt FROM wiki_pages p
        WHERE p.project_id=? AND p.status='current' AND ${readableConversationMemorySql("p")}
        AND p.subject_type IN ('project','task')
        ORDER BY p.updated_at DESC LIMIT 10`,
        [projectId],
      );
      return {
        id: project.id,
        name: project.name,
        description: String(project.description || "").slice(0, 4000),
        createdAt: project.createdAt,
        archivedAt: project.archivedAt,
        status: projectStatus
          ? {
              title: "项目现状",
              excerpt: String(projectStatus.body || "").slice(0, 1200),
              updatedAt: projectStatus.updatedAt,
            }
          : null,
        milestones: related.filter((row) => row.subjectType === "project"),
        importantTasks: related.filter((row) => row.subjectType === "task"),
      };
    }
    if (name === "get_iteration") {
      const threadId =
        String(args.threadId || "")
          .trim()
          .slice(0, 36) || context.window.threadId;
      const [thread] = await query(
        db,
        `SELECT id,title,background,goal,status,created_at createdAt,archived_at archivedAt
        FROM threads WHERE id=? AND project_id=?`,
        [threadId, projectId],
      );
      if (!thread) throw new Error("迭代不存在或不在当前项目");
      const clip = (
        value: unknown,
        size = 6000,
      ): { value: string; truncated: boolean; totalChars?: number } => {
        const text = String(value || "");
        return text.length > size
          ? { value: text.slice(0, size), truncated: true, totalChars: text.length }
          : { value: text, truncated: false };
      };
      const background = clip(thread.background);
      const goal = clip(thread.goal);
      const memories = await query(
        db,
        `SELECT DISTINCT p.id pageId,p.title,p.subject_type subjectType,LEFT(p.body,200) excerpt,
        p.updated_at updatedAt FROM wiki_pages p
        JOIN wiki_page_sources s ON s.page_id=p.id
        LEFT JOIN agent_tasks t ON s.source_kind='task' AND t.id=s.source_id
        WHERE p.project_id=? AND p.status='current' AND ${readableConversationMemorySql("p")}
        AND ((s.source_kind='thread' AND s.source_id=?)
          OR (s.source_kind='task' AND t.thread_id=? AND t.project_id=?))
        ORDER BY p.updated_at DESC LIMIT 10`,
        [projectId, threadId, threadId, projectId],
      );
      return {
        id: thread.id,
        title: thread.title,
        status: thread.status,
        createdAt: thread.createdAt,
        archivedAt: thread.archivedAt,
        background: background.value,
        backgroundTruncated: background.truncated,
        backgroundTotalChars: background.totalChars ?? undefined,
        goal: goal.value,
        goalTruncated: goal.truncated,
        goalTotalChars: goal.totalChars ?? undefined,
        memories,
      };
    }
    if (name === "list_iterations") {
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 20);
      const rows = await query(
        db,
        `SELECT id,title,status,created_at createdAt,archived_at archivedAt,
        LEFT(COALESCE(goal,''),200) goalExcerpt,LEFT(COALESCE(background,''),200) backgroundExcerpt
        FROM threads WHERE project_id=? ORDER BY created_at DESC LIMIT ?`,
        [projectId, limit],
      );
      return { count: rows.length, rows };
    }
    if (name === "read_document" || name === "get_task") {
      const id = String(name === "get_task" ? args.taskId || "" : args.versionId || "");
      const sql =
        name === "get_task"
          ? "SELECT id FROM agent_tasks WHERE id=? AND project_id=?"
          : "SELECT v.id FROM versions v JOIN artifacts a ON a.id=v.artifact_id WHERE v.id=? AND a.project_id=? AND a.deleted_at IS NULL";
      const [row] = await query(db, sql, [id, projectId]);
      if (!row) throw new Error("对象不存在或不在当前项目");
      const { Service } = await import("./service.ts");
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
      res.writeHead(400).end(
        JSON.stringify({
          error: String((error as { message?: unknown } | null)?.message || "查询失败").slice(
            0,
            300,
          ),
        }),
      );
    }
  });
  await new Promise<void>((resolve, reject) => {
    bridge.once("error", reject);
    bridge.listen(0, "127.0.0.1", () => resolve());
  });
  const address = bridge.address();
  if (!address || typeof address === "string") throw new Error("只读工具桥接服务未取得监听端口");
  return {
    env: {
      COTHREAD_BRIDGE_URL: `http://127.0.0.1:${address.port}`,
      COTHREAD_BRIDGE_TOKEN: token,
      COTHREAD_ALLOWED_TOOLS: JSON.stringify(specs.map((spec) => spec.name)),
      COTHREAD_MCP_TOOLS: JSON.stringify(specs),
    },
    snapshots: () => [...pages.values()],
    close: () =>
      new Promise<void>((resolve, reject) =>
        bridge.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
