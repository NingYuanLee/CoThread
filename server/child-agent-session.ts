import * as zlib from "node:zlib";
import { gzipSync, gunzipSync } from "node:zlib";
import { readdir, readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { query, transaction } from "./db.ts";
import { HttpError } from "./http-error.ts";
import { publishWork } from "./work-events.ts";
import { contextUsage } from "../shared/context.js";
import { createUsageMeter } from "./agent-usage.ts";
import type { Pool } from "mysql2/promise";
import type { Db } from "./types.ts";
import type { Service } from "./service.ts";

/**
 * 一条原生会话历史消息。
 *
 * 三个来源（快照里的派生投影、`session.v4.jsonl` 归一、`_cothread_context.json`）
 * 都收敛到这一形状：正文进 `text`，时间与用量是可缺省的元数据。
 */
type HistoryMessage = {
  id: string;
  role: string;
  source?: unknown;
  text: string;
  createdAt?: string;
  usage?: unknown;
};

/** 时间线里的一个工具步骤。 */
type TimelineProcessStep = {
  id: string;
  tool?: unknown;
  status?: unknown;
  input: unknown;
  output: unknown;
  createdAt?: string;
  finishedAt?: string;
};

/** 过程块：工具按发生顺序收成一段，挂在一条合成消息上。 */
type TimelineMessage = HistoryMessage & { process?: TimelineProcessStep[] };

/** jsonl 里收集到的一条原始消息（尚未投影成 `HistoryMessage`）。 */
type CollectedMessage = {
  role: string;
  source?: unknown;
  content?: unknown;
  createdAt: string | null;
  usage?: unknown;
};

/** `agent_events` 的一行（时间线与事件列表共用）。 */
type TimelineEvent = {
  id?: unknown;
  tool?: string;
  status?: unknown;
  input?: unknown;
  output?: unknown;
  created_at?: unknown;
  finished_at?: unknown;
  visual_artifact_id?: unknown;
  [column: string]: unknown;
};

/** 时间线条目：用户发言、模型消息、过程块三种，先收集后按时间排序。 */
type TimelineItem =
  | {
      kind: "user";
      id: string;
      source?: unknown;
      text: string;
      createdAt?: string;
      order: number;
      sortTime?: number;
    }
  | {
      kind: "assistant";
      message: HistoryMessage;
      createdAt?: string;
      order: number;
      sortTime?: number;
    }
  | {
      kind: "process";
      event: TimelineEvent;
      createdAt?: string;
      order: number;
      sortTime?: number;
    };

/** 任务侧的时间线来源：只读任务书字段与派活时间。 */
type TimelineTask = {
  task_id?: unknown;
  task_goal?: unknown;
  task_title?: unknown;
  task_created_at?: unknown;
};

/** `assistant_replies` + `agent_child_sessions` 的一行。 */
type ChildReplyRow = {
  message_id: string;
  parent_message_id: string | null;
  agent_slot: string | number | null;
  status: string;
  progress?: unknown;
  execution_active?: unknown;
  error?: unknown;
  checkpoint?: Buffer | string | null;
  context_stats?: unknown;
  compact_status?: unknown;
  compact_error?: unknown;
  compact_result?: unknown;
};

/** 任务池会话的一行（任务 + 最近一次执行记录）。 */
type TaskPoolRow = {
  task_id: string;
  status: string;
  progress?: unknown;
  execution_agent_id?: string | null;
  title?: unknown;
  task_goal?: unknown;
  task_created_at?: unknown;
  checkpoint?: Buffer | string | null;
  context_stats?: unknown;
  run_status?: string | null;
  error?: unknown;
  executor_id?: string | null;
  run_progress?: unknown;
};

/** 本文件真正调用的 Service 方法（迁移期最小契约）。 */
type ChildSessionService = Pick<Service, "db" | "thread" | "insertMessage">;
type ChildSessionUser = Parameters<Service["thread"]>[0];

/** `Number.isFinite` 的类型守卫版本：确认是有限数字后才能参与比较与相减。 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** DSH 消息内容块：本文件只读 type / text / isError / content 这几个字段。 */
type ContentBlock = {
  type?: string;
  text?: string;
  isError?: unknown;
  content?: unknown;
};

function flattenContent(content: unknown): string {
  const parts: string[] = [];
  const walk = (blocks: unknown): void => {
    for (const block of (blocks as ContentBlock[] | null | undefined) || []) {
      if (typeof block === "string") parts.push(block);
      else if (block?.type === "text" && block.text) parts.push(block.text);
      else if (block?.type === "tool-result") {
        if (block.isError) parts.push("工具失败");
        walk(block.content);
      } else if (block && ["image", "audio", "video", "file"].includes(block.type as string))
        parts.push(`（${block.type}）`);
    }
  };
  walk(content);
  return parts.join("\n").replace(/\s+\n/g, "\n").trim();
}

function projectDerivedMessages(messages: unknown): HistoryMessage[] {
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

function messagesFromJsonlBytes(bytes: Buffer | string): HistoryMessage[] {
  const collected: CollectedMessage[] = [];
  let meter = createUsageMeter();
  let startedAt: number | null = null;
  let lastAssistant: CollectedMessage | null = null;
  const finish = (end: number | null): void => {
    if (lastAssistant) {
      const usage = meter.result();
      const duration =
        isFiniteNumber(startedAt) && isFiniteNumber(end) && end >= startedAt
          ? end - startedAt
          : null;
      if (usage || duration != null)
        lastAssistant.usage = {
          ...(usage || {}),
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

function checkpointFiles(
  checkpoint: Buffer | string | null | undefined,
): Record<string, string> | null {
  if (!checkpoint) return null;
  try {
    return JSON.parse(
      gunzipSync(checkpoint, { maxOutputLength: 40 * 1024 * 1024 }).toString(),
    ) as Record<string, string>;
  } catch {
    return null;
  }
}

const SESSION_LOG_NAME = /^session(\.v\d+)?\.jsonl(\.zstd)?$/;
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

function isSessionLog(path: string): boolean {
  const name = String(path).split("/").pop() ?? "";
  return SESSION_LOG_NAME.test(name);
}

/**
 * DSH 0.2.x 默认把会话日志写成多帧 zstd（`session.v4.jsonl.zstd`）。
 * Node 的 zstdDecompressSync 只解第一帧，这里按帧魔数切开逐帧解压；末尾
 * 可能有一个还没写完的半帧，解不开就丢掉尾部，保留已完整写入的事件。
 */
function decodeSessionLog(name: unknown, bytes: Buffer | string): Buffer | null {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (!String(name).endsWith(".zstd")) return buffer;
  const decompress = zlib.zstdDecompressSync;
  if (typeof decompress !== "function") return null;
  const starts: number[] = [];
  for (let index = 0; index + 4 <= buffer.length; index += 1) {
    if (buffer.subarray(index, index + 4).equals(ZSTD_MAGIC)) starts.push(index);
  }
  if (!starts.length) return null;
  starts.push(buffer.length);
  const parts: Buffer[] = [];
  for (let index = 0; index < starts.length - 1; index += 1) {
    try {
      parts.push(decompress(buffer.subarray(starts[index], starts[index + 1])));
    } catch {
      break;
    }
  }
  return parts.length ? Buffer.concat(parts) : null;
}

export function nativeHistoryFromCheckpoint(
  checkpoint: Buffer | string | null | undefined,
  {
    sessionId,
    includeMetadata = false,
  }: { sessionId?: string | null; includeMetadata?: boolean } = {},
): HistoryMessage[] {
  const files = checkpointFiles(checkpoint);
  if (!files) return [];
  let overlay: HistoryMessage[] | null = null;
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
  const projected: HistoryMessage[] = [];
  for (const [path, bytes] of Object.entries(files)) {
    if (!isSessionLog(path)) continue;
    if (sessionId && !path.split("/").includes(sessionId)) continue;
    try {
      const decoded = decodeSessionLog(path, Buffer.from(bytes, "base64"));
      if (!decoded) continue;
      projected.push(...messagesFromJsonlBytes(decoded));
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

export function agentRuntimeHome(homeId: unknown): string {
  const root = resolve(".local/agents");
  return resolve(root, String(homeId));
}

export async function nativeHistoryFromLiveHome(
  homeId: unknown,
  sessionId?: string | null,
): Promise<HistoryMessage[]> {
  const sessions = resolve(agentRuntimeHome(homeId), "sessions");
  const logs: Buffer[] = [];
  const walk = async (path: string): Promise<void> => {
    for (const entry of await readdir(path, { withFileTypes: true }).catch((error) =>
      error.code === "ENOENT" ? [] : Promise.reject(error),
    )) {
      const candidate = resolve(path, entry.name);
      if (candidate !== sessions && !candidate.startsWith(sessions + sep)) continue;
      if (entry.isDirectory()) await walk(candidate);
      else if (entry.isFile() && SESSION_LOG_NAME.test(entry.name)) {
        if (sessionId && !path.split(/[/\\]/).includes(sessionId)) continue;
        const decoded = decodeSessionLog(entry.name, await readFile(candidate));
        if (decoded) logs.push(decoded);
      }
    }
  };
  await walk(sessions);
  return logs.flatMap((bytes) => messagesFromJsonlBytes(bytes));
}

function derivedHistory(history: unknown): HistoryMessage[] | null {
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

export function checkpointFromHistory(history: unknown): Buffer | null {
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

export async function persistChildRunCheckpoint(
  db: Db,
  executorId: unknown,
  history: unknown,
): Promise<boolean> {
  const checkpoint = checkpointFromHistory(history);
  if (!executorId || !checkpoint) return false;
  const result = (await query(
    db,
    `UPDATE agent_task_execution_runs r
    JOIN (SELECT id FROM agent_task_execution_runs WHERE executor_id=? ORDER BY created_at DESC LIMIT 1) latest
    ON r.id=latest.id SET r.checkpoint=?`,
    [executorId, checkpoint],
  )) as unknown as { affectedRows: number };
  return result.affectedRows > 0;
}

export async function persistChildContextStats(
  db: Db,
  executorId: unknown,
  stats: { used?: unknown } | null | undefined,
): Promise<boolean> {
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
  const result = (await query(
    db,
    `UPDATE agent_task_execution_runs r
    JOIN (SELECT id FROM agent_task_execution_runs WHERE executor_id=? ORDER BY created_at DESC LIMIT 1) latest
    ON r.id=latest.id SET r.context_stats=?`,
    [executorId, JSON.stringify(stats)],
  )) as unknown as { affectedRows: number };
  return result.affectedRows > 0;
}

async function loadTaskReply(
  db: Db,
  threadId: string,
  messageId: string,
): Promise<ChildReplyRow | null> {
  const [row] = await query<ChildReplyRow>(
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

async function loadTaskPoolSession(
  db: Db,
  threadId: string,
  taskId: string,
): Promise<TaskPoolRow | null> {
  const [row] = await query<TaskPoolRow>(
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

function mapEvents(events: TimelineEvent[]): Record<string, unknown>[] {
  return events.map((event) => ({
    id: String(event.id),
    tool: event.tool,
    status: event.status,
    input: event.input || "",
    output: event.output || "",
    created_at: event.created_at || null,
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
export function mergeNativeMetadata(
  messages: HistoryMessage[],
  native: HistoryMessage[],
): HistoryMessage[] {
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

async function historyForExecutor(
  db: Db,
  threadId: string,
  executorId: string | null | undefined,
  checkpoint: Buffer | string | null | undefined,
): Promise<HistoryMessage[]> {
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
  // 小祥的会话快照里还有它自己的派生上下文（讨论注入等），那不是子会话内容。
  // 这里只取该子会话自己的原生日志，不能把父会话 overlay 当成子 Agent 历史。
  messages = nativeHistoryFromCheckpoint(xiaoxiang?.checkpoint, { sessionId: executorId });
  if (messages.length)
    return mergeNativeMetadata(messages, await nativeHistoryFromLiveHome(threadId, executorId));
  return nativeHistoryFromLiveHome(threadId, executorId);
}

/**
 * 任务会话按事件时间生成时间线：右侧是小祥派活与上下文注入，左侧是模型正文，
 * 思考与工具按发生顺序收成可展开的过程块。原生日志里与注入正文重复的 user
 * 消息不再重复展示。
 */
const TIMELINE_USER_TOOLS = new Set(["context_notice"]);
const TIMELINE_PROCESS_SKIP = new Set([
  "context_notice",
  "system_prompt",
  "assistant_text",
  "assistant_final",
]);

function timelineTime(value: unknown): number | null {
  if (!value) return null;
  const text = String(value);
  const normalized = text.includes("T") ? text : text.replace(" ", "T") + "Z";
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function timelineIso(value: unknown): string | undefined {
  const time = timelineTime(value);
  return time === null ? undefined : new Date(time).toISOString();
}

export function buildChildTimeline({
  history = [],
  events = [],
  task = null,
}: {
  history?: HistoryMessage[];
  events?: TimelineEvent[];
  task?: TimelineTask | null;
} = {}): TimelineMessage[] {
  const items: TimelineItem[] = [];
  let order = 0;
  const contextTexts = new Set<string>();
  for (const event of events) {
    if (!TIMELINE_USER_TOOLS.has(event.tool as string) || !event.input) continue;
    const text = String(event.input);
    contextTexts.add(text);
    items.push({
      kind: "user",
      id: `event:${event.id}`,
      source: "coordinator",
      text,
      createdAt: timelineIso(event.created_at),
      order: order++,
    });
  }
  for (const message of history) {
    if (message.role === "assistant")
      items.push({
        kind: "assistant",
        message,
        createdAt: timelineIso(message.createdAt),
        order: order++,
      });
    else if (message.role === "user" && !contextTexts.has(message.text))
      items.push({
        kind: "user",
        id: message.id,
        source: message.source,
        text: message.text,
        createdAt: timelineIso(message.createdAt),
        order: order++,
      });
  }
  for (const event of events) {
    if (!event.tool || TIMELINE_PROCESS_SKIP.has(event.tool)) continue;
    items.push({
      kind: "process",
      event,
      createdAt: timelineIso(event.created_at || event.finished_at),
      order: order++,
    });
  }
  // 没有时间的条目沿用前一条时间，保证派活与上下文注入的相对位置稳定。
  let last = 0;
  for (const item of items) {
    const at = timelineTime(item.createdAt);
    if (at === null) item.sortTime = last;
    else {
      item.sortTime = at;
      last = at;
    }
  }
  items.sort(
    (left, right) => (left.sortTime ?? 0) - (right.sortTime ?? 0) || left.order - right.order,
  );
  const messages: TimelineMessage[] = [];
  let block: (TimelineMessage & { process: TimelineProcessStep[] }) | null = null;
  for (const item of items) {
    if (item.kind === "process") {
      if (!block) {
        block = {
          id: `process:${item.event.id}`,
          role: "process",
          source: "child_agent",
          text: "",
          ...(item.createdAt ? { createdAt: item.createdAt } : {}),
          process: [],
        };
        messages.push(block);
      }
      block.process.push({
        id: String(item.event.id),
        tool: item.event.tool,
        status: item.event.status,
        input: item.event.input || "",
        output: item.event.output || "",
        createdAt: timelineIso(item.event.created_at),
        finishedAt: timelineIso(item.event.finished_at),
      });
      continue;
    }
    block = null;
    if (item.kind === "assistant") messages.push(item.message);
    else
      messages.push({
        id: item.id,
        role: "user",
        source: item.source,
        text: item.text,
        ...(item.createdAt ? { createdAt: item.createdAt } : {}),
      });
  }
  if (!messages.some((message) => message.role === "user")) {
    const text = String(task?.task_goal || task?.task_title || "").trim();
    if (text)
      messages.unshift({
        id: `dispatch:${task?.task_id}`,
        role: "user",
        source: "coordinator",
        text,
        ...(task?.task_created_at ? { createdAt: timelineIso(task.task_created_at) } : {}),
      });
  }
  return messages;
}

export async function readChildTaskSession(
  service: ChildSessionService,
  user: ChildSessionUser,
  threadId: string,
  messageId: string,
) {
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
      `SELECT e.id,e.tool,e.status,LEFT(e.input,2000) input,LEFT(e.output,4000) output,e.created_at,e.finished_at,a.id visual_artifact_id
      FROM agent_events e LEFT JOIN agent_visual_artifacts a ON a.agent_event_id=e.id
      WHERE e.message_id=? ORDER BY e.id LIMIT 200`,
      [messageId],
    );
    let history = nativeHistoryFromCheckpoint(row.checkpoint, { includeMetadata: true });
    if (!history.length) history = await nativeHistoryFromLiveHome(messageId);
    const messages = buildChildTimeline({ history, events, task: null });
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
        `SELECT e.id,e.tool,e.status,LEFT(e.input,16000) input,LEFT(e.output,4000) output,e.created_at,e.finished_at,a.id visual_artifact_id
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
  const messages = buildChildTimeline({ history, events, task });
  return {
    messageId: task.task_id,
    slot: null,
    status: task.run_status || task.status,
    progress: task.run_progress || task.progress || null,
    running,
    error: task.error || null,
    contextUsage: contextUsage(task, [], []),
    messages,
    events: mapEvents(events),
    pending: pending.map((item) => ({
      id: item.id,
      author: item.source_type === "human_member" ? "成员" : "调度",
      body: item.body,
      createdAt: item.created_at,
    })),
  };
}

export async function appendChildTaskSession(
  service: ChildSessionService,
  user: ChildSessionUser,
  threadId: string,
  messageId: string,
  body: unknown,
) {
  if (user.kind !== "session") throw new HttpError(403, "需要登录后操作");
  const text = String(body || "").trim();
  if (!text) throw new HttpError(400, "请输入要追加的内容");
  if (text.length > 20000) throw new HttpError(400, "内容过长");
  const result = await transaction(service.db as Pool, async (db) => {
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
