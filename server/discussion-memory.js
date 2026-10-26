import { randomUUID } from "node:crypto";
import { query } from "./db.js";
import { createMemoryRelation } from "./memory-graph.js";
import { DEFAULT_MEMORY_SUBTYPES } from "../shared/memory-taxonomy.js";

/** 话题归一键：标题去空白与标点后小写，用于跨迭代合并同一议题。 */
export function discussionTopicKey(title) {
  return String(title || "")
    .replace(/\s+/g, "")
    .replace(/[，。！？、：；\u201c\u201d\u2018\u2019（）()《》【】\[\]、,.!?:;"']/g, "")
    .toLowerCase()
    .slice(0, 80);
}

/** 讨论记忆正文骨架；没有的信息留空，不编造。 */
export function discussionMemoryMarkdown(topic = {}) {
  const list = (items) =>
    Array.isArray(items) && items.length
      ? items.map((item) => "- " + item).join("\n")
      : "- 暂无记录";
  return [
    "## 议题",
    topic.topic || "- 未记录",
    "",
    "## 参与者与观点",
    list(topic.positions),
    "",
    "## 依据与来源",
    list(topic.evidence),
    "",
    "## 已达成",
    list(topic.agreed),
    "",
    "## 仍在争",
    list(topic.open),
    "",
    "## 下一步与负责人",
    list(topic.next),
  ].join("\n");
}

/**
 * 讨论记忆是群体记忆：从消息出处反查参与者，把各自的发言记忆用 relates 连到这条讨论。
 * 幂等：关系已存在时走唯一键更新，不重复建边。
 */
export async function linkDiscussionParticipants(db, projectId, pageId, { createdBy = null } = {}) {
  const [page] = await query(
    db,
    "SELECT id,subject_type subjectType FROM wiki_pages WHERE project_id=? AND id=?",
    [projectId, pageId],
  );
  if (!page || page.subjectType !== "discussion") return { linked: 0 };
  const authors = await query(
    db,
    `SELECT DISTINCT m.author_id authorId
     FROM wiki_page_sources s JOIN messages m ON m.id=s.source_id
     WHERE s.page_id=? AND s.source_kind='message'`,
    [pageId],
  );
  const ids = authors.map((row) => row.authorId).filter(Boolean);
  if (!ids.length) return { linked: 0 };
  const pages = await query(
    db,
    `SELECT id FROM wiki_pages
     WHERE project_id=? AND subject_type='utterance' AND status='current'
       AND about_user_id IN (${ids.map(() => "?").join(",")})`,
    [projectId, ...ids],
  );
  let linked = 0;
  for (const row of pages) {
    await createMemoryRelation(db, {
      projectId,
      fromPageId: pageId,
      toPageId: row.id,
      relation: "relates",
      note: "讨论参与者",
      createdBy,
    });
    linked += 1;
  }
  return { linked };
}

/**
 * 写一条讨论记忆：同话题（标题归一键）已存在则更新正文并补出处，否则新建。
 * 返回 { pageId, created }，供结算和归档复用。
 */
export async function upsertDiscussionMemory(
  db,
  projectId,
  { title, body, sources = [], createdBy, status = "current" } = {},
) {
  const cleanTitle = String(title || "")
    .trim()
    .slice(0, 160);
  if (!cleanTitle) throw new Error("讨论记忆需要标题");
  const key = discussionTopicKey(cleanTitle);
  const existing = await query(
    db,
    "SELECT id,title,body FROM wiki_pages WHERE project_id=? AND subject_type='discussion' AND status<>'superseded'",
    [projectId],
  );
  const match = existing.find((row) => discussionTopicKey(row.title) === key);
  const bodyText = String(body || "").slice(0, 60000);
  let pageId = match?.id || null;
  let created = false;
  if (!pageId) {
    pageId = randomUUID();
    await query(
      db,
      "INSERT INTO wiki_pages(id,project_id,subject_type,memory_subtype,title,body,status,created_by,updated_by) VALUES(?,?,'discussion',?,?,?,?,?,?)",
      [
        pageId,
        projectId,
        DEFAULT_MEMORY_SUBTYPES.discussion,
        cleanTitle,
        bodyText,
        status,
        createdBy,
        createdBy,
      ],
    );
    created = true;
  } else if (bodyText && bodyText !== String(match.body || "")) {
    const merged = (String(match.body || "").trim() + "\n\n## 更新\n" + bodyText).slice(0, 60000);
    await query(db, "UPDATE wiki_pages SET body=?,updated_by=? WHERE id=?", [
      merged,
      createdBy,
      pageId,
    ]);
  }
  for (const source of sources) {
    if (!source?.kind || !source?.id) continue;
    const [dup] = await query(
      db,
      "SELECT id FROM wiki_page_sources WHERE page_id=? AND source_kind=? AND source_id=? LIMIT 1",
      [pageId, source.kind, source.id],
    );
    if (dup) continue;
    await query(
      db,
      "INSERT INTO wiki_page_sources(id,page_id,source_kind,source_id,label) VALUES(?,?,?,?,?)",
      [randomUUID(), pageId, source.kind, source.id, source.label || ""],
    );
  }
  const link = await linkDiscussionParticipants(db, projectId, pageId, { createdBy });
  return { pageId, created, linked: link.linked };
}

function parseSnapshot(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return {};
  }
}

/**
 * 宽窗口版讨论记忆：按一个迭代的全部可见发言生成/更新一条讨论记忆。
 * 与结算候选（≤40 条）不同，它扫整轮，用于归档时把讨论沉淀下来。
 * 话题聚类仍由 topicKey 保证同一迭代不重复建条；参与者用消息出处连发言记忆。
 */
export async function syncThreadDiscussionMemory(db, { projectId, threadId, createdBy } = {}) {
  if (!projectId || !threadId) return null;
  const [thread] = await query(
    db,
    `SELECT id,title,status,archive_snapshot archiveSnapshot FROM threads
     WHERE id=? AND project_id=?`,
    [threadId, projectId],
  );
  if (!thread) return null;
  const messages = await query(
    db,
    `SELECT m.id,m.author_id authorId,u.name author,m.body
     FROM messages m JOIN users u ON u.id=m.author_id
     WHERE m.thread_id=? AND m.source IN ('human','local_ai') AND m.body<>''
     ORDER BY m.sequence LIMIT 500`,
    [threadId],
  );
  if (!messages.length) return { skipped: true };
  const byAuthor = new Map();
  for (const message of messages) {
    const entry = byAuthor.get(message.authorId) || {
      id: message.authorId,
      name: message.author || "成员",
      points: [],
    };
    const text = String(message.body || "")
      .replace(/\s+/g, " ")
      .trim();
    if (text && entry.points.length < 2) entry.points.push(text.slice(0, 100));
    byAuthor.set(message.authorId, entry);
  }
  const participants = [...byAuthor.values()];
  const snapshot = parseSnapshot(thread.archiveSnapshot);
  const conclusion = String(snapshot.conclusion || "")
    .trim()
    .slice(0, 300);
  const body = [
    "## 议题",
    String(thread.title || "本轮讨论"),
    "",
    "## 参与者与观点",
    participants
      .map((member) => "- " + member.name + "：" + (member.points[0] || "（只有简短发言）"))
      .join("\n"),
    "",
    "## 依据与来源",
    "- 本轮群聊 " + messages.length + " 条可见发言，涉及 " + participants.length + " 名成员",
    conclusion ? "- 归档结论：" + conclusion : "- 暂无归档结论",
    "",
    "## 已达成",
    conclusion ? "- " + conclusion : "- 暂无记录",
    "",
    "## 仍在争",
    "- 待老翁从讨论里提炼（当前为窗口版）",
    "",
    "## 下一步与负责人",
    "- 见归档方案里的任务去向",
  ].join("\n");
  const result = await upsertDiscussionMemory(db, projectId, {
    title: "讨论：" + String(thread.title || threadId).slice(0, 120),
    body,
    sources: [
      { kind: "thread", id: threadId, label: "迭代" },
      ...messages.slice(0, 20).map((message) => ({
        kind: "message",
        id: message.id,
        label: "群聊消息",
      })),
    ],
    createdBy,
  });
  const { ensureProjectMemoryPage } = await import("./memory-pages.js");
  await ensureProjectMemoryPage(db, { projectId, createdBy });
  const [overall] = await query(
    db,
    `SELECT id FROM wiki_pages WHERE project_id=? AND subject_type='project' AND status='current'
     ORDER BY updated_at DESC LIMIT 1`,
    [projectId],
  );
  if (overall && overall.id !== result.pageId)
    await createMemoryRelation(db, {
      projectId,
      fromPageId: result.pageId,
      toPageId: overall.id,
      relation: "derives",
      note: "迭代讨论沉淀",
      createdBy,
    });
  return result;
}
