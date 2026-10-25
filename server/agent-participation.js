import { insertCompletedAgentEvent } from "./thread-activity.js";
import { setTimeout as delay } from "node:timers/promises";
import {
  capturedModelUsage,
  modelConfig,
  modelResponse,
  modelUsage,
  responseText,
} from "./model-config.js";
import { saveReplyUsage } from "./agent-usage.js";
import { query } from "./db.js";
import { mentionsAgent } from "../shared/agent-member.js";

const USAGE_TOKEN_KEYS = [
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "reasoningTokens",
  "totalTokens",
  "calls",
];

function mergeParticipationUsage(prior, next) {
  if (!next) return prior || null;
  if (!prior) return { ...next };
  const merged = { ...prior };
  for (const key of USAGE_TOKEN_KEYS) {
    const a = prior[key];
    const b = next[key];
    if (a == null && b == null) merged[key] = null;
    else merged[key] = (a || 0) + (b || 0);
  }
  return merged;
}

/** Seconds to wait before another unmentioned opportunistic reply in the same iteration. */
export const OPPORTUNISTIC_COOLDOWN_SECONDS = 60;
/** Max draft revisions when new messages arrive while "composing". */
export const OPPORTUNISTIC_MAX_REVISIONS = 4;
/** Brief pause before send so near-simultaneous follow-ups can land. */
export const OPPORTUNISTIC_SETTLE_MS = 400;
/** Participation judgment is a small JSON call; do not use the full 60s agent budget. */
export const OPPORTUNISTIC_MODEL_TIMEOUT_MS = 20000;
/** Recent chat rows for light-path judgment. The window shrinks until it fits. */
export const OPPORTUNISTIC_HISTORY_LIMIT = 12;
/**
 * Total normalized chars of the light-judgment window.
 * Shrink the newest slice until it fits. Silence only when the latest message alone exceeds this.
 */
export const OPPORTUNISTIC_CONTEXT_CHAR_BUDGET = 4000;
/** One short Chinese sentence JSON; leave modest headroom. */
export const OPPORTUNISTIC_MAX_TOKENS = 768;

export function compactParticipationBody(body) {
  return String(body || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function lightContextChars(rows) {
  return (rows || []).reduce((sum, row) => sum + compactParticipationBody(row.body).length, 0);
}

/** True when the recent window is too long to judge without cutting it. */
export function lightContextTooLong(rows, budget = OPPORTUNISTIC_CONTEXT_CHAR_BUDGET) {
  return lightContextChars(rows) > budget;
}

/**
 * Newest-first rows. Shrink from the history limit down to 1 until the newest slice fits.
 * Returns chronological messages, or null when even the latest one is over budget.
 */
export function fitLightContextWindow(
  rows,
  { limit = OPPORTUNISTIC_HISTORY_LIMIT, budget = OPPORTUNISTIC_CONTEXT_CHAR_BUDGET } = {},
) {
  const newestFirst = rows || [];
  const max = Math.min(limit, newestFirst.length);
  for (let count = max; count >= 1; count--) {
    const window = newestFirst.slice(0, count);
    if (!lightContextTooLong(window, budget)) return window.slice().reverse();
  }
  return newestFirst.length ? null : [];
}

export function compactParticipationMessages(rows) {
  return (rows || []).map(({ author, source, body }) => ({
    author,
    source,
    body: compactParticipationBody(body),
  }));
}

/** Normalize decide() results from production or test doubles. */
export function normalizeParticipationDecision(decision) {
  if (typeof decision === "boolean") return { respond: decision, message: undefined };
  if (!decision || typeof decision.respond !== "boolean") {
    throw new Error("Invalid participation decision");
  }
  const message = typeof decision.message === "string" ? decision.message.trim() : "";
  if (decision.respond && !message) {
    throw new Error("Invalid participation decision");
  }
  return {
    respond: decision.respond,
    message: decision.respond ? message.slice(0, 20000) : undefined,
  };
}

export function deferSilenceProgress(reason) {
  if (reason === "cooldown") return "近期已参与，本轮保持沉默";
  if (reason === "still_changing") return "讨论仍在变化，撤回未发出的回复";
  if (reason === "revised_silent") return "看到后续发言后选择不发出";
  if (reason === "judge_failed") return "参与判断暂时失败，本轮保持沉默";
  if (reason === "context_too_long") return "近期讨论过长，轻量判断保持沉默";
  return "已保持沉默";
}

/** Structured payload for non-小祥 participation judgments (visible in dev logs, not in chat). */
export function participationDecisionLogPayload({
  messageId,
  threadId,
  decision,
  durationMs,
} = {}) {
  const respond = !!decision?.respond;
  const payload = {
    messageId,
    threadId,
    action: respond ? "reply" : "silent",
    reason: respond ? null : deferSilenceProgress(decision?.deferred),
    deferred: decision?.deferred || null,
    revisions: decision?.revisions ?? 0,
    burstCount: decision?.burstIds?.length ?? 1,
  };
  if (durationMs != null) payload.durationMs = Math.round(durationMs);
  if (respond && decision?.message) {
    payload.messagePreview = String(decision.message).slice(0, 120);
  }
  return payload;
}

export function logParticipationDecision(args) {
  console.log("Participation decision", participationDecisionLogPayload(args));
}

export async function isWithinOpportunisticQuietPeriod(db, threadId) {
  const [recent] = await query(
    db,
    `SELECT r.message_id FROM assistant_replies r
     JOIN messages m ON m.id=r.message_id
     WHERE m.thread_id=? AND r.participation='reply' AND r.reply_id IS NOT NULL
       AND r.progress IN ('已参与讨论','已并入本次参与')
       AND r.finished_at>DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? SECOND)
     LIMIT 1`,
    [threadId, OPPORTUNISTIC_COOLDOWN_SECONDS],
  );
  return !!recent;
}

/**
 * Human turns since the last assistant message that are still open for opportunistic speech.
 * Includes messages that arrived after the triggering job — like seeing new chat while editing.
 * Prior soft silences stay in the streak (so "same content ×3" / 催促 can still fire);
 * only a human turn that already got a visible reply closes the streak.
 */
export async function loadOpportunisticBurst(db, threadId) {
  const [lastAssistant] = await query(
    db,
    "SELECT COALESCE(MAX(sequence),0) sequence FROM messages WHERE thread_id=? AND source='assistant'",
    [threadId],
  );
  const rows = await query(
    db,
    `SELECT m.id,m.sequence,m.body,m.source,m.author_id,u.name author,
            r.participation,r.status,r.progress,r.reply_id
     FROM messages m
     JOIN users u ON u.id=m.author_id
     LEFT JOIN assistant_replies r ON r.message_id=m.id
     WHERE m.thread_id=? AND m.source='human' AND m.sequence>?
     ORDER BY m.sequence
     LIMIT 40`,
    [threadId, lastAssistant?.sequence || 0],
  );
  const burst = [];
  for (const row of rows) {
    // Visible reply already posted for this human turn — streak ends here.
    // (After an assistant speaks, lastAssistant advances and these rows drop out.)
    if (row.participation === "reply" && row.reply_id) break;
    if (row.status === "failed") {
      burst.push(row);
      continue;
    }
    if (!row.participation || row.participation === "pending" || row.participation === "silent") {
      burst.push(row);
      continue;
    }
    break;
  }
  return burst;
}

export async function latestHumanSequence(db, threadId) {
  const [row] = await query(
    db,
    "SELECT COALESCE(MAX(sequence),0) sequence FROM messages WHERE thread_id=? AND source='human'",
    [threadId],
  );
  return row?.sequence || 0;
}

/** True when this human burst sits directly on top of an assistant message. */
export async function isReplyingToAssistant(db, threadId, burst) {
  if (!burst?.length) return false;
  const [prior] = await query(
    db,
    `SELECT source FROM messages
     WHERE thread_id=? AND sequence<? ORDER BY sequence DESC LIMIT 1`,
    [threadId, burst[0].sequence],
  );
  return prior?.source === "assistant";
}

/**
 * Short human follow-ups right after 小祥 spoke are almost always directed at her
 * (praise, thanks, nudge, light complaint) — not member-to-member side chat.
 */
export function isShortAssistantDirectedFollowUp(burst) {
  if (!burst?.length || burst.length > 3) return false;
  const text = burst
    .map((row) => String(row.body || "").trim())
    .filter(Boolean)
    .join("\n");
  if (!text || text.length > 80) return false;
  // Clearly addressing someone else, not 小祥.
  if (/(^|[^\p{L}\p{N}_@])@(?!小祥\b)[\p{L}\p{N}_]/u.test(text)) return false;
  return true;
}

/** Pure ack / receipt — humans usually do not answer these. */
export function isPureAcknowledgement(burstOrText) {
  const text = Array.isArray(burstOrText)
    ? burstOrText
        .map((row) => String(row.body || "").trim())
        .filter(Boolean)
        .join("\n")
    : String(burstOrText || "").trim();
  if (!text || text.length > 40) return false;
  if (/(^|[^\p{L}\p{N}_@])@[\p{L}\p{N}_]/u.test(text)) return false;
  if (
    /[?？]|吗|么|呢|为啥|为什么|怎么|能不能|可不可以|帮|做|看一下|沉默|不说话|回我|在吗|在么/.test(
      text,
    )
  ) {
    return false;
  }
  return /^(好的?|收到了?|嗯+|哦+|噢+|ok|OK|行|可以|记下了|知道了|了解|明白了?|那就这样|先这样|我就当你记下了)([，,。.!！…\s].*)?$/u.test(
    text,
  );
}

/**
 * @小祥 and a leading "小祥，" are the same address. Both open full mode at intake.
 */
export function addressesAgent(text) {
  return mentionsAgent(text);
}

export function burstAddressesAgent(burst) {
  return (burst || []).some((row) => addressesAgent(row.body));
}

/** Nudges/complaints clearly aimed at 小祥 staying quiet. */
export function isAgentDirectedComplaint(burst) {
  if (!burst?.length) return false;
  const text = burst
    .map((row) => String(row.body || "").trim())
    .filter(Boolean)
    .join("\n");
  if (!text || text.length > 120) return false;
  if (/(^|[^\p{L}\p{N}_@])@(?!小祥\b)[\p{L}\p{N}_]/u.test(text)) return false;
  return /一直沉默|别沉默|又不说话|又不回|不说话了|怎么不回|为啥不回|为什么不回|为啥一直|没回我|不回应|你在吗|你在么|挂了吗|挂了\s*$|装死|理我/u.test(
    text,
  );
}

/** Hard gate: must speak (overrides model silence and cooldown). */
export function mustOpportunisticReply(burst, { replyingToAssistant = false } = {}) {
  if (!burst?.length) return false;
  if (shouldInviteFullMode(burst)) return true;
  if (burstAddressesAgent(burst) || isAgentDirectedComplaint(burst) || needsSoloRunReply(burst)) {
    return true;
  }
  // After 小祥 spoke: short directed chatter gets a beat — except pure "好的/收到".
  if (
    replyingToAssistant &&
    isShortAssistantDirectedFollowUp(burst) &&
    !isPureAcknowledgement(burst)
  ) {
    return true;
  }
  return false;
}

/**
 * Work-shaped asks the light path must not pretend to start.
 * The short reply keeps a fixed reminder instead of opening full mode.
 */
export function needsFullAgentWork(burst) {
  if (!burst?.length) return false;
  const text = burst
    .map((row) => String(row.body || "").trim())
    .filter(Boolean)
    .join("\n");
  if (!text || text.length < 6) return false;
  if (/(^|[^\p{L}\p{N}_@])@(?!小祥\b)[\p{L}\p{N}_]/u.test(text)) return false;

  const asks =
    /(?:帮我|麻烦|请你|请|拜托|能否|能不能|可以帮|给我|我要|我想要|需要你|劳驾|麻烦你)/u.test(
      text,
    ) || /(?:做一下|弄一下|整一下|看一下|查一下|改一下|写一下)/u.test(text);

  const work = [
    /总结|梳理|整理|汇总|归纳|提炼|综述|纪要|会议纪要|复盘|排期/,
    /分析|评估|调研|对比|方案|规划|设计|埋点|指标|口径|统计/,
    /生成|输出|导出|撰写|编写|起草|拟一份|出一份|出个|做一份|做个|搞一份/,
    /写(?:一份|一个|一篇|个|份|篇)?/,
    /文档|报告|清单|表格|PPT|幻灯|原型|说明书|手册|README|PRD|需求|用例/i,
    /改代码|修bug|修复|实现|开发|联调|排查|定位|报错|查日志|重构|测试/i,
    /代码检查|检查报告|code\s*review|review|提交|commit|开PR|提PR|merge/i,
    /派活|派(?:一个?|个)?任务|建(?:一个?|个)?任务|创建(?:一个?|个)?任务|拆任务|拆成|安排给|指派|转交/,
    /整改|待办|TODO|看板|干活|开工|着手/i,
    /上传|下载|归档|另存|整理文件|读一下|打开.*文件/,
    /token|用量|配额|消耗|成本/i,
  ].some((pattern) => pattern.test(text));

  const strong =
    /帮我(?:总结|梳理|整理|分析|生成|输出|写|做|查|改|修|实现|开发|派|看)|请(?:总结|梳理|生成|写|做|查)|生成文档|写文档|出报告|代码检查|派(?:一个?|个)?任务|派活|你倒是干活/.test(
      text,
    );

  return strong || (asks && work);
}

/**
 * Speaker sounds frustrated / impatient with 小祥 or the stall.
 * The light path replaces its draft with the fixed @ reminder and does not open full mode.
 */
export function isNegativeMood(burst) {
  if (!burst?.length) return false;
  const text = burst
    .map((row) => String(row.body || "").trim())
    .filter(Boolean)
    .join("\n");
  if (!text || text.length < 4 || text.length > 240) return false;
  if (/(^|[^\p{L}\p{N}_@])@(?!小祥\b)[\p{L}\p{N}_]/u.test(text)) return false;
  // Mild silence nudges stay on the short-ack path.
  if (isAgentDirectedComplaint(burst) && !/干活|开工|办事|做事|有没有用|敷衍|糊弄/.test(text)) {
    return false;
  }
  return /倒是干活|倒是办事|到底(?:行不行|能不能|可不可以|会不会)|有没有用|白说了|说了多少遍|服了你|无语|烦死|气死|受够|失望|耽误|太慢了|什么破|垃圾|废物|靠谱吗|能不能好好|我都说了|你就不能|别糊弄|敷衍|应付我|认真点|靠谱一点|别光说|光答应|光回我|光嘴上|假动作|空应声|光打字不干活/u.test(
    text,
  );
}

export function shouldInviteFullMode(burst) {
  return needsFullAgentWork(burst) || isNegativeMood(burst);
}

/**
 * Light reply that already agrees to do the work, or tells the member to @ again.
 * The promise is dropped and replaced by the fixed reminder.
 */
export function promisesFullModeWork(text) {
  const body = String(text || "").trim();
  if (!body) return false;
  if (body === "升级完整模式") return true;
  if (/完整模式/u.test(body) && /@\s*小祥/u.test(body)) return true;
  if (body.length > 280) return false;
  return /我(?:现在|这)?就(?:去|来|开始|开工|处理|写|做|改|查|整理|总结|梳理|派)|我马上(?:开始|开工|处理|写|做|去)|马上(?:开始|开工)|就可以开工|可以开工|着手(?:做|写|改|处理)|我来(?:帮你|处理|做|写|改|查|整理|总结|梳理|分析|生成|派|安排)|交给我(?:来)?(?:处理|做|写|改)|我(?:会|来)帮你(?:写|做|改|整理|总结|梳理|生成|派)/u.test(
    body,
  );
}

export function briefAssistantFollowUpAck(burst) {
  const text = burst.map((row) => String(row.body || "")).join("");
  if (/挺快|好快|很快|速度/.test(text)) return "哈哈，这次赶上了。";
  if (/谢谢|感谢|辛苦/.test(text)) return "不客气，有需要再说。";
  if (/为啥|为什么|怎么不|没回|不欢迎|沉默|不说话|又不/.test(text)) {
    return "抱歉，刚才没接住，我在的。";
  }
  if (burstAddressesAgent(burst)) return "在的，你说。";
  return "嗯，我在的。";
}

/** Same member, same text, no @, nobody else in between. */
export const REPEATED_SAME_CONTENT_REPLY_AFTER = 3;

const MENTIONS_ANYONE = /(?:^|[^\p{L}\p{N}_@])@[\p{L}\p{N}_]/u;

export function normalizeBurstBody(body) {
  return String(body || "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Trailing run of identical messages from one author without @ or interrupters. */
export function repeatedSameContentRun(burst) {
  if (!burst?.length) return { authorId: null, count: 0, body: "", messages: [] };
  const last = burst[burst.length - 1];
  const body = normalizeBurstBody(last.body);
  if (!body || MENTIONS_ANYONE.test(String(last.body || ""))) {
    return { authorId: null, count: 0, body: "", messages: [] };
  }
  const messages = [];
  for (let i = burst.length - 1; i >= 0; i--) {
    const row = burst[i];
    if (row.author_id !== last.author_id) break;
    if (MENTIONS_ANYONE.test(String(row.body || ""))) break;
    if (normalizeBurstBody(row.body) !== body) break;
    messages.unshift(row);
  }
  return { authorId: last.author_id, count: messages.length, body, messages };
}

/** 同一人连续发送相同内容达到 3 次（无人打断、未 @ 任何人）时不应再沉默. */
export function needsSoloRunReply(burst) {
  return repeatedSameContentRun(burst).count >= REPEATED_SAME_CONTENT_REPLY_AFTER;
}

export function briefSoloRunAck(burst) {
  const { count } = repeatedSameContentRun(burst);
  return `你连发了 ${count} 遍一样的话，我在的——需要我帮你什么吗？`;
}

export async function absorbOpportunisticBurst(conn, burstIds, replyId, anchorMessageId) {
  for (const messageId of burstIds) {
    const progress = messageId === anchorMessageId ? "已参与讨论" : "已并入本次参与";
    await query(
      conn,
      `UPDATE assistant_replies SET participation='reply',status='completed',progress=?,reply_id=?,error=NULL,
       finished_at=UTC_TIMESTAMP(3),execution_active=FALSE,
       first_response_at=COALESCE(first_response_at,UTC_TIMESTAMP(3))
       WHERE message_id=?`,
      [progress, replyId, messageId],
    );
    await query(
      conn,
      `UPDATE agent_requests SET status='completed',response_id=?,error=NULL,
       first_response_at=COALESCE(first_response_at,UTC_TIMESTAMP(3))
       WHERE message_id=? AND status IN ('queued','running','completed','failed')`,
      [replyId, messageId],
    );
  }
}

export async function silenceOpportunisticBurst(conn, burstIds, reason) {
  const progress = deferSilenceProgress(reason);
  for (const messageId of burstIds) {
    await query(
      conn,
      `UPDATE assistant_replies SET participation='silent',status='completed',progress=?,error=NULL,
       finished_at=UTC_TIMESTAMP(3),execution_active=FALSE
       WHERE message_id=? AND status IN ('queued','running','failed')`,
      [progress, messageId],
    );
    await query(
      conn,
      `UPDATE agent_requests SET status='completed',error=NULL
       WHERE message_id=? AND status IN ('queued','running','failed')`,
      [messageId],
    );
  }
}

/**
 * Compose like a human editing a reply: draft → if new messages arrive, revise or discard.
 * Model blips become silence, never a hard "暂未响应" failure for unmentioned turns.
 */
export async function composeOpportunisticParticipation(
  db,
  { title, threadId, messageId, decide = decideParticipation },
) {
  if (await isWithinOpportunisticQuietPeriod(db, threadId)) {
    const burst = await loadOpportunisticBurst(db, threadId);
    const replyingToAssistant = await isReplyingToAssistant(db, threadId, burst);
    // Cooldown is for casual chatter / pure acks — not hard-must-reply turns.
    if (!mustOpportunisticReply(burst, { replyingToAssistant })) {
      return {
        respond: false,
        deferred: "cooldown",
        burstIds: burst.map((row) => row.id),
        revisions: 0,
        usage: null,
        executionDurationMs: 0,
      };
    }
  }

  let previousDraft;
  let throughSequence = 0;
  let usageTotals = null;
  let modelDurationMs = 0;
  let modelAccounting = null;
  let modelCapture = null;
  const recordDecideMeta = (raw) => {
    if (raw?.usage) usageTotals = mergeParticipationUsage(usageTotals, raw.usage);
    if (Number.isFinite(raw?.durationMs)) modelDurationMs += Math.max(0, raw.durationMs);
    if (!modelAccounting && raw?.modelAccounting?.model) modelAccounting = raw.modelAccounting;
  };
  const withUsage = (decision) => ({
    ...decision,
    usage: usageTotals,
    executionDurationMs: Math.round(modelDurationMs),
    modelAccounting: modelAccounting || decision.modelAccounting || null,
  });
  const forceBriefAck = (burst) => ({
    respond: true,
    message:
      needsSoloRunReply(burst) && !burstAddressesAgent(burst) && !isAgentDirectedComplaint(burst)
        ? briefSoloRunAck(burst)
        : briefAssistantFollowUpAck(burst),
  });
  const finishReply = (decision, burst) => {
    if (!decision?.respond || !decision.message) return decision;
    if (!reminderNeededByRule(burst, decision.message)) return decision;
    const replace = shouldInviteFullMode(burst) || promisesFullModeWork(decision.message);
    return {
      ...decision,
      message: appendFullModeReminder(decision.message, { replace }),
      reminded: true,
    };
  };

  for (let revision = 0; revision < OPPORTUNISTIC_MAX_REVISIONS; revision++) {
    const burst = await loadOpportunisticBurst(db, threadId);
    if (!burst.length) {
      return withUsage({
        respond: false,
        deferred: undefined,
        burstIds: [messageId],
        revisions: revision,
      });
    }
    throughSequence = burst[burst.length - 1].sequence;
    const replyingToAssistant = await isReplyingToAssistant(db, threadId, burst);
    const soloRunNeedsReply = needsSoloRunReply(burst);
    const namedOrComplaining = burstAddressesAgent(burst) || isAgentDirectedComplaint(burst);
    const mustReply = mustOpportunisticReply(burst, { replyingToAssistant });
    // Hard silence: pure "好的/收到" after we just spoke — do not ping-pong.
    if (
      replyingToAssistant &&
      isPureAcknowledgement(burst) &&
      !namedOrComplaining &&
      !soloRunNeedsReply
    ) {
      return withUsage({
        respond: false,
        deferred: undefined,
        burstIds: burst.map((row) => row.id),
        revisions: revision,
      });
    }
    // Always let the model phrase the reply; hard rules only force respond / fallback copy.
    const historyDesc = await query(
      db,
      `SELECT m.body,m.source,u.name author FROM messages m
       JOIN users u ON u.id=m.author_id
       WHERE m.thread_id=? AND m.sequence<=? ORDER BY m.sequence DESC LIMIT ?`,
      [threadId, throughSequence, OPPORTUNISTIC_HISTORY_LIMIT],
    );
    // Drop older rows until the newest slice fits. Silence only if the latest message itself does not.
    const history = fitLightContextWindow(historyDesc);
    if (!history) {
      if (!mustReply) {
        return withUsage({
          respond: false,
          deferred: "context_too_long",
          burstIds: burst.map((row) => row.id),
          revisions: revision,
          throughSequence,
        });
      }
      const ack = forceBriefAck(burst);
      const replace = shouldInviteFullMode(burst) || promisesFullModeWork(ack.message);
      const message = reminderNeededByRule(burst, ack.message)
        ? appendFullModeReminder(ack.message, { replace })
        : ack.message;
      return withUsage({
        respond: true,
        message,
        reminded: message !== ack.message,
        burstIds: burst.map((row) => row.id),
        revisions: revision,
        throughSequence,
      });
    }
    let decision;
    try {
      if (decide === decideParticipation) modelCapture ||= modelConfig("coordinator");
      const raw = await decide({
        modelCapture,
        title,
        messages: compactParticipationMessages(history),
        integrateBurst: compactParticipationMessages(
          burst.map(({ author, body }) => ({ author, source: "human", body })),
        ),
        replyingToAssistant,
        soloRunNeedsReply,
        soloRunCount: repeatedSameContentRun(burst).count,
        namedOrComplaining,
        mustReply,
        previousDraft: previousDraft?.respond
          ? { respond: true, message: previousDraft.message }
          : previousDraft?.respond === false
            ? { respond: false }
            : undefined,
        revision,
      });
      recordDecideMeta(raw);
      decision = normalizeParticipationDecision(raw);
    } catch (error) {
      console.error("Participation judgment failed", {
        threadId,
        messageId,
        revision,
        type: error?.name || "Error",
        diagnostic: String(error?.message || error).slice(-1000),
      });
      if (previousDraft?.respond && previousDraft.message) {
        decision = previousDraft;
      } else if (mustReply) {
        decision = forceBriefAck(burst);
      } else {
        return withUsage({
          respond: false,
          deferred: "judge_failed",
          burstIds: burst.map((row) => row.id),
          revisions: revision,
        });
      }
    }
    // Hard overrides beat an over-silent model — template is fallback copy only.
    if (!decision.respond && mustReply) {
      decision = forceBriefAck(burst);
    }
    previousDraft = decision;

    await delay(OPPORTUNISTIC_SETTLE_MS);
    const latest = await latestHumanSequence(db, threadId);
    if (BigInt(latest) > BigInt(throughSequence)) continue;

    const finished = finishReply(decision, burst);
    return withUsage({
      ...finished,
      deferred: finished.respond ? undefined : revision > 0 ? "revised_silent" : undefined,
      burstIds: burst.map((row) => row.id),
      revisions: revision,
      throughSequence,
    });
  }

  const burst = await loadOpportunisticBurst(db, threadId);
  return withUsage({
    respond: false,
    deferred: "still_changing",
    burstIds: burst.length ? burst.map((row) => row.id) : [messageId],
    revisions: OPPORTUNISTIC_MAX_REVISIONS,
  });
}

/**
 * Persist light-path (non-harness) participation usage, timing, and 小祥 trajectory events.
 * Uses the thread's agent_sessions.session_id when present; otherwise creates a UUID binder
 * so events still appear under「小祥轨迹」without opening a DSH harness.
 */
export async function persistOpportunisticParticipationArtifacts(
  db,
  { messageId, threadId, decision, wallDurationMs } = {},
) {
  if (!messageId || !threadId || !decision) return;
  // Pure cooldown / no model work: nothing useful to meter or show in the ledger.
  if (decision.deferred === "cooldown" && !decision.usage && !(decision.executionDurationMs > 0)) {
    return;
  }
  try {
    const modelMs = Math.round(
      Number.isFinite(decision.executionDurationMs)
        ? decision.executionDurationMs
        : wallDurationMs || 0,
    );
    if (decision.usage || modelMs > 0) {
      await saveReplyUsage(db, messageId, {
        ...(decision.usage || {}),
        ...(decision.modelAccounting || {}),
        executionDurationMs: Math.max(0, modelMs),
      });
    }
    await query(
      db,
      `UPDATE assistant_replies SET first_response_at=COALESCE(first_response_at,UTC_TIMESTAMP(3))
       WHERE message_id=?`,
      [messageId],
    );

    await query(db, "INSERT IGNORE INTO agent_sessions(thread_id,session_id) VALUES(?,UUID())", [
      threadId,
    ]);
    const [session] = await query(db, "SELECT session_id FROM agent_sessions WHERE thread_id=?", [
      threadId,
    ]);
    if (!session?.session_id) return;

    const durationUs = Math.max(0, modelMs) * 1000;
    const input = JSON.stringify({
      mode: "opportunistic",
      respond: !!decision.respond,
      deferred: decision.deferred || null,
      revisions: decision.revisions ?? 0,
      burstCount: decision.burstIds?.length ?? 1,
      calls: decision.usage?.calls ?? 0,
      fullModeInvite: !!(
        decision.reminded ||
        (decision.message && decision.message.includes(FULL_MODE_REMINDER))
      ),
    });
    const judgeOutput = decision.respond
      ? decision.reminded || (decision.message || "").includes(FULL_MODE_REMINDER)
        ? "提醒再 @小祥"
        : "决定参与"
      : `决定沉默${decision.deferred ? `（${decision.deferred}）` : ""}`;
    await insertCompletedAgentEvent(db, {
      messageId,
      sessionId: session.session_id,
      tool: "participation_judge",
      input,
      output: judgeOutput,
      durationUs,
    });
    if (decision.respond && decision.message) {
      await insertCompletedAgentEvent(db, {
        messageId,
        sessionId: session.session_id,
        tool: "assistant_final",
        input: "{}",
        output: String(decision.message).slice(0, 4000),
      });
    }
  } catch (error) {
    console.error("Opportunistic participation artifacts failed", {
      messageId,
      threadId,
      type: error?.name || "Error",
      diagnostic: String(error?.message || error).slice(-1000),
    });
  }
}

const PARTICIPATION_SYSTEM =
  '群聊助理小祥。未 @ 时判断是否插话。默认少说（互聊/确认/闲聊沉默）。点名小祥、催沉默、紧跟你说话的点评追问、同内容连发×3 须短回一句。只写这句回复本身，不要提 @、不要提完整模式、不要加使用说明。只返回 JSON：{"respond":false} 或 {"respond":true,"message":"一句中文"}。不要承诺每条都回。';

const PARTICIPATION_REVISE_SYSTEM =
  '群聊助理小祥。未发出的回复需按新消息改稿或 {"respond":false}。点名/催沉默/mustReply=true 应保留短回。只改回复本身，不要提 @，不要提完整模式。只返回 JSON。';

export const FULL_MODE_REMINDER = "需要麻烦你再@小祥，我才会真的开始。";

export function appendFullModeReminder(message, { replace = false } = {}) {
  const text = String(message || "").trim();
  if (!text || replace || promisesFullModeWork(text)) return FULL_MODE_REMINDER;
  if (text.includes(FULL_MODE_REMINDER) || text.includes("我才会真的开始")) return text;
  const end = /[。！？!?…]$/u.test(text) ? "" : "。";
  return text + end + FULL_MODE_REMINDER;
}

export function reminderNeededByRule(burst, draft) {
  return shouldInviteFullMode(burst) || promisesFullModeWork(draft);
}

export async function decideParticipation(context, request = fetch) {
  const messages = context.modelMessages || compactParticipationMessages(context.messages || []);
  const integrateBurst = compactParticipationMessages(
    (context.integrateBurst || []).map(({ author, body }) => ({
      author,
      source: "human",
      body,
    })),
  );
  // Burst is already the tip of `messages`; only resend on revise to highlight new lines.
  const revising = context.revision > 0 || !!context.previousDraft;
  const started = performance.now();
  const configured = context.modelCapture || modelConfig("coordinator");
  const data = await modelResponse(
    {
      scope: "coordinator",
      config: configured,
      // Tiny JSON judgment: turn reasoning off so low max_output_tokens is not eaten by CoT.
      maxTokens: OPPORTUNISTIC_MAX_TOKENS,
      reasoningEffort: "none",
      signal: AbortSignal.timeout(OPPORTUNISTIC_MODEL_TIMEOUT_MS),
      messages: [
        {
          role: "system",
          content: revising ? PARTICIPATION_REVISE_SYSTEM : PARTICIPATION_SYSTEM,
        },
        {
          role: "user",
          content: JSON.stringify({
            title: context.title,
            messages,
            ...(revising ? { integrateBurst, previousDraft: context.previousDraft || null } : {}),
            replyingToAssistant: !!context.replyingToAssistant,
            soloRunNeedsReply: !!context.soloRunNeedsReply,
            soloRunCount: context.soloRunCount || 0,
            namedOrComplaining: !!context.namedOrComplaining,
            mustReply: !!context.mustReply,
          }),
        },
      ],
    },
    request,
  );
  let decision;
  try {
    decision = JSON.parse(responseText(data) || "null");
  } catch {
    throw new Error("Invalid participation decision");
  }
  return {
    ...normalizeParticipationDecision(decision),
    usage: modelUsage(data?.usage),
    modelAccounting: capturedModelUsage(configured, { reasoningEffort: "none" }),
    durationMs: Math.round(performance.now() - started),
  };
}
