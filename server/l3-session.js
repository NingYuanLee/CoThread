import { gzipSync, gunzipSync } from "node:zlib";
import { readdir, readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { tmpdir } from "node:os";
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

function projectDerivedMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map((message, index) => ({
    id: String(index),
    role: message.role || "user",
    source: message.source?.plugin || message.source?.kind || null,
    text: flattenContent(message.content).slice(0, 16000),
  })).filter((message) => message.text);
}

function messagesFromJsonlBytes(bytes) {
  const collected = [];
  for (const line of Buffer.from(bytes).toString("utf8").split("\n")) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); }
    catch { continue; }
    if (event.type === "user/message") {
      collected.push({
        role: event.data?.role || "user",
        source: event.data?.source,
        content: event.data?.content,
      });
    } else if (event.type === "assistant/message") {
      collected.push({
        role: "assistant",
        source: event.data?.message?.source || event.data?.source,
        content: event.data?.message?.content || event.data?.content,
      });
    }
  }
  return projectDerivedMessages(collected);
}

function checkpointFiles(checkpoint) {
  if (!checkpoint) return null;
  try {
    return JSON.parse(gunzipSync(checkpoint, { maxOutputLength: 40 * 1024 * 1024 }).toString());
  } catch {
    return null;
  }
}

function isSessionLog(path) {
  return path === "session.jsonl" || path.endsWith("/session.jsonl");
}

export function nativeHistoryFromCheckpoint(checkpoint, { sessionId } = {}) {
  const files = checkpointFiles(checkpoint);
  if (!files) return [];
  if (!sessionId && files["_cothread_context.json"]) {
    try {
      const projected = projectDerivedMessages(
        JSON.parse(Buffer.from(files["_cothread_context.json"], "base64").toString()),
      );
      if (projected.length) return projected;
    } catch { /* fall through to native DSH logs */ }
  }
  const projected = [];
  for (const [path, bytes] of Object.entries(files)) {
    if (!isSessionLog(path)) continue;
    if (sessionId && !path.split("/").includes(sessionId)) continue;
    try { projected.push(...messagesFromJsonlBytes(Buffer.from(bytes, "base64"))); }
    catch { /* skip a corrupt log and keep other sessions */ }
  }
  return projected;
}

export function agentRuntimeHome(homeId) {
  const root = process.env.COTHREAD_MAKERS === "true"
    ? resolve(tmpdir(), "cothread-agents") : resolve(".local/agents");
  return resolve(root, String(homeId));
}

export async function nativeHistoryFromLiveHome(homeId, sessionId) {
  const sessions = resolve(agentRuntimeHome(homeId), "sessions");
  const logs = [];
  const walk = async (path) => {
    for (const entry of await readdir(path, { withFileTypes: true }).catch(
      (error) => error.code === "ENOENT" ? [] : Promise.reject(error),
    )) {
      const candidate = resolve(path, entry.name);
      if (candidate !== sessions && !candidate.startsWith(sessions + sep)) continue;
      if (entry.isDirectory()) await walk(candidate);
      else if (entry.isFile() && entry.name === "session.jsonl") {
        if (sessionId && !path.split(/[/\\]/).includes(sessionId)) continue;
        logs.push(await readFile(candidate));
      }
    }
  };
  await walk(sessions);
  return logs.flatMap((bytes) => messagesFromJsonlBytes(bytes));
}

function derivedHistory(history) {
  if (!Array.isArray(history) || !history.length) return null;
  return history.map((message) => message.content
    ? message
    : {
      role: message.role || "user",
      source: message.source || undefined,
      content: [{ type: "text", text: String(message.text || "") }],
    });
}

export function checkpointFromHistory(history) {
  const messages = derivedHistory(history);
  if (!messages) return null;
  const checkpoint = gzipSync(JSON.stringify({
    "_cothread_context.json": Buffer.from(JSON.stringify(messages)).toString("base64"),
  }));
  if (checkpoint.length > 10 * 1024 * 1024) throw new Error("Agent 会话快照超过 10 MiB");
  return checkpoint;
}

export async function persistL3RunCheckpoint(db, executorId, history) {
  const checkpoint = checkpointFromHistory(history);
  if (!executorId || !checkpoint) return false;
  const result = await query(db, `UPDATE agent_task_execution_runs r
    JOIN (SELECT id FROM agent_task_execution_runs WHERE executor_id=? ORDER BY created_at DESC LIMIT 1) latest
    ON r.id=latest.id SET r.checkpoint=?`, [executorId, checkpoint]);
  return result.affectedRows > 0;
}

async function loadTaskReply(db, threadId, messageId) {
  const [row] = await query(db, `SELECT r.message_id,r.parent_message_id,r.agent_slot,r.status,r.progress,
    r.execution_active,r.error,s.checkpoint,s.context_stats,s.seen_sequence,s.compact_status,s.compact_error,s.compact_result
    FROM assistant_replies r JOIN messages m ON m.id=r.message_id
    LEFT JOIN agent_child_sessions s ON s.message_id=r.message_id
    WHERE r.message_id=? AND m.thread_id=?`, [messageId, threadId]);
  return row;
}

async function loadTaskPoolSession(db, threadId, taskId) {
  const [row] = await query(db, `SELECT t.id task_id,t.status,t.progress,t.result_summary,t.execution_agent_id,
    r.checkpoint,r.status run_status,r.error,r.executor_id,r.progress run_progress
    FROM agent_tasks t
    LEFT JOIN agent_task_execution_runs r ON r.id=(
      SELECT x.id FROM agent_task_execution_runs x WHERE x.task_id=t.id ORDER BY x.created_at DESC LIMIT 1)
    WHERE t.id=? AND t.origin_thread_id=?`, [taskId, threadId]);
  return row;
}

function mapEvents(events) {
  return events.map((event) => ({
    id: String(event.id),
    tool: event.tool,
    status: event.status,
    input: event.input || "",
    finished_at: event.finished_at,
  }));
}

async function historyForExecutor(db, threadId, executorId, checkpoint) {
  let messages = nativeHistoryFromCheckpoint(checkpoint);
  if (messages.length || !executorId) return messages;
  const [l2] = await query(db, "SELECT checkpoint FROM agent_sessions WHERE thread_id=?", [threadId]);
  messages = nativeHistoryFromCheckpoint(l2?.checkpoint, { sessionId: executorId });
  if (messages.length) return messages;
  return nativeHistoryFromLiveHome(threadId, executorId);
}

export async function readL3TaskSession(service, user, threadId, messageId) {
  await service.thread(user, threadId);
  const row = await loadTaskReply(service.db, threadId, messageId);
  if (row) {
    const pending = await query(service.db, `SELECT m.id,m.body,m.created_at,u.name author
      FROM agent_task_updates t JOIN messages m ON m.id=t.message_id JOIN users u ON u.id=m.author_id
      WHERE t.task_message_id=? AND t.delivered_at IS NULL ORDER BY m.sequence`, [messageId]);
    const events = await query(service.db, `SELECT e.id,e.tool,e.status,LEFT(e.input,2000) input,e.finished_at
      FROM agent_events e WHERE e.message_id=? ORDER BY e.id LIMIT 200`, [messageId]);
    let messages = nativeHistoryFromCheckpoint(row.checkpoint);
    if (!messages.length) messages = await nativeHistoryFromLiveHome(messageId);
    return {
      messageId: row.message_id,
      slot: row.agent_slot == null ? null : Number(row.agent_slot),
      status: row.status,
      progress: row.progress || null,
      running: row.status === "running" || !!row.execution_active,
      error: row.error || null,
      contextUsage: contextUsage(row, [], []),
      messages,
      events: mapEvents(events),
      pending: pending.map((item) => ({
        id: item.id,
        author: item.author,
        body: item.body,
        createdAt: item.created_at,
      })),
    };
  }
  const task = await loadTaskPoolSession(service.db, threadId, messageId);
  if (!task) {
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
  const executorId = task.executor_id || task.execution_agent_id;
  const running = ["queued", "running", "waiting"].includes(task.run_status || task.status);
  const events = executorId
    ? await query(service.db, `SELECT e.id,e.tool,e.status,LEFT(e.input,2000) input,e.finished_at
        FROM agent_events e WHERE e.agent_task_id=? OR e.agent_session_id=? ORDER BY e.id LIMIT 200`,
      [task.task_id, executorId])
    : [];
  const pending = await query(service.db, `SELECT id,body,created_at,source_type FROM agent_task_pool_updates
    WHERE task_id=? AND consumed_at IS NULL ORDER BY created_at`, [task.task_id]);
  return {
    messageId: task.task_id,
    slot: null,
    status: task.run_status || task.status,
    progress: task.run_progress || task.progress || null,
    running,
    error: task.error || null,
    contextUsage: contextUsage(null, [], []),
    messages: await historyForExecutor(service.db, threadId, executorId, task.checkpoint),
    events: mapEvents(events),
    pending: pending.map((item) => ({
      id: item.id,
      author: item.source_type === "human_member" ? "成员" : "调度",
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
