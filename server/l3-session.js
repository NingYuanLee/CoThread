import { gunzipSync } from "node:zlib";
import { query, transaction } from "./db.js";
import { HttpError } from "./service.js";
import { publishWork } from "./work-events.js";
import { contextUsage } from "../shared/context.js";

function flattenContent(content) {
  const parts = [];
  const walk = (blocks) => {
    for (const block of blocks || []) {
      if (typeof block === "string") parts.push(block);
      else if (block?.type === "text" && block.text) parts.push(block.text);
      else if (block?.type === "tool-result") {
        if (block.isError) parts.push("工具失败");
        walk(block.content);
      } else if (block && ["image", "audio", "video", "file"].includes(block.type))
        parts.push(`（${block.type}）`);
    }
  };
  walk(content);
  return parts.join("\n").replace(/\s+\n/g, "\n").trim();
}

export function nativeHistoryFromCheckpoint(checkpoint) {
  if (!checkpoint) return [];
  const files = JSON.parse(gunzipSync(checkpoint, { maxOutputLength: 40 * 1024 * 1024 }).toString());
  if (!files["_cothread_context.json"]) return [];
  const messages = JSON.parse(Buffer.from(files["_cothread_context.json"], "base64").toString());
  if (!Array.isArray(messages)) return [];
  return messages.map((message, index) => ({
    id: String(index),
    role: message.role || "user",
    source: message.source?.plugin || message.source?.kind || null,
    text: flattenContent(message.content).slice(0, 16000),
  })).filter((message) => message.text);
}

async function loadTaskReply(db, threadId, messageId) {
  const [row] = await query(db, `SELECT r.message_id,r.parent_message_id,r.agent_slot,r.status,r.progress,
    r.execution_active,r.error,s.checkpoint,s.context_stats,s.seen_sequence,s.compact_status,s.compact_error,s.compact_result
    FROM assistant_replies r JOIN messages m ON m.id=r.message_id
    LEFT JOIN agent_child_sessions s ON s.message_id=r.message_id
    WHERE r.message_id=? AND m.thread_id=?`, [messageId, threadId]);
  return row;
}

export async function readL3TaskSession(service, user, threadId, messageId) {
  await service.thread(user, threadId);
  const row = await loadTaskReply(service.db, threadId, messageId);
  if (!row) {
    return {
      messageId,
      slot: null,
      status: "idle",
      progress: null,
      running: false,
      error: null,
      contextUsage: contextUsage(null, [], []),
      messages: [],
      events: [],
      pending: [],
    };
  }
  const pending = await query(service.db, `SELECT m.id,m.body,m.created_at,u.name author
    FROM agent_task_updates t JOIN messages m ON m.id=t.message_id JOIN users u ON u.id=m.author_id
    WHERE t.task_message_id=? AND t.delivered_at IS NULL ORDER BY m.sequence`, [messageId]);
  const events = await query(service.db, `SELECT e.id,e.tool,e.status,LEFT(e.input,2000) input,e.finished_at
    FROM agent_events e WHERE e.message_id=? ORDER BY e.id LIMIT 200`, [messageId]);
  return {
    messageId: row.message_id,
    slot: row.agent_slot == null ? null : Number(row.agent_slot),
    status: row.status,
    progress: row.progress || null,
    running: row.status === "running" || !!row.execution_active,
    error: row.error || null,
    contextUsage: contextUsage(row, [], []),
    messages: nativeHistoryFromCheckpoint(row.checkpoint),
    events: events.map((event) => ({
      id: String(event.id),
      tool: event.tool,
      status: event.status,
      input: event.input || "",
      finished_at: event.finished_at,
    })),
    pending: pending.map((item) => ({
      id: item.id,
      author: item.author,
      body: item.body,
      createdAt: item.created_at,
    })),
  };
}

export async function appendL3TaskSession(service, user, threadId, messageId, body) {
  if (user.kind !== "session") throw new HttpError(403, "需要登录后操作");
  const text = String(body || "").trim();
  if (!text) throw new HttpError(400, "请输入要追加的内容");
  if (text.length > 20000) throw new HttpError(400, "内容过长");
  const result = await transaction(service.db, async (db) => {
    const thread = await service.thread(user, threadId, true, db);
    const [reply] = await query(db,
      `SELECT r.message_id,r.parent_message_id,r.agent_slot,r.status,r.execution_active
       FROM assistant_replies r JOIN messages m ON m.id=r.message_id
       WHERE r.message_id=? AND m.thread_id=? FOR UPDATE`, [messageId, threadId]);
    if (!reply?.parent_message_id) throw new HttpError(404, "该执行任务还没有会话");
    const message = await service.insertMessage(db, user, threadId, text, [], "human", messageId);
    await query(db, "INSERT INTO agent_task_updates(message_id,task_message_id,approved) VALUES(?,?,TRUE)",
      [message.id, messageId]);
    if (["completed", "failed", "cancelled"].includes(reply.status) && !reply.execution_active) {
      await query(db, `UPDATE assistant_replies SET status='queued',error=NULL,finished_at=NULL,progress='等待继续处理'
        WHERE message_id=?`, [messageId]);
      await query(db, `UPDATE agent_requests SET status='queued',error=NULL WHERE message_id=? AND status IN ('completed','failed')`,
        [messageId]);
    }
    return { id: message.id, threadStatus: thread.status, replyStatus: reply.status };
  });
  publishWork(service.db, threadId);
  return { id: result.id, status: "queued" };
}
