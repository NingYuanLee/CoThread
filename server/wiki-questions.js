import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import { modelResponseStream, modelUsage, redactSecrets, responseText } from "./model-config.js";
import { getWikiPage, listWikiPages } from "./wiki-pages.js";
import { companyQuestionMaterials, orgQuestionMaterials } from "./org-shelf.js";
import { deepseekFetch, deepseekSearch } from "./deepseek-web.js";
import { runElderQuestion } from "./elder-kernel.js";
import { elderPersist, elderRoomState, recordElderRun, wikiScopeKey } from "./wiki-session.js";
import { callMcpTool } from "./mcp.js";
import { runMiaowenChat } from "./miaowen-skill.js";
import { injectEnvironmentVariables } from "./environment-variables.js";
import { MCP_CAPABILITIES } from "../shared/mcp-capabilities.js";
import { inferCitationKind } from "../shared/citations.js";

function responseReasoning(response) {
  const parts = [];
  for (const item of response?.output || []) {
    if (item?.type !== "reasoning") continue;
    for (const part of item.summary || item.content || []) {
      if (typeof part === "string") parts.push(part);
      else if (typeof part?.text === "string") parts.push(part.text);
    }
  }
  return parts.join("\n").trim();
}

const MATERIAL_READS = {
  wiki: ["search_wiki", "检索项目记忆", "read_wiki_page", "没有对上的现行记忆"],
  document: ["search_documents", "检索项目文档", "read_document", "没有对上的项目文档"],
  thread: ["search_threads", "检索迭代", "read_thread", "没有对上的迭代"],
  message: ["search_messages", "检索迭代消息", "read_message", "没有对上的消息"],
  task: ["search_tasks", "检索任务", "read_task", "没有对上的任务"],
  member: ["search_members", "检索成员", "read_member", "没有对上的成员"],
};

function materialKind(item) {
  return MATERIAL_READS[item.page?.kind] ? item.page.kind : "wiki";
}

function elderTrace(question, pages, thinking) {
  const groups = new Map();
  for (const item of pages) {
    const kind = materialKind(item);
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind).push(item);
  }
  if (!groups.size) groups.set("wiki", []);
  const steps = [];
  for (const [kind, items] of groups) {
    const [tool, label, read, empty] = MATERIAL_READS[kind];
    steps.push({
      tool,
      label,
      status: "completed",
      input: question,
      output: items.length ? items.map((item) => item.page.title).join("\n") : empty,
    });
    for (const item of items) {
      steps.push({
        tool: read,
        label: "阅读《" + item.page.title + "》",
        status: "completed",
        input: item.page.title,
        output: String(item.page.body || "").slice(0, 500),
      });
    }
  }
  if (thinking)
    steps.push({ tool: "thinking", label: "思考", status: "completed", text: thinking });
  return steps;
}

function materialText(materials) {
  return (
    materials
      .map((item) => item.page.title + "\n" + String(item.page.body || "").slice(0, 500))
      .join("\n\n")
      .slice(0, 4000) || "没有对上的内容。"
  );
}

export function elderDocumentReadText(value) {
  if (!value || typeof value !== "object") return "没有读到文档。";
  const title = value.title || value.filename || "文档";
  if (!value.text) {
    return [
      title,
      value.note || "没有可显示的正文。",
      `类型 ${value.mime || "未知"}`,
      `大小 ${value.byteSize ?? "未知"}`,
      `sha256 ${value.sha256 || ""}`,
    ].join("\n");
  }
  const header = [
    title,
    `${value.filename || ""} v${value.version ?? ""} ${value.mime || ""}`.trim(),
    value.truncated
      ? `正文从第 ${value.offset} 个字符起，本次 ${value.returned} 个，全文 ${value.totalChars} 个。继续请 read_document offset=${value.nextOffset}。`
      : `正文 ${value.returned} 个字符，未截断。`,
  ].join("\n");
  const content = String(value.content || "");
  const room = Math.max(0, 7800 - header.length - 1);
  const shown = content.slice(0, room);
  const extra = shown.length < content.length ? "\n（展示被截断，请用 offset 后续读）" : "";
  return `${header}\n${shown}${extra}`.slice(0, 8000);
}

function mcpText(value) {
  if (value && typeof value === "object" && !Array.isArray(value) && value.contentBase64) {
    const { contentBase64, ...meta } = value;
    return JSON.stringify({
      ...meta,
      contentOmitted: true,
      bytes: Buffer.from(contentBase64, "base64").length,
    }).slice(0, 8000);
  }
  const text = JSON.stringify(value ?? null);
  return text.length > 8000 ? text.slice(0, 8000) : text;
}

function mcpMaterials(name, value) {
  if (name === "search_memory" && Array.isArray(value?.entries)) {
    const kindOf = (kind) =>
      kind === "document_version"
        ? "document"
        : kind === "archive" || kind === "thread"
          ? "thread"
          : kind === "task"
            ? "task"
            : "message";
    return value.entries.flatMap((entry) =>
      (entry.sources || [])
        .slice(0, 2)
        .map((source) =>
          readRecord(
            kindOf(source.kind),
            source.id,
            entry.title,
            entry.excerpt,
            (entry.subjectLabel || "项目记忆") + " · " + (source.label || "出处"),
            source.id,
          ),
        ),
    );
  }
  if (name !== "get_project_context" || !Array.isArray(value?.threads)) return [];
  return value.threads.map((row) =>
    readRecord("thread", row.id, row.title, "状态：" + row.status, "迭代"),
  );
}

async function materialsFor(service, user, scope, ids, queryText) {
  if (scope === "project") return projectQuestionMaterials(service, user, ids.projectId, queryText);
  if (scope === "org") return orgQuestionMaterials(service, user, ids.orgId, queryText);
  if (ids.organization) return organizationQuestionMaterials(service, user, queryText);
  const project = ids.projectId
    ? await projectQuestionMaterials(service, user, ids.projectId, queryText)
    : [];
  return [...project, ...(await companyQuestionMaterials(service, user, queryText))];
}

async function openedIteration(service, user, projectId, threadId) {
  if (!projectId || !threadId) return null;
  await service.member(user, projectId, false);
  const [row] = await query(
    service.db,
    "SELECT id, title FROM threads WHERE id=? AND project_id=?",
    [threadId, projectId],
  );
  const title =
    typeof row?.title === "string" ? row.title.replace(/\s+/g, " ").trim().slice(0, 160) : "";
  return row?.id && title ? { id: row.id, title } : null;
}

async function answerWithKernel(service, user, scope, ids, question, options) {
  const lookup = async (name, args, hooks) => {
    if (name === "miaowen_chat") {
      const env = await injectEnvironmentVariables(service.db, [
        { scope: "personal", ownerId: user.id, key: "miaowen", as: "MIAOWEN_API_KEY" },
      ]);
      return runMiaowenChat(args, env.MIAOWEN_API_KEY, { onProgress: hooks?.onProgress });
    }
    if (name === "web_search") {
      const results = await searchPublicWeb(String(args.query || question), options.request);
      const text = results
        .map((item) => item.title + "\n" + item.url + "\n" + item.snippet)
        .join("\n\n");
      return { text: text || "没有查到公开网页。", materials: webMaterials(results) };
    }
    if (name === "web_fetch") {
      const page = await deepseekFetch(args.url, { request: options.request });
      return {
        text: page.title + "\n" + page.content,
        materials: webMaterials([{ title: page.title, url: page.url, snippet: page.content }]),
      };
    }
    if (MCP_CAPABILITIES.some((item) => item.access === "read" && item.name === name)) {
      const bound = { ...(args || {}) };
      if (scope === "project" && ids.projectId) bound.projectId = ids.projectId;
      else if (ids.projectId && bound.projectId == null) bound.projectId = ids.projectId;
      const value = await callMcpTool(service, user, name, bound);
      if (name === "read_document") {
        return {
          text: elderDocumentReadText(value),
          materials: value?.text
            ? [
                readRecord(
                  "document",
                  value.id,
                  value.title || value.filename || "文档",
                  value.content || value.note || "",
                  "项目文档",
                ),
              ]
            : [],
        };
      }
      return { text: mcpText(value), materials: mcpMaterials(name, value) };
    }
    const materials = await materialsFor(service, user, scope, ids, String(args.query || question));
    return { text: materialText(materials), materials };
  };
  const started = Date.now();
  try {
    const persist = await elderPersist(service.db, user, scope, ids);
    const produced = await runElderQuestion({
      question,
      scope,
      focus: options.focus,
      lookup,
      createHarness: options.createHarness,
      model: options.model,
      persist,
      onProgress: options.onProgress,
      db: service.db,
    });
    await recordElderRun(
      service.db,
      user,
      scope,
      ids,
      { ...produced, question, focus: options.focus },
      started,
    ).catch((error) => {
      console.error("老翁用量没有记下", { type: error?.name || "Error" });
    });
    return produced;
  } catch (error) {
    console.error("老翁内核没有跑起来", {
      type: error?.name || "Error",
      message: redactSecrets(error?.message || ""),
    });
    const materials = await materialsFor(service, user, scope, ids, question);
    const produced = await elderAnswer(
      { question, pages: materials, onProgress: options.onProgress },
      options.request,
    );
    const elapsed = Date.now() - started;
    const usage = produced.usage
      ? {
          ...produced.usage,
          modelMs: elapsed,
          executionDurationMs: elapsed,
          calls: produced.usage.calls || 1,
        }
      : null;
    await recordElderRun(
      service.db,
      user,
      scope,
      ids,
      { ...produced, materials, usage, question },
      started,
    ).catch(() => {});
    return { ...produced, materials, usage };
  }
}

async function elderAnswer({ question, pages, onProgress }, request) {
  const packed = pages
    .map((item) => {
      const sources = item.sources
        .map((source) => source.label)
        .filter(Boolean)
        .join("；");
      return (
        "页：" + item.page.title + "\n" + item.page.body + (sources ? "\n出处：" + sources : "")
      );
    })
    .join("\n\n");
  try {
    let text = "";
    const streamed = await modelResponseStream(
      {
        scope: "knowledge",
        maxTokens: 800,
        signal: AbortSignal.timeout(20000),
        messages: [
          {
            role: "system",
            content:
              "你是老翁，只根据给出的材料回答。材料可以是现行项目记忆、项目文档、迭代、迭代消息、任务和成员，全部只读。点明用到的标题。不要改文档、建任务或往群里发言。没有相关材料就说明没有。",
          },
          {
            role: "user",
            content: "问题：" + question + "\n\n" + (packed || "（没有检索到现行记忆）"),
          },
        ],
        onText(delta) {
          text += delta;
          onProgress?.({ text, trace: [] });
        },
      },
      request,
    );
    text = (streamed.text || text).trim();
    const trace = elderTrace(question, pages, responseReasoning(streamed.data));
    if (text) return { text, trace, usage: modelUsage(streamed.data?.usage) };
  } catch {
    // 模型不可用时仍把对上的页交给提问者。
  }
  const fallback = !pages.length
    ? "没有对上的现行记忆。"
    : ["根据这些记忆：", ...pages.map((item) => "- " + item.page.title)].join("\n");
  return { text: fallback, trace: elderTrace(question, pages, "") };
}

function parseJsonObject(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function parseTrace(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapRoom(rows) {
  const turns = [];
  for (const row of rows) {
    let turn = turns.find((item) => item.id === row.questionId);
    if (!turn) {
      turn = {
        id: row.questionId,
        body: row.questionBody,
        createdAt: row.createdAt,
        answer: row.answerId
          ? {
              id: row.answerId,
              body: row.answerBody,
              trace: parseTrace(row.answerTrace),
              usage: parseJsonObject(row.answerUsage),
              citations: [],
            }
          : null,
      };
      turns.push(turn);
    }
    if (row.citationId && turn.answer) {
      turn.answer.citations.push({
        id: row.citationId,
        pageId: row.pageId,
        label: row.citationLabel,
        kind: row.citationKind || inferCitationKind(row.citationLabel, row.pageId),
        target: row.citationTarget || null,
      });
    }
  }
  return turns;
}

const roomSql = `SELECT q.id questionId, q.body questionBody, q.created_at createdAt,
  a.id answerId, a.body answerBody, a.trace answerTrace, a.usage_json answerUsage, c.id citationId, c.page_id pageId, c.kind citationKind, c.target citationTarget, c.label citationLabel
  FROM wiki_questions q
  LEFT JOIN wiki_answers a ON a.question_id=q.id
  LEFT JOIN wiki_answer_citations c ON c.answer_id=a.id
  WHERE q.scope=? AND q.user_id=? AND ((? IS NULL AND q.project_id IS NULL) OR q.project_id=?) AND ((? IS NULL AND q.org_id IS NULL) OR q.org_id=?)
  ORDER BY q.created_at, q.id, c.created_at, c.id`;

// 会话归属只看「人 + 项目」：同一个项目里换询问范围（当前项目 / 所属全部 / 公开网页）
// 读到的是同一段对话，符合「一个项目一个用户一个会话」。
const roomByProjectSql = roomSql.replace("WHERE q.scope=? AND q.user_id=?", "WHERE q.user_id=?");

export async function listWikiQuestions(service, user, projectId) {
  await service.member(user, projectId, false);
  const rows = await query(service.db, roomByProjectSql, [
    user.id,
    projectId,
    projectId,
    null,
    null,
  ]);
  const state = await elderRoomState(service.db, user, "project", { projectId });
  // 底部统计的「轮 / 步」要和轨迹同源：只算真正记录了轨迹的事件，早期没有轨迹的问句不算。
  // 步数规则与前端 buildTrajectory 一致：每条助手事件算一次请求，某些轮次里「先调工具、后才有助手」
  // 的情况会补一条隐式请求。
  const eventRows = await query(
    service.db,
    `SELECT e.tool FROM wiki_session_events e
      JOIN wiki_sessions s ON s.id=e.session_row_id
      WHERE s.user_id=? AND s.scope_key=? ORDER BY e.created_at, e.id`,
    [user.id, wikiScopeKey("project", { projectId })],
  );
  const assistantTools = new Set(["understanding", "assistant_text", "assistant_final"]);
  let rounds = 0;
  let steps = 0;
  let requestInRound = 0;
  for (const event of eventRows) {
    const tool = String(event.tool || "");
    if (tool === "user_input") {
      rounds += 1;
      requestInRound = 0;
      continue;
    }
    if (assistantTools.has(tool)) {
      steps += 1;
      requestInRound += 1;
      continue;
    }
    // 工具/子工具出现在本轮还没有请求时：轨迹会补一条隐式请求，这里同样算一步。
    if (requestInRound === 0 && /^(tool|subtool|search_|read_|list_|get_|web_)/.test(tool)) {
      steps += 1;
      requestInRound += 1;
    }
  }
  return {
    turns: mapRoom(rows),
    rounds,
    steps,
    ...state,
  };
}

async function organizationQuestionMaterials(service, user, question) {
  const projects = await query(
    service.db,
    `SELECT p.id, p.name FROM projects p
      JOIN members m ON m.project_id=p.id AND m.user_id=?
      WHERE p.archived_at IS NULL
      ORDER BY p.name, p.id`,
    [user.id],
  );
  const pages = [];
  for (const project of projects) {
    const found = await projectQuestionMaterials(service, user, project.id, question);
    for (const item of found.slice(0, 5)) {
      pages.push({
        ...item,
        citation: {
          pageId: materialKind(item) === "wiki" ? item.page.id : null,
          label:
            item.page.title +
            " · " +
            project.name +
            (materialKind(item) === "wiki" ? "" : " · " + (item.sources?.[0]?.label || "只读")),
        },
      });
      if (pages.length >= 8) break;
    }
    if (pages.length >= 8) break;
  }
  const guides = await companyQuestionMaterials(service, user, question);
  return [
    ...pages,
    ...guides.map((item) => ({
      ...item,
      sources: [{ label: "公司公开指南" }],
      citation: { pageId: null, label: item.page.title + " · 公司公开指南" },
    })),
  ];
}

function likeTerm(question) {
  return String(question || "")
    .trim()
    .slice(0, 40)
    .replace(/[%_\\]/g, "");
}

const PAGE_KINDS = new Set(["web", "document", "thread", "message", "task", "member", "brief"]);
const WIKI_KINDS = new Set(["wiki", "guide", "decision", "retro", "glossary", "status"]);

function kindFrom(item, label) {
  const pageKind = item.page?.kind;
  if (PAGE_KINDS.has(pageKind)) return pageKind;
  const inferred = inferCitationKind(label, item.page?.id || null);
  if (inferred !== "other") return inferred;
  if (WIKI_KINDS.has(pageKind)) return "wiki";
  return "other";
}

function citationOf(item) {
  const source = item.sources?.[0];
  const explicit = item.citation || {};
  const label =
    explicit.label || (item.page?.title || "") + (source?.label ? " · " + source.label : "");
  const kind = explicit.kind || kindFrom(item, label);
  const pageId = item.citation
    ? explicit.pageId || null
    : kind === "wiki"
      ? item.page?.id || null
      : null;
  const target = explicit.target || (kind === "message" ? null : item.page?.id || null);
  return { pageId, label, kind, target: target || null };
}

async function insertCitation(conn, answerId, item) {
  const citation = citationOf(item);
  await query(
    conn,
    "INSERT INTO wiki_answer_citations(id,answer_id,page_id,kind,target,label) VALUES(?,?,?,?,?,?)",
    [
      randomUUID(),
      answerId,
      citation.pageId,
      citation.kind || null,
      citation.target ? String(citation.target).slice(0, 2048) : null,
      String(citation.label || item.page?.title || "").slice(0, 240),
    ],
  );
}

function uniqueCited(items) {
  const seen = new Set();
  const unique = [];
  for (const item of items || []) {
    const label = String(citationOf(item).label || item.page?.title || "").trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    unique.push(item);
  }
  return unique;
}

function readRecord(kind, id, title, body, label, target) {
  return {
    page: { id, title, body: String(body || "").slice(0, 500), kind },
    sources: [{ label }],
    citation: { pageId: null, label: title + " · " + label, kind, target: target || id },
  };
}

async function projectRecordMaterials(db, projectId, question) {
  const text = likeTerm(question);
  if (!text) return [];
  const like = "%" + text + "%";
  const threads = await query(
    db,
    "SELECT id, title, status FROM threads WHERE project_id=? AND title LIKE ? ORDER BY created_at DESC LIMIT 3",
    [projectId, like],
  );
  const messages = await query(
    db,
    `SELECT m.id, m.body, t.id threadId, t.title threadTitle, u.id authorId, u.name authorName
      FROM messages m
      JOIN threads t ON t.id=m.thread_id
      JOIN users u ON u.id=m.author_id
      WHERE t.project_id=? AND m.body LIKE ?
      ORDER BY m.created_at DESC LIMIT 4`,
    [projectId, like],
  );
  const tasks = await query(
    db,
    "SELECT id, title, goal, status FROM agent_tasks WHERE project_id=? AND (title LIKE ? OR goal LIKE ?) ORDER BY updated_at DESC LIMIT 3",
    [projectId, like, like],
  );
  const members = await query(
    db,
    `SELECT u.id, u.name, mem.role FROM members mem
      JOIN users u ON u.id=mem.user_id
      WHERE mem.project_id=? AND u.name LIKE ?
      ORDER BY u.name LIMIT 5`,
    [projectId, like],
  );
  const related = new Map();
  for (const row of messages) {
    const key = row.threadId + "\0" + row.authorId;
    related.set(key, (related.get(key) || 0) + 1);
  }
  return [
    ...threads.map((row) => readRecord("thread", row.id, row.title, "状态：" + row.status, "迭代")),
    ...messages.map((row) =>
      readRecord(
        "message",
        row.id,
        row.threadTitle + " · " + row.authorName,
        row.body,
        (related.get(row.threadId + "\0" + row.authorId) || 1) + "条相关",
        row.threadId,
      ),
    ),
    ...tasks.map((row) =>
      readRecord(
        "task",
        row.id,
        row.title,
        "状态：" + row.status + "\n" + String(row.goal || ""),
        "任务",
      ),
    ),
    ...members.map((row) => readRecord("member", row.id, row.name, "角色：" + row.role, "成员")),
  ];
}

async function projectDocumentMaterials(service, user, projectId, question) {
  const text = likeTerm(question);
  if (!text) return [];
  const like = "%" + text + "%";
  const rows = await query(
    service.db,
    `SELECT a.id, a.title, v.filename, v.note,
        CASE WHEN v.byte_size <= 20000 AND (v.mime LIKE 'text/%' OR v.mime IN ('application/json','application/xml'))
          THEN CONVERT(SUBSTRING(v.content, 1, 2000) USING utf8mb4) ELSE NULL END body
      FROM artifacts a
      JOIN document_folders f ON f.id=a.folder_id AND f.project_id=a.project_id
      JOIN versions v ON v.id=(SELECT v2.id FROM versions v2 WHERE v2.artifact_id=a.id
        ORDER BY v2.version DESC, v2.created_at DESC, v2.id DESC LIMIT 1)
      LEFT JOIN version_recycle vr ON vr.version_id=v.id
      WHERE a.project_id=? AND a.deleted_at IS NULL AND vr.version_id IS NULL
        AND f.folder_kind='project_official'
        AND (a.title LIKE ? OR v.filename LIKE ? OR v.note LIKE ?)
      ORDER BY v.created_at DESC, a.id
      LIMIT 3`,
    [projectId, like, like, like],
  );
  return rows.map((row) => ({
    page: {
      id: row.id,
      title: row.title,
      body: String(row.body || [row.filename, row.note].filter(Boolean).join("\n")).slice(0, 2000),
      kind: "document",
    },
    sources: [{ label: "项目文档" }],
    citation: { pageId: null, label: row.title + " · 项目文档" },
  }));
}

async function projectQuestionMaterials(service, user, projectId, question) {
  await service.member(user, projectId, false);
  const found = await listWikiPages(service, user, projectId, question);
  const current = found.pages.filter((page) => page.status === "current").slice(0, 5);
  const pages = [];
  for (const page of current) pages.push(await getWikiPage(service, user, projectId, page.id));
  pages.push(...(await projectDocumentMaterials(service, user, projectId, question)));
  pages.push(...(await projectRecordMaterials(service.db, projectId, question)));
  return pages;
}

export async function askWikiQuestion(service, user, projectId, input, options = {}) {
  const data = z
    .object({ body: z.string().trim().min(1).max(4000), threadId: z.string().uuid().optional() })
    .parse(input);
  const asked = {
    ...options,
    focus: await openedIteration(service, user, projectId, data.threadId),
  };
  const pages = asked.answer
    ? await projectQuestionMaterials(service, user, projectId, data.body)
    : [];
  const produced = asked.answer
    ? {
        text: String(await asked.answer({ question: data.body, pages })),
        trace: elderTrace(data.body, pages, ""),
        materials: pages,
      }
    : await answerWithKernel(service, user, "project", { projectId }, data.body, asked);
  const cited = uniqueCited(produced.materials || pages);
  const answerBody = produced.text;
  const questionId = randomUUID();
  const answerId = randomUUID();
  await transaction(service.db, async (conn) => {
    await query(
      conn,
      "INSERT INTO wiki_questions(id,scope,project_id,user_id,body) VALUES(?,?,?,?,?)",
      [questionId, "project", projectId, user.id, data.body],
    );
    await query(
      conn,
      "INSERT INTO wiki_answers(id,question_id,body,trace,usage_json) VALUES(?,?,?,?,?)",
      [
        answerId,
        questionId,
        answerBody.slice(0, 60000),
        JSON.stringify(produced.trace),
        produced.usage ? JSON.stringify(produced.usage) : null,
      ],
    );
    for (const item of cited) await insertCitation(conn, answerId, item);
  });
  const room = await listWikiQuestions(service, user, projectId);
  return { turn: room.turns.find((item) => item.id === questionId) || null };
}

async function listScoped(service, user, scope, projectId, orgId) {
  const rows = await query(service.db, roomSql, [
    scope,
    user.id,
    projectId,
    projectId,
    orgId,
    orgId,
  ]);
  return mapRoom(rows);
}

async function saveScoped(service, user, scope, projectId, orgId, body, pages) {
  const answerBody = String(body).slice(0, 60000);
  const trace = pages.trace || elderTrace(pages.question, pages.materials, "");
  const questionId = randomUUID();
  const answerId = randomUUID();
  await transaction(service.db, async (conn) => {
    await query(
      conn,
      "INSERT INTO wiki_questions(id,scope,project_id,org_id,user_id,body) VALUES(?,?,?,?,?,?)",
      [questionId, scope, projectId, orgId, user.id, pages.question],
    );
    await query(
      conn,
      "INSERT INTO wiki_answers(id,question_id,body,trace,usage_json) VALUES(?,?,?,?,?)",
      [
        answerId,
        questionId,
        answerBody,
        JSON.stringify(trace),
        pages.usage ? JSON.stringify(pages.usage) : null,
      ],
    );
    for (const item of uniqueCited(pages.materials)) await insertCitation(conn, answerId, item);
  });
  const turns = await listScoped(service, user, scope, projectId, orgId);
  return { turn: turns.find((item) => item.id === questionId) || null };
}

export async function listOrgQuestions(service, user, orgId) {
  await orgQuestionMaterials(service, user, orgId, "");
  return {
    turns: await listScoped(service, user, "org", null, orgId),
    ...(await elderRoomState(service.db, user, "org", { orgId })),
  };
}

export async function askOrgQuestion(service, user, orgId, input, options = {}) {
  const data = z.object({ body: z.string().trim().min(1).max(4000) }).parse(input);
  const materials = options.answer
    ? await orgQuestionMaterials(service, user, orgId, data.body)
    : [];
  const produced = options.answer
    ? { text: String(await options.answer({ question: data.body, pages: materials })), materials }
    : await answerWithKernel(service, user, "org", { orgId }, data.body, options);
  return saveScoped(service, user, "org", null, orgId, produced.text, {
    question: data.body,
    materials: produced.materials || materials,
    trace: produced.trace,
    usage: produced.usage,
  });
}

export async function listCompanyQuestions(service, user, projectId = null) {
  if (projectId) return listWikiQuestions(service, user, projectId);
  await companyQuestionMaterials(service, user, "");
  return {
    turns: await listScoped(service, user, "company", null, null),
    ...(await elderRoomState(service.db, user, "company", {})),
  };
}

export async function askCompanyQuestion(service, user, input, options = {}) {
  const data = z
    .object({
      body: z.string().trim().min(1).max(4000),
      projectId: z.string().uuid().optional(),
      organization: z.boolean().optional(),
      threadId: z.string().uuid().optional(),
    })
    .parse(input);
  const ids = { projectId: data.projectId, organization: data.organization };
  const asked = {
    ...options,
    focus: await openedIteration(service, user, data.projectId, data.threadId),
  };
  const materials = asked.answer
    ? await materialsFor(service, user, "company", ids, data.body)
    : [];
  const produced = asked.answer
    ? { text: String(await asked.answer({ question: data.body, pages: materials })), materials }
    : await answerWithKernel(service, user, "company", ids, data.body, asked);
  return saveScoped(service, user, "company", null, null, produced.text, {
    question: data.body,
    materials: produced.materials || materials,
    trace: produced.trace,
    usage: produced.usage,
  });
}

export async function searchPublicWeb(question, request = fetch) {
  const found = await deepseekSearch(question, { oriQuestion: question, request });
  return Promise.all(
    found.map(async (item) => {
      if (!item?.url) return item;
      try {
        const page = await deepseekFetch(item.url, { request });
        return {
          ...item,
          title: page.title || item.title,
          snippet: String(page.content || item.snippet || ""),
        };
      } catch {
        return item;
      }
    }),
  );
}

function webTrace(question, results, thinking, note = "") {
  const steps = [
    {
      tool: "search_web",
      label: "检索公开网页",
      status: "completed",
      input: question,
      output: results.length
        ? results.map((item) => item.title).join("\n")
        : note || "没有查到公开网页",
    },
    ...results.map((item) => ({
      tool: "read_web_page",
      label: "阅读「" + item.title + "」",
      status: "completed",
      input: item.url,
      output: item.snippet,
    })),
  ];
  if (thinking)
    steps.push({ tool: "thinking", label: "思考", status: "completed", text: thinking });
  return steps;
}

function webMaterials(results) {
  return results.map((item) => ({
    page: { id: item.url, title: item.title, body: item.snippet, kind: "web" },
    sources: [{ label: "公开网页" }],
    citation: { pageId: null, label: item.title + " · 公开网页" },
  }));
}

function scopeTrace(question, internal, results, thinking, note = "") {
  return [
    ...(internal.length ? elderTrace(question, internal, "") : []),
    ...webTrace(question, results, thinking, note),
  ];
}

async function webAnswer({ question, internal, results, note = "" }, request) {
  if (!results.length && !internal.length)
    return {
      text: note || "项目、公司资料和公开网页里都没有查到。",
      trace: webTrace(question, results, "", note),
    };
  const packed = [
    ...internal.map((item) => "内部：" + item.page.title + "\n" + item.page.body),
    ...results.map((item) => "网页：" + item.title + "\n" + item.url + "\n" + item.snippet),
  ].join("\n\n");
  try {
    const response = await modelResponse(
      {
        scope: "knowledge",
        maxTokens: 800,
        reasoningEffort: "low",
        signal: AbortSignal.timeout(20000),
        messages: [
          {
            role: "system",
            content:
              "你是老翁。材料从内到外依次是用户所在项目的现行记忆、公司公开指南和公开网页，都可以用。点明用到的标题。都没有就说明没有。",
          },
          { role: "user", content: "问题：" + question + "\n\n" + packed },
        ],
      },
      request,
    );
    const text = responseText(response).trim();
    const trace = scopeTrace(question, internal, results, responseReasoning(response), note);
    if (text) return { text, trace };
  } catch {
    // 模型不可用时仍把查到的标题交给提问者。
  }
  const titles = [...internal.map((item) => item.page.title), ...results.map((item) => item.title)];
  return {
    text: ["根据这些材料：", ...titles.map((title) => "- " + title)].join("\n"),
    trace: scopeTrace(question, internal, results, "", note),
  };
}

export async function listWebQuestions(service, user, projectId = null) {
  if (projectId) return listWikiQuestions(service, user, projectId);
  await companyQuestionMaterials(service, user, "");
  return {
    turns: await listScoped(service, user, "web", null, null),
    ...(await elderRoomState(service.db, user, "web", {})),
  };
}

export async function askWebQuestion(service, user, input, options = {}) {
  const data = z
    .object({
      body: z.string().trim().min(1).max(4000),
      projectId: z.string().uuid().optional(),
      organization: z.boolean().optional(),
      threadId: z.string().uuid().optional(),
    })
    .parse(input);
  const asked = {
    ...options,
    focus: await openedIteration(service, user, data.projectId, data.threadId),
  };
  if (!asked.answer && !asked.search) {
    const produced = await answerWithKernel(
      service,
      user,
      "web",
      { projectId: data.projectId, organization: data.organization },
      data.body,
      asked,
    );
    return saveScoped(service, user, "web", null, null, produced.text, {
      question: data.body,
      materials: produced.materials || [],
      trace: produced.trace,
      usage: produced.usage,
    });
  }
  const internal = data.organization
    ? await organizationQuestionMaterials(service, user, data.body)
    : [
        ...(data.projectId
          ? await projectQuestionMaterials(service, user, data.projectId, data.body)
          : []),
        ...(await companyQuestionMaterials(service, user, data.body)),
      ];
  let results = [];
  let note = "";
  try {
    results = asked.search
      ? await asked.search(data.body)
      : await searchPublicWeb(data.body, asked.request);
  } catch (error) {
    note = error?.status === 409 ? error.message : "";
    results = [];
  }
  const materials = [...internal, ...webMaterials(results)];
  const produced = asked.answer
    ? {
        text: String(await asked.answer({ question: data.body, pages: materials })),
        trace: scopeTrace(data.body, internal, results, "", note),
      }
    : await webAnswer({ question: data.body, internal, results, note }, asked.request);
  return saveScoped(service, user, "web", null, null, produced.text, {
    question: data.body,
    materials,
    trace: produced.trace,
    usage: produced.usage,
  });
}
