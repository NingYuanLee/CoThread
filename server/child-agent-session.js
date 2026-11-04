import { gzipSync, gunzipSync } from "node:zlib";
import { readdir, readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { query, transaction } from "./db.js";
import { HttpError } from "./service.js";
import { publishWork } from "./work-events.js";
import { contextUsage } from "../shared/context.js";
import { createUsageMeter } from "./agent-usage.js";

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
  return messages
    .map((message, index) => ({
      id: String(index),
      role: message.role || "user",
      source: message.source?.plugin || message.source?.kind || null,
      text: flattenContent(message.content).slice(0, 16000),
      ...(message.createdAt ? { createdAt: message.createdAt } : {}),
      ...(message.usage ? { usage: message.usage } : {}),
    }))
    .filter((message) => message.text);
}

function messagesFromJsonlBytes(bytes) {
  const collected = [];
  let meter = createUsageMeter();
  let startedAt = null;
  let lastAssistant = null;
  const finish = (end) => {
    if (lastAssistant) {
      const usage = meter.result();
      const duration =
        Number.isFinite(startedAt) && Number.isFinite(end) && end >= startedAt
          ? end - startedAt
          : null;
      if (usage || duration != null)
        lastAssistant.usage = {
          ...usage,
          ...(duration != null ? { executionDurationMs: duration } : {}),
        };
    }
    meter = createUsageMeter();
    startedAt = null;
    lastAssistant = null;
  };
  for (const line of Buffer.from(bytes).toString("utf8").split("\n")) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === "turn/start") {
      finish(null);
      startedAt = Number.isFinite(event.time) ? event.time : null;
    }
    meter.notify(event);
    if (event.type === "user/message") {
      if (lastAssistant) finish(null);
      if (startedAt == null && Number.isFinite(event.time)) startedAt = event.time;
      collected.push({
        role: event.data?.role || "user",
        source: event.data?.source,
        content: event.data?.content,
        createdAt: Number.isFinite(event.time) ? new Date(event.time).toISOString() : null,
      });
    } else if (event.type === "assistant/message") {
      const message = {
        role: "assistant",
        source: event.data?.message?.source || event.data?.source,
        content: event.data?.message?.content || event.data?.content,
        createdAt: Number.isFinite(event.time) ? new Date(event.time).toISOString() : null,
      };
      collected.push(message);
      if (flattenContent(message.content)) lastAssistant = message;
    }
    if (event.type === "turn/end") finish(event.time);
  }
  finish(null);
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

const SESSION_LOG_NAME = /^session(\.v\d+)?\.jsonl$/;

function isSessionLog(path) {
  const name = String(path).split("/").pop();
  return SESSION_LOG_NAME.test(name);
}

export function nativeHistoryFromCheckpoint(
  checkpoint,
  { sessionId, includeMetadata = false } = {},
) {
  const files = checkpointFiles(checkpoint);
  if (!files) return [];
  let overlay = null;
  if ((!sessionId || includeMetadata) && files["_cothread_context.json"]) {
    try {
      const projected = projectDerivedMessages(
        JSON.parse(Buffer.from(files["_cothread_context.json"], "base64").toString()),
      );
      if (projected.length) {
        if (!includeMetadata) return projected;
        overlay = projected;
      }
    } catch {
      /* fall through to native DSH logs */
    }
  }
  const projected = [];
  for (const [path, bytes] of Object.entries(files)) {
    if (!isSessionLog(path)) continue;
    if (sessionId && !path.split("/").includes(sessionId)) continue;
    try {
      projected.push(...messagesFromJsonlBytes(Buffer.from(bytes, "base64")));
    } catch {
      /* skip a corrupt log and keep other sessions */
    }
  }
  if (!overlay) return projected;
  // Derived context can omit compacted messages; only attach metadata for exact,
  // ordered matches in this session's original log.
  let cursor = projected.length - 1;
  for (let index = overlay.length - 1; index >= 0; index--) {
    const message = overlay[index];
    let match = cursor;
    while (
      match >= 0 &&
      (projected[match].role !== message.role || projected[match].text !== message.text)
    )
      match--;
    if (match < 0) continue;
    const original = projected[match];
    if (original.createdAt) message.createdAt = original.createdAt;
    if (original.usage) message.usage = original.usage;
    cursor = match - 1;
  }
  return overlay;
}

export function agentRuntimeHome(homeId) {
  const root = resolve(".local/agents");
  return resolve(root, String(homeId));
}

export async function nativeHistoryFromLiveHome(homeId, sessionId) {
  const sessions = resolve(agentRuntimeHome(homeId), "sessions");
  const logs = [];
  const walk = async (path) => {
    for (const entry of await readdir(path, { withFileTypes: true }).catch((error) =>
      error.code === "ENOENT" ? [] : Promise.reject(error),
    )) {
      const candidate = resolve(path, entry.name);
      if (candidate !== sessions && !candidate.startsWith(sessions + sep)) continue;
      if (entry.isDirectory()) await walk(candidate);
      else if (entry.isFile() && SESSION_LOG_NAME.test(entry.name)) {
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
  return history.map((message) =>
    message.content
      ? message
      : {
          role: message.role || "user",
          source: message.source || undefined,
          content: [{ type: "text", text: String(message.text || "") }],
        },
  );
}

export function checkpointFromHistory(history) {
  const messages = derivedHistory(history);
  if (!messages) return null;
  const checkpoint = gzipSync(
    JSON.stringify({
      "_cothread_context.json": Buffer.from(JSON.stringify(messages)).toString("base64"),
    }),
  );
  if (checkpoint.length > 10 * 1024 * 1024) throw new Error("Agent 会话快照超过 10 MiB");
  return checkpoint;
}

export async function persistChildRunCheckpoint(db, executorId, history) {
  const checkpoint = checkpointFromHistory(history);
  if (!executorId || !checkpoint) return false;
  const result = await query(
    db,
    `UPDATE agent_task_execution_runs r
    JOIN (SELECT id FROM agent_task_execution_runs WHERE executor_id=? ORDER BY created_at DESC LIMIT 1) latest
    ON r.id=latest.id SET r.checkpoint=?`,
    [executorId, checkpoint],
  );
  return result.affectedRows > 0;
}

export async function persistChildContextStats(db, executorId, stats) {
  if (!executorId || !stats || typeof stats.used !== "number") return false;
  // Never clobber a real mid-run sample with a post-teardown empty measure
  // (missing live child → getOrCreateSession invents an empty session → used:0).
  if (stats.used <= 0) {
    const [latest] = await query(
      db,
      `SELECT context_stats FROM agent_task_execution_runs
      WHERE executor_id=? ORDER BY created_at DESC LIMIT 1`,
      [executorId],
    );
    const prior =
      typeof latest?.context_stats === "string"
        ? JSON.parse(latest.context_stats)
        : latest?.context_stats;
    if (prior && typeof prior.used === "number" && prior.used > 0) return false;
  }
  const result = await query(
    db,
    `UPDATE agent_task_execution_runs r
    JOIN (SELECT id FROM agent_task_execution_runs WHERE executor_id=? ORDER BY created_at DESC LIMIT 1) latest
    ON r.id=latest.id SET r.context_stats=?`,
    [executorId, JSON.stringify(stats)],
  );
  return result.affectedRows > 0;
}

async function loadTaskReply(db, threadId, messageId) {
  const [row] = await query(
    db,
    `SELECT r.message_id,r.parent_message_id,r.agent_slot,r.status,r.progress,
    r.execution_active,r.error,s.checkpoint,s.context_stats,s.seen_sequence,s.compact_status,s.compact_error,s.compact_result
    FROM assistant_replies r JOIN messages m ON m.id=r.message_id
    LEFT JOIN agent_child_sessions s ON s.message_id=r.message_id
    WHERE r.message_id=? AND m.thread_id=?`,
    [messageId, threadId],
  );
  return row;
}

async function loadTaskPoolSession(db, threadId, taskId) {
  const [row] = await query(
    db,
    `SELECT t.id task_id,t.status,t.progress,t.result_summary,t.execution_agent_id,
    t.title task_title,t.goal task_goal,t.created_at task_created_at,
    r.checkpoint,r.context_stats,r.status run_status,r.error,r.executor_id,r.progress run_progress
    FROM agent_tasks t
    LEFT JOIN agent_task_execution_runs r ON r.id=(
      SELECT x.id FROM agent_task_execution_runs x WHERE x.task_id=t.id ORDER BY x.created_at DESC LIMIT 1)
    WHERE t.id=? AND t.origin_thread_id=?`,
    [taskId, threadId],
  );
  return row;
}

function mapEvents(events) {
  return events.map((event) => ({
    id: String(event.id),
    tool: event.tool,
    status: event.status,
    input: event.input || "",
    finished_at: event.finished_at,
    screenshotUrl: event.visual_artifact_id
      ? `/api/agent-visual-artifacts/${event.visual_artifact_id}`
      : null,
  }));
}

/**
 * 用原生日志补回派生会话缺少的时间与用量。派生的 `_cothread_context.json`
 * 只有角色和正文；按 role + text 的倒序顺序匹配，命中才补，避免张冠李戴。
 */
export function mergeNativeMetadata(messages, native) {
  if (!Array.isArray(native) || !native.length) return messages;
  const merged = messages.map((message) => ({ ...message }));
  let cursor = merged.length - 1;
  for (let index = native.length - 1; index >= 0; index--) {
    const source = native[index];
    let match = cursor;
    while (match >= 0 && (merged[match].role !== source.role || merged[match].text !== source.text))
      match--;
    if (match < 0) continue;
    const target = merged[match];
    if (!target.createdAt && source.createdAt) target.createdAt = source.createdAt;
    if (!target.usage && source.usage) target.usage = source.usage;
    cursor = match - 1;
  }
  return merged;
}

async function historyForExecutor(db, threadId, executorId, checkpoint) {
  // 子会话的会话快照通常只有派生上下文（角色 + 正文），时间与用量在原生
  // session.v4.jsonl 里。读原生日志并合并元数据，前端才能显示派活时间与
  // 子 Agent 的耗时/用量。
  let messages = executorId
    ? nativeHistoryFromCheckpoint(checkpoint, { sessionId: executorId, includeMetadata: true })
    : nativeHistoryFromCheckpoint(checkpoint);
  if (messages.length)
    return executorId
      ? mergeNativeMetadata(messages, await nativeHistoryFromLiveHome(threadId, executorId))
      : messages;
  if (!executorId) return messages;
  const [xiaoxiang] = await query(db, "SELECT checkpoint FROM agent_sessions WHERE thread_id=?", [
    threadId,
  ]);
  messages = nativeHistoryFromCheckpoint(xiaoxiang?.checkpoint, {
    sessionId: executorId,
    includeMetadata: true,
  });
  if (messages.length)
    return mergeNativeMetadata(messages, await nativeHistoryFromLiveHome(threadId, executorId));
  return nativeHistoryFromLiveHome(threadId, executorId);
}

/**
 * 任务池里的子会话如果只有原生日志缺失、只剩事件，会话列表会为空，弹窗会同时
 * 显示空态和事件。把任务书作为「小祥派活」用户消息补在最前，保证派活总是可见。
 */
function withDispatchMessage(messages, task) {
  if (messages.some((message) => message.role === "user")) return messages;
  const text = String(task.task_goal || task.task_title || "").trim();
  if (!text) return messages;
  return [
    {
      id: `dispatch:${task.task_id}`,
      role: "user",
      source: "coordinator",
      text,
      ...(task.task_created_at ? { createdAt: task.task_created_at } : {}),
    },
    ...messages,
  ];
}

export async function readChildTaskSession(service, user, threadId, messageId) {
  await service.thread(user, threadId);
  const row = await loadTaskReply(service.db, threadId, messageId);
  if (row) {
    const pending = await query(
      service.db,
      `SELECT m.id,m.body,m.created_at,u.name author
      FROM agent_task_updates t JOIN messages m ON m.id=t.message_id JOIN users u ON u.id=m.author_id
      WHERE t.task_message_id=? AND t.delivered_at IS NULL ORDER BY m.sequence`,
      [messageId],
    );
    const events = await query(
      service.db,
      `SELECT e.id,e.tool,e.status,LEFT(e.input,2000) input,e.finished_at,a.id visual_artifact_id
      FROM agent_events e LEFT JOIN agent_visual_artifacts a ON a.agent_event_id=e.id
      WHERE e.message_id=? ORDER BY e.id LIMIT 200`,
      [messageId],
    );
    let messages = nativeHistoryFromCheckpoint(row.checkpoint, { includeMetadata: true });
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
    ? await query(
        service.db,
        `SELECT e.id,e.tool,e.status,LEFT(e.input,2000) input,e.finished_at,a.id visual_artifact_id
        FROM agent_events e LEFT JOIN agent_visual_artifacts a ON a.agent_event_id=e.id
        WHERE e.agent_task_id=? OR e.agent_session_id=? ORDER BY e.id LIMIT 200`,
        [task.task_id, executorId],
      )
    : [];
  const pending = await query(
    service.db,
    `SELECT id,body,created_at,source_type FROM agent_task_pool_updates
    WHERE task_id=? AND consumed_at IS NULL ORDER BY created_at`,
    [task.task_id],
  );
  const history = await historyForExecutor(service.db, threadId, executorId, task.checkpoint);
  return {
    messageId: task.task_id,
    slot: null,
    status: task.run_status || task.status,
    progress: task.run_progress || task.progress || null,
    running,
    error: task.error || null,
    contextUsage: contextUsage(task, [], []),
    messages: withDispatchMessage(history, task),
    events: mapEvents(events),
    pending: pending.map((item) => ({
      id: item.id,
      author: item.source_type === "human_member" ? "成员" : "调度",
      body: item.body,
      createdAt: item.created_at,
    })),
  };
}

export async function appendChildTaskSession(service, user, threadId, messageId, body) {
  if (user.kind !== "session") throw new HttpError(403, "需要登录后操作");
  const text = String(body || "").trim();
  if (!text) throw new HttpError(400, "请输入要追加的内容");
  if (text.length > 20000) throw new HttpError(400, "内容过长");
  const result = await transaction(service.db, async (db) => {
    const thread = await service.thread(user, threadId, true, db);
    const [reply] = await query(
      db,
      `SELECT r.message_id,r.parent_message_id,r.agent_slot,r.status,r.execution_active
       FROM assistant_replies r JOIN messages m ON m.id=r.message_id
       WHERE r.message_id=? AND m.thread_id=? FOR UPDATE`,
      [messageId, threadId],
    );
    if (!reply?.parent_message_id) throw new HttpError(404, "该执行任务还没有会话");
    const message = await service.insertMessage(db, user, threadId, text, [], "human", messageId);
    await query(
      db,
      "INSERT INTO agent_task_updates(message_id,task_message_id,approved) VALUES(?,?,TRUE)",
      [message.id, messageId],
    );
    if (["completed", "failed", "cancelled"].includes(reply.status) && !reply.execution_active) {
      await query(
        db,
        `UPDATE assistant_replies SET status='queued',error=NULL,finished_at=NULL,progress='等待继续处理'
        WHERE message_id=?`,
        [messageId],
      );
      await query(
        db,
        `UPDATE agent_requests SET status='queued',error=NULL WHERE message_id=? AND status IN ('completed','failed')`,
        [messageId],
      );
    }
    return { id: message.id, threadStatus: thread.status, replyStatus: reply.status };
  });
  publishWork(service.db, threadId);
  return { id: result.id, status: "queued" };
}
