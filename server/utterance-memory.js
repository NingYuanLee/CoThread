import { randomUUID } from "node:crypto";
import { query } from "./db.js";

const MAX_BODY = 20000;
const MAX_SOURCES = 20;

/**
 * 发言记忆正文：只记他说过什么、主张什么，不评价人。
 * 骨架对齐 shared/memory-kinds.js 的 utterance：要点、立场与主张、承诺与待办、引用提示。
 */
export function utteranceMemoryMarkdown({ understanding, statementSummary } = {}) {
  const lines = ["## 要点", String(understanding || "").trim() || "- 暂无记录"];
  if (String(statementSummary || "").trim())
    lines.push("", "## 立场与主张", String(statementSummary).trim());
  lines.push(
    "",
    "## 承诺与待办",
    "- 待从发言与任务记忆补充",
    "",
    "## 引用提示",
    "- 出处见关联消息，需要原话时按出处打开",
  );
  return lines.join("\n").slice(0, MAX_BODY);
}

async function attachSources(db, pageId, messageIds) {
  const ids = [...new Set((messageIds || []).filter(Boolean))];
  for (const messageId of ids) {
    const [dup] = await query(
      db,
      "SELECT id FROM wiki_page_sources WHERE page_id=? AND source_kind='message' AND source_id=? LIMIT 1",
      [pageId, messageId],
    );
    if (dup) continue;
    await query(
      db,
      "INSERT INTO wiki_page_sources(id,page_id,source_kind,source_id,label) VALUES(?,?,'message',?,'群聊消息')",
      [randomUUID(), pageId, messageId],
    );
  }
}

/**
 * 发言记忆落 wiki：每个项目成员只有一条 utterance 页面（about_user_id 唯一），滚动更新。
 * 旧表 agent_member_summaries 保留为读取缓存，不再是唯一事实。
 */
export async function upsertUtteranceMemory(
  db,
  projectId,
  { memberId, memberName, understanding, statementSummary, messageIds = [], createdBy } = {},
) {
  if (!memberId) throw new Error("发言记忆需要成员");
  const [existing] = await query(
    db,
    `SELECT id FROM wiki_pages
     WHERE project_id=? AND subject_type='utterance' AND about_user_id=? AND status<>'superseded'
     ORDER BY updated_at DESC LIMIT 1`,
    [projectId, memberId],
  );
  const title = String(memberName || "成员").slice(0, 120) + " 的发言";
  const body = utteranceMemoryMarkdown({ understanding, statementSummary });
  let pageId = existing?.id || null;
  const created = !pageId;
  if (!pageId) {
    pageId = randomUUID();
    await query(
      db,
      `INSERT INTO wiki_pages(id,project_id,subject_type,about_user_id,kind,title,body,status,created_by,updated_by)
       VALUES(?,?,'utterance',?,'status',?,?,'current',?,?)`,
      [pageId, projectId, memberId, title, body, createdBy, createdBy],
    );
  } else {
    await query(db, "UPDATE wiki_pages SET title=?,body=?,updated_by=? WHERE id=?", [
      title,
      body,
      createdBy,
      pageId,
    ]);
  }
  await attachSources(db, pageId, messageIds.slice(-MAX_SOURCES));
  const { refreshMemberSummaryCache } = await import("./memory-cache.js");
  await refreshMemberSummaryCache(db, projectId, memberId).catch(() => {});
  return { pageId, created };
}
