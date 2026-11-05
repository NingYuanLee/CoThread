import { query } from "./db.ts";
import { createHash } from "node:crypto";
import {
  intactConversationMemorySql,
  readableConversationMemorySql,
} from "./conversation-memory-integrity.ts";

export class ConversationSourceChangedError extends Error {}

/** Load a fixed window and the immediately preceding discussion. The returned
 * snapshots are kept server-side for optimistic concurrency; only summaries
 * should be sent to the model. */
export async function loadConversationContext(db, windowId) {
  const [window] = await query(
    db,
    `SELECT w.id,w.project_id projectId,w.thread_id threadId,
    w.first_sequence firstSequence,w.last_sequence lastSequence,t.title threadTitle,
    p.name projectName,p.description projectDescription,p.created_by projectOwner
    FROM conversation_memory_windows w JOIN threads t ON t.id=w.thread_id AND t.project_id=w.project_id
    JOIN projects p ON p.id=w.project_id WHERE w.id=?`,
    [windowId],
  );
  if (!window) throw new Error("联合分析窗口不存在");
  const columns = `m.id,m.sequence,m.author_id authorId,u.name author,m.body,m.created_at createdAt,m.thread_id threadId`;
  const messages = await query(
    db,
    `SELECT ${columns} FROM conversation_window_messages wm
    JOIN messages m ON m.id=wm.message_id JOIN users u ON u.id=m.author_id
    WHERE wm.window_id=? AND m.thread_id=? AND m.source<>'system' AND m.body<>''
    ORDER BY m.sequence`,
    [windowId, window.threadId],
  );
  if (!messages.length)
    throw new ConversationSourceChangedError("窗口消息已不可读取，需要重新核对");
  const frozen = await query(
    db,
    "SELECT message_id id,body_sha256 hash FROM conversation_window_messages WHERE window_id=? ORDER BY sequence",
    [windowId],
  );
  if (
    frozen.length !== messages.length ||
    frozen.some(
      (item, index) =>
        item.id !== messages[index].id ||
        item.hash !== createHash("sha256").update(messages[index].body, "utf8").digest("hex"),
    )
  )
    throw new ConversationSourceChangedError("窗口消息已被修改或删除，需要重新核对");
  const previous = await query(
    db,
    `SELECT ${columns} FROM messages m JOIN users u ON u.id=m.author_id
    WHERE m.thread_id=? AND m.sequence<? AND m.source<>'system' AND m.body<>''
    ORDER BY m.sequence DESC LIMIT 12`,
    [window.threadId, window.firstSequence],
  );
  const background = [];
  let chars = 0;
  for (const message of previous) {
    if (background.length && chars + message.body.length > 10000) break;
    background.push(message);
    chars += message.body.length;
  }
  background.reverse();
  const all = [...background, ...messages];
  const quotes = await query(
    db,
    `SELECT q.message_id messageId,q.quoted_message_id quotedMessageId,
    m.author_id authorId,u.name author,m.body,m.thread_id threadId,m.sequence,m.created_at createdAt
    FROM message_quotes q JOIN messages m ON m.id=q.quoted_message_id
    JOIN threads t ON t.id=m.thread_id AND t.project_id=? JOIN users u ON u.id=m.author_id
    WHERE q.message_id IN (${all.map(() => "?").join(",")}) LIMIT 30`,
    [window.projectId, ...all.map((message) => message.id)],
  );
  let quoteChars = 0;
  for (const quote of quotes) {
    const length = Array.from(String(quote.body || "")).length;
    if (quoteChars + length > 20000) {
      quote.body = null;
      quote.contentOmitted = true;
    } else quoteChars += length;
  }
  const members = [...new Set(messages.map((message) => message.authorId))];
  const pages = await query(
    db,
    `SELECT id,title,body,status,subject_type subjectType,
    about_user_id aboutUserId,memory_subtype subtype,updated_at updatedAt
    FROM wiki_pages p WHERE project_id=? AND status='current' AND ${readableConversationMemorySql("p")} AND
    (subject_type='discussion' OR (subject_type='utterance' AND about_user_id IN (${members.map(() => "?").join(",")})))
    ORDER BY updated_at DESC LIMIT 60`,
    [window.projectId, ...members],
  );
  const stalePages = await query(
    db,
    `SELECT DISTINCT p.id,p.title,p.body,p.status,p.subject_type subjectType,
    p.about_user_id aboutUserId,p.memory_subtype subtype,p.updated_at updatedAt
    FROM wiki_pages p JOIN conversation_memory_source_snapshots cs ON cs.page_id=p.id
    JOIN conversation_window_messages wm ON wm.message_id=cs.message_id
    WHERE wm.window_id=? AND p.project_id=? AND p.status='current' AND NOT ${intactConversationMemorySql("p")}
    LIMIT 50`,
    [windowId, window.projectId],
  );
  const index = pages.map(({ body, ...page }) => ({
    ...page,
    excerpt: String(body || "").slice(0, 250),
  }));
  const staleIndex = stalePages.map(({ body, ...page }) => ({
    ...page,
    excerpt: String(body || "").slice(0, 250),
    sourceNeedsReview: true,
  }));
  const observations = await query(
    db,
    `SELECT id,thread_id threadId,question,source_ids sourceIds,
    review_after reviewAfter FROM conversation_memory_observations
    WHERE project_id=? AND status='pending'
    ORDER BY (thread_id=?) DESC,created_at DESC LIMIT 20`,
    [window.projectId, window.threadId],
  );
  return {
    window,
    messages,
    background,
    quotes,
    pages: [...pages, ...stalePages],
    index,
    observations,
    stalePages,
    staleIndex,
  };
}
