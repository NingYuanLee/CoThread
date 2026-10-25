import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { query } from "./db.js";
import { contextBudget, contextUsage } from "../shared/context.js";
import { COTHREAD_SYSTEM_TEXT } from "../shared/prompt-blocks.js";
import { compactElderHome, elderInstruction, elderToolNames } from "./elder-kernel.js";

const budget = contextBudget("knowledge");

export function wikiScopeKey(scope, { projectId = null, orgId = null } = {}) {
  // 会话归属只看「人 + 项目」：切换询问范围（当前项目 / 所属全部 / 公开网页）只改这次请求的权限范围，
  // 不换会话，相当于 DSH 里调整权限范围而不重开会话。
  if (projectId) return `project:${projectId}`;
  if (orgId) return `org:${orgId}`;
  if (scope === "company" || scope === "web") return scope;
  throw new Error("未知的询问范围");
}

function emptyStats() {
  return {
    limit: budget.limit,
    autoCompactAt: budget.autoCompactAt,
    used: 0,
    estimated: true,
    categories: { discussion: 0, assistant: 0, results: 0, summary: 0 },
    measuredAt: null,
    compactions: 0,
  };
}

async function loadRow(db, userId, scopeKey) {
  const [row] = await query(db, "SELECT * FROM wiki_sessions WHERE user_id=? AND scope_key=?", [
    userId,
    scopeKey,
  ]);
  return row || null;
}

async function ensureRow(db, user, scope, ids) {
  const scopeKey = wikiScopeKey(scope, ids);
  const existing = await loadRow(db, user.id, scopeKey);
  if (existing) {
    // 同一会话里换了询问范围：只更新记录的范围字段，会话 id 与沙箱沿用。
    if (existing.scope !== scope)
      await query(db, "UPDATE wiki_sessions SET scope=? WHERE id=?", [scope, existing.id]);
    return existing;
  }
  // 兼容旧数据：以前「所属全部 / 公开网页」是独立行，现在归到同一个项目会话里。
  if (ids.projectId) {
    const [legacy] = await query(
      db,
      "SELECT * FROM wiki_sessions WHERE user_id=? AND project_id=? LIMIT 1",
      [user.id, ids.projectId],
    );
    if (legacy) {
      await query(db, "UPDATE wiki_sessions SET scope_key=?, scope=? WHERE id=?", [
        scopeKey,
        scope,
        legacy.id,
      ]);
      return { ...legacy, scope_key: scopeKey, scope };
    }
  }
  const id = randomUUID();
  await query(
    db,
    `INSERT INTO wiki_sessions(id,user_id,scope_key,scope,project_id,org_id,session_id,context_stats,usage_json)
     VALUES(?,?,?,?,?,?,?,?,?)`,
    [
      id,
      user.id,
      scopeKey,
      scope,
      ids.projectId || null,
      ids.orgId || null,
      randomUUID(),
      JSON.stringify(emptyStats()),
      JSON.stringify({ totalTokens: 0, inputTokens: 0, outputTokens: 0, modelMs: 0 }),
    ],
  );
  return loadRow(db, user.id, scopeKey);
}

export function elderHome(row) {
  return resolve(".local/agents", `elder-${row.id}`);
}

export async function elderPersist(db, user, scope, ids) {
  const row = await ensureRow(db, user, scope, ids);
  await mkdir(elderHome(row), { recursive: true });
  return { home: elderHome(row), sessionId: row.session_id, checkpoint: row.checkpoint };
}

export async function elderRoomState(db, user, scope, ids) {
  const row = await loadRow(db, user.id, wikiScopeKey(scope, ids));
  const usage = row?.usage_json
    ? typeof row.usage_json === "string"
      ? JSON.parse(row.usage_json)
      : row.usage_json
    : { totalTokens: 0, inputTokens: 0, outputTokens: 0, modelMs: 0 };
  return {
    contextUsage: contextUsage(row || { context_stats: emptyStats() }, [], []),
    usage,
  };
}

export async function recordElderRun(db, user, scope, ids, produced, startedAt) {
  const row = await ensureRow(db, user, scope, ids);
  const previous =
    typeof row.context_stats === "string"
      ? JSON.parse(row.context_stats)
      : row.context_stats || emptyStats();
  const previousUsage =
    typeof row.usage_json === "string" ? JSON.parse(row.usage_json) : row.usage_json || {};
  const estimate =
    Math.ceil(String(produced.text || "").length / 4) + (produced.trace || []).length * 32;
  const stats = produced.contextStats || {
    ...previous,
    limit: budget.limit,
    autoCompactAt: budget.autoCompactAt,
    used: (previous.used || 0) + estimate,
    estimated: true,
    categories: {
      ...(previous.categories || {}),
      discussion: (previous.categories?.discussion || 0) + Math.ceil(estimate / 2),
      assistant: (previous.categories?.assistant || 0) + Math.ceil(estimate / 2),
    },
    measuredAt: new Date().toISOString(),
  };
  const usage = {
    totalTokens: (previousUsage.totalTokens || 0) + (produced.usage?.totalTokens || estimate),
    inputTokens:
      (previousUsage.inputTokens || 0) + (produced.usage?.inputTokens || Math.ceil(estimate / 2)),
    outputTokens:
      (previousUsage.outputTokens || 0) + (produced.usage?.outputTokens || Math.ceil(estimate / 2)),
    cacheReadTokens: (previousUsage.cacheReadTokens || 0) + (produced.usage?.cacheReadTokens || 0),
    cacheWriteTokens:
      (previousUsage.cacheWriteTokens || 0) + (produced.usage?.cacheWriteTokens || 0),
    calls: (previousUsage.calls || 0) + (produced.usage?.calls || 1),
    modelMs:
      (previousUsage.modelMs || 0) +
      (produced.usage?.modelMs || Math.max(0, Date.now() - startedAt)),
    executionDurationMs:
      (previousUsage.executionDurationMs || 0) +
      (produced.usage?.executionDurationMs ||
        produced.usage?.modelMs ||
        Math.max(0, Date.now() - startedAt)),
    ttftMs: (previousUsage.ttftMs || 0) + (produced.usage?.ttftMs || 0),
    ttftSteps: (previousUsage.ttftSteps || 0) + (produced.usage?.ttftSteps || 0),
    decodeMs: (previousUsage.decodeMs || 0) + (produced.usage?.decodeMs || 0),
    decodeTokens: (previousUsage.decodeTokens || 0) + (produced.usage?.decodeTokens || 0),
  };
  await query(
    db,
    "UPDATE wiki_sessions SET context_stats=?, usage_json=?, checkpoint=COALESCE(?, checkpoint), session_id=? WHERE id=?",
    [
      JSON.stringify(stats),
      JSON.stringify(usage),
      produced.checkpoint || null,
      produced.sessionId || row.session_id,
      row.id,
    ],
  );
  const now = new Date();
  const trace = [];
  const question = String(produced.question || "")
    .replace(/\s+/g, " ")
    .trim();
  if (question) trace.push({ tool: "user_input", status: "completed", text: question });
  // 系统提示词逐轮记录：服务端补丁更新或重启后，同一会话下一轮会拿到新版本。
  // 排在提问之后，轨迹按「提问」切轮时它才落进本轮。
  const systemPromptText = [COTHREAD_SYSTEM_TEXT, elderInstruction(scope)]
    .filter(Boolean)
    .join("\n\n");
  if (systemPromptText)
    trace.push({
      tool: "system_prompt",
      status: "completed",
      input: systemPromptText.slice(0, 4000),
      output: JSON.stringify({
        kind: "cothread-system-prompt",
        form: "system",
        summary: "本轮系统提示词",
      }),
    });
  // 模型调用前注入的上下文（DSH 的 user/message，带 source.kind/form/summary）：正文进预览，source 进来源。
  for (const injection of produced.injections || []) {
    const text = String(injection?.text || "").trim();
    if (!text) continue;
    trace.push({
      tool: "context_notice",
      status: "completed",
      input: text.slice(0, 4000),
      output: JSON.stringify(injection.source || {}, null, 2).slice(0, 4000),
    });
  }
  // 本轮真实注入的上下文（范围规则 + 当前迭代焦点）单独记一条：
  // 记的是发给模型的原文，不是事后统计出来的描述，轨迹里才能和实际调用对上。
  const injectedContext = String(produced.contextBlock || "").trim();
  if (injectedContext)
    trace.push({
      tool: "context_notice",
      status: "completed",
      input: injectedContext.slice(0, 4000),
      output: JSON.stringify({
        kind: "laoweng-round-context",
        form: "notice",
        summary: "范围规则与当前迭代焦点",
      }),
    });
  trace.push(...(produced.trace || []));
  const answer = String(produced.text || "").trim();
  // 回答已经完整出现在理解/说明里时不再重复记一条。
  const answerShown = trace.some((step) => {
    const text = String(step.text || "").trim();
    return !!text && (text === answer || text.includes(answer));
  });
  if (answer && answer !== "没有形成回答。" && !answerShown)
    trace.push({ tool: "assistant_final", status: "completed", text: answer });
  // 本轮的量与耗时只挂在助手事件上：对话工具本身没有模型用量。
  const roundUsage = produced.usage ? JSON.stringify(produced.usage) : null;
  for (const step of trace) {
    const tool = String(step.tool || "tool").slice(0, 40);
    const assistantStep = ["understanding", "assistant_text", "assistant_final"].includes(tool);
    await query(
      db,
      "INSERT INTO wiki_session_events(id,session_row_id,tool,status,input,output,usage_json,created_at,finished_at) VALUES(?,?,?,?,?,?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))",
      [
        randomUUID(),
        row.id,
        tool,
        step.status === "failed" ? "failed" : "completed",
        String(step.input ?? "").slice(0, 4000),
        String(step.output ?? step.text ?? "").slice(0, 4000),
        assistantStep ? roundUsage : null,
      ],
    );
  }
  return {
    contextUsage: contextUsage({ ...row, context_stats: stats }, [], []),
    usage,
    at: now.toISOString(),
  };
}

/** context_notice 的 output 是 source JSON：取出 kind 供轨迹行标来源。 */
function noticeKindOf(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return typeof parsed.kind === "string" && parsed.kind ? parsed.kind : null;
  } catch {
    return null;
  }
}

/** wiki_session_events.usage_json：只把有限数值放出来，缺字段就省略。 */
function eventUsage(value) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const usage = {};
  for (const key of [
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "cacheReadTokens",
    "cacheWriteTokens",
    "modelMs",
    "executionDurationMs",
    "ttftMs",
    "ttftSteps",
    "decodeMs",
    "decodeTokens",
    "settingsVersion",
    "calls",
  ]) {
    if (Number.isFinite(parsed[key]) && parsed[key] >= 0) usage[key] = parsed[key];
  }
  // 请求的「选项」要靠这三样：模型、推理档位、设置版本（数值已在上面的白名单里）。
  if (typeof parsed.model === "string" && parsed.model) usage.model = parsed.model.slice(0, 60);
  if (typeof parsed.reasoningEffort === "string" && parsed.reasoningEffort)
    usage.reasoningEffort = parsed.reasoningEffort.slice(0, 20);
  return Object.keys(usage).length ? usage : null;
}

export async function elderAgentLogs(db, user, scope, ids, { before = null, limit = 60 } = {}) {
  // 轨迹「系统」步骤展示的提示词与只读工具，和真正跑老翁问答时用的是同一份：
  // 系统提示词 = A 段共享底线（cothread-system-prompt 插件）+ elderPrompt 里与本轮提问无关的固定指令；
  // 工具 = runElderQuestion 实际放行的只读查阅工具（elderToolNames）。
  // 用量不返回：wiki_sessions.usage_json 是整间问答的累计值，归不到具体事件。
  const scopeContext = {
    systemPrompt: [COTHREAD_SYSTEM_TEXT, elderInstruction(scope)].join("\n\n"),
    systemSections: [
      {
        name: "cothread:system",
        order: 790,
        source: "dsh-layer/cothread-system-prompt.mjs",
        text: COTHREAD_SYSTEM_TEXT,
      },
      {
        name: "elder-instruction",
        order: 800,
        source: "server/wiki-session.js elderInstruction",
        text: elderInstruction(scope),
      },
    ],
    tools: elderToolNames(scope),
  };
  const row = await loadRow(db, user.id, wikiScopeKey(scope, ids));
  if (!row)
    return {
      title: "问老翁",
      scopeType: "wiki",
      scopeId: wikiScopeKey(scope, ids),
      ...scopeContext,
      inputs: [],
      events: [],
    };
  // 轨迹按页往回取：默认最近一页，before 指向当前最老的事件，继续往前翻历史。
  const pageSize = Math.min(Math.max(Number(limit) || 60, 10), 200);
  let beforeAt = null;
  if (before) {
    const [anchor] = await query(
      db,
      "SELECT created_at FROM wiki_session_events WHERE id=? AND session_row_id=?",
      [String(before), row.id],
    );
    beforeAt = anchor?.created_at || null;
  }
  const events = await query(
    db,
    beforeAt
      ? "SELECT id, tool, status, input, output, usage_json, created_at, finished_at FROM wiki_session_events WHERE session_row_id=? AND (created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC, id DESC LIMIT ?"
      : "SELECT id, tool, status, input, output, usage_json, created_at, finished_at FROM wiki_session_events WHERE session_row_id=? ORDER BY created_at DESC, id DESC LIMIT ?",
    beforeAt ? [row.id, beforeAt, beforeAt, String(before), pageSize + 1] : [row.id, pageSize + 1],
  );
  const hasMore = events.length > pageSize;
  const pageEvents = events.slice(0, pageSize).reverse();
  return {
    title: "问老翁",
    scopeType: "wiki",
    scopeId: row.scope_key,
    ...scopeContext,
    inputs: [],
    page: {
      hasMore,
      before: pageEvents[0]?.id || null,
    },
    events: pageEvents.map((event) => ({
      id: event.id,
      agentType: "laoweng",
      agentSessionId: row.session_id,
      taskId: null,
      messageId: null,
      threadId: null,
      tool: event.tool,
      action:
        {
          user_input: "提问",
          understanding: "理解",
          search_knowledge: "查阅资料",
          web_search: "搜索网页",
          web_fetch: "阅读网页",
          assistant_text: "说明",
          assistant_final: "回答",
          context_sync: "本轮上下文",
          context_notice: "注入上下文",
          context_compact: "压缩",
          system_prompt: "系统提示词",
        }[event.tool] || event.tool,
      target:
        String(event.input || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 140) || undefined,
      status: event.status,
      createdAt: event.created_at,
      finishedAt: event.finished_at,
      durationMs: null,
      ...(eventUsage(event.usage_json) ? { usage: eventUsage(event.usage_json) } : {}),
      preview: String(event.input || event.output || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 140),
      ...(event.tool === "context_notice" ? { noticeKind: noticeKindOf(event.output) } : {}),
    })),
  };
}

// 正在压缩的会话行：并发点击或重复请求不再另起一个 DSH 运行。
const compactionsInFlight = new Set();
// 进程中途重启会把行留在 running，超过这个时长就不再当真在跑。
const COMPACT_STALE_MS = 3 * 60 * 1000;

/**
 * 校验并占位，但不压缩：置 running 的同时清掉上一条结果和报错，
 * 浮窗才不会一边显示“正在压缩…”一边挂着旧的“压缩完成”。
 * 返回 { job } 表示后台压缩已经可以启动，返回 { result } 表示这次不需要压缩。
 */
export async function beginElderCompaction(db, user, scope, ids, options = {}) {
  const row = await ensureRow(db, user, scope, ids);
  if (!row.checkpoint) {
    await query(
      db,
      "UPDATE wiki_sessions SET compact_status='completed', compact_error=NULL, compact_result=? WHERE id=?",
      [JSON.stringify({ changed: false, reason: "already_small" }), row.id],
    );
    return { result: { changed: false, reason: "already_small" } };
  }
  if (compactionsInFlight.has(row.id)) return { result: { status: "running", changed: false } };
  if (row.compact_status === "running") {
    const startedAt = Date.parse(row.updated_at || "") || 0;
    if (Date.now() - startedAt < COMPACT_STALE_MS)
      return { result: { status: "running", changed: false } };
  }
  compactionsInFlight.add(row.id);
  await query(
    db,
    "UPDATE wiki_sessions SET compact_status='running', compact_error=NULL, compact_result=NULL WHERE id=?",
    [row.id],
  );
  const job = runElderCompaction(db, row, options).finally(() =>
    compactionsInFlight.delete(row.id),
  );
  return { job };
}

export async function compactElderSession(db, user, scope, ids, options = {}) {
  const { job, result } = await beginElderCompaction(db, user, scope, ids, options);
  return job ?? result;
}

/**
 * 老翁的压缩也记进轨迹：和群聊的 context_compact 是同一种事件，
 * input 用 {before,after,changed,reason}，轨迹里的「压缩」行据此显示前后用量。
 */
async function recordElderCompactionEvent(db, sessionRowId, status, result, error) {
  const usage =
    status === "completed" && result
      ? {
          before: Number.isFinite(result.before) ? result.before : null,
          after: Number.isFinite(result.after) ? result.after : null,
          changed: Boolean(result.changed),
          reason: result.reason || "",
        }
      : {
          before: null,
          after: null,
          changed: false,
          reason: String(error?.message || error || "压缩没有完成").slice(0, 200),
        };
  const summary =
    status === "failed"
      ? "压缩没有完成。"
      : usage.changed
        ? `较早的对话已收成摘要，压缩前 ${usage.before ?? "?"} → 压缩后 ${usage.after ?? "?"} 词元。`
        : "这段对话没有更早的内容可以再压缩。";
  await query(
    db,
    "INSERT INTO wiki_session_events(id,session_row_id,tool,status,input,output,usage_json,created_at,finished_at) VALUES(?,?,?,?,?,?,NULL,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))",
    [
      randomUUID(),
      sessionRowId,
      "context_compact",
      status === "failed" ? "failed" : "completed",
      JSON.stringify(usage).slice(0, 4000),
      summary.slice(0, 4000),
    ],
  ).catch((insertError) =>
    console.error("Elder compaction event persistence failed", {
      type: insertError?.name || "Error",
    }),
  );
}

async function runElderCompaction(db, row, options) {
  const home = elderHome(row);
  await mkdir(home, { recursive: true });
  try {
    const result = await compactElderHome({
      home,
      sessionId: row.session_id,
      checkpoint: row.checkpoint,
      model: options.model,
      createHarness: options.createHarness,
    });
    const previous =
      typeof row.context_stats === "string"
        ? JSON.parse(row.context_stats)
        : row.context_stats || emptyStats();
    const stats = result.contextStats || {
      ...previous,
      used: result.after ?? previous.used,
      compactions: (previous.compactions || 0) + (result.changed ? 1 : 0),
      lastCompactedAt: new Date().toISOString(),
      compacting: false,
    };
    // compact_result 会随房间接口下发给浮窗，压缩后的 checkpoint 不能跟着进去。
    const { checkpoint, ...summary } = result;
    await query(
      db,
      "UPDATE wiki_sessions SET compact_status='completed', compact_error=NULL, compact_result=?, context_stats=?, checkpoint=COALESCE(?, checkpoint) WHERE id=?",
      [JSON.stringify(summary), JSON.stringify(stats), result.checkpoint || null, row.id],
    );
    await recordElderCompactionEvent(db, row.id, "completed", result);
    return result;
  } catch (error) {
    await query(
      db,
      "UPDATE wiki_sessions SET compact_status='failed', compact_error=? WHERE id=?",
      [String(error.message || error).slice(0, 255), row.id],
    );
    await recordElderCompactionEvent(db, row.id, "failed", null, error);
    throw error;
  }
}
