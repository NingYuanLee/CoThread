import { setTimeout as delay } from "node:timers/promises";
import { modelConfig, modelResponse, modelUsage, responseText } from "./model-config.js";
import { saveReplyUsage } from "./agent-usage.js";
import { query } from "./db.js";

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
/** Recent chat rows for light-path judgment — enough to follow the thread. */
export const OPPORTUNISTIC_HISTORY_LIMIT = 12;
/** Per-message body cap in the light-path prompt. */
export const OPPORTUNISTIC_BODY_CHARS = 240;
/** One short Chinese sentence JSON; leave modest headroom. */
export const OPPORTUNISTIC_MAX_TOKENS = 768;

export function compactParticipationBody(body, limit = OPPORTUNISTIC_BODY_CHARS) {
  const text = String(body || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1))}…`;
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
  const message =
    typeof decision.message === "string" ? decision.message.trim() : "";
  if (decision.respond && !message) {
    throw new Error("Invalid participation decision");
  }
  return { respond: decision.respond, message: decision.respond ? message.slice(0, 20000) : undefined };
}

export function deferSilenceProgress(reason) {
  if (reason === "cooldown") return "近期已参与，本轮保持沉默";
  if (reason === "still_changing") return "讨论仍在变化，撤回未发出的回复";
  if (reason === "revised_silent") return "看到后续发言后选择不发出";
  if (reason === "judge_failed") return "参与判断暂时失败，本轮保持沉默";
  return "已保持沉默";
}

/** Structured payload for non-L2 participation judgments (visible in dev logs, not in chat). */
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
  const text = burst.map((row) => String(row.body || "").trim()).filter(Boolean).join("\n");
  if (!text || text.length > 80) return false;
  // Clearly addressing someone else, not 小祥.
  if (/(^|[^\p{L}\p{N}_@])@(?!小祥\b)[\p{L}\p{N}_]/u.test(text)) return false;
  return true;
}

/** Pure ack / receipt — humans usually do not answer these. */
export function isPureAcknowledgement(burstOrText) {
  const text = Array.isArray(burstOrText)
    ? burstOrText.map((row) => String(row.body || "").trim()).filter(Boolean).join("\n")
    : String(burstOrText || "").trim();
  if (!text || text.length > 40) return false;
  if (/(^|[^\p{L}\p{N}_@])@[\p{L}\p{N}_]/u.test(text)) return false;
  if (/[?？]|吗|么|呢|为啥|为什么|怎么|能不能|可不可以|帮|做|看一下|沉默|不说话|回我|在吗|在么/.test(text)) {
    return false;
  }
  return /^(好的?|收到了?|嗯+|哦+|噢+|ok|OK|行|可以|记下了|知道了|了解|明白了?|那就这样|先这样|我就当你记下了)([，,。.!！…\s].*)?$/u.test(
    text,
  );
}

/**
 * Bare vocative "小祥，…" / "小祥 …" counts as addressing her even without @.
 * Full @小祥 still goes through mentionsAgent on the postMessage path.
 */
export function addressesAgent(text) {
  const body = String(text || "").trim();
  if (!body) return false;
  if (/(?:^|[^\p{L}\p{N}_@])@(?:小祥|Agent\s*助手)(?=$|[\s\p{P}\p{S}])/iu.test(body)) {
    return true;
  }
  // Leading vocative only — avoid matching "和小祥一起…".
  return /^(?:小祥)(?:\s*[，,：:]\s*|\s+)/u.test(body);
}

export function burstAddressesAgent(burst) {
  return (burst || []).some((row) => addressesAgent(row.body));
}

/** Nudges/complaints clearly aimed at 小祥 staying quiet. */
export function isAgentDirectedComplaint(burst) {
  if (!burst?.length) return false;
  const text = burst.map((row) => String(row.body || "").trim()).filter(Boolean).join("\n");
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
 * Work-shaped asks the light path cannot fulfill. Invite @小祥 for full mode
 * instead of promising "我这就开始" or auto-running the harness.
 */
export function needsFullAgentWork(burst) {
  if (!burst?.length) return false;
  const text = burst.map((row) => String(row.body || "").trim()).filter(Boolean).join("\n");
  if (!text || text.length < 6) return false;
  if (/(^|[^\p{L}\p{N}_@])@(?!小祥\b)[\p{L}\p{N}_]/u.test(text)) return false;

  const asks =
    /(?:帮我|麻烦|请你|请|拜托|能否|能不能|可以帮|给我|我要|我想要|需要你|劳驾|麻烦你)/u.test(text)
    || /(?:做一下|弄一下|整一下|看一下|查一下|改一下|写一下)/u.test(text);

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
 * Speaker sounds frustrated / impatient with 小祥 or the stall —
 * invite full mode rather than another empty light ack.
 */
export function isNegativeMood(burst) {
  if (!burst?.length) return false;
  const text = burst.map((row) => String(row.body || "").trim()).filter(Boolean).join("\n");
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

/** Light-path copy: steer to an explicit @ so full mode starts intentionally. */
export function briefFullModeInvite(burst) {
  if (isNegativeMood(burst) && !needsFullAgentWork(burst)) {
    return "听得出你有点着急。要认真接着干的话，@小祥 一下就能开完整模式。";
  }
  return "这类事要走完整模式（读会话、写文档/改代码/派活）。你 @小祥 一下，我就可以开工。";
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

const MENTIONS_ANYONE =
  /(?:^|[^\p{L}\p{N}_@])@[\p{L}\p{N}_]/u;

export function normalizeBurstBody(body) {
  return String(body || "").trim().replace(/\s+/g, " ");
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
    const progress =
      messageId === anchorMessageId ? "已参与讨论" : "已并入本次参与";
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
  const recordDecideMeta = (raw) => {
    if (raw?.usage) usageTotals = mergeParticipationUsage(usageTotals, raw.usage);
    if (Number.isFinite(raw?.durationMs)) modelDurationMs += Math.max(0, raw.durationMs);
  };
  const withUsage = (decision) => ({
    ...decision,
    usage: usageTotals,
    executionDurationMs: Math.round(modelDurationMs),
  });
  const forceBriefAck = (burst) => ({
    respond: true,
    message: needsSoloRunReply(burst) && !burstAddressesAgent(burst) && !isAgentDirectedComplaint(burst)
      ? briefSoloRunAck(burst)
      : briefAssistantFollowUpAck(burst),
  });

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
    // Work asks or frustrated tone: invite @小祥 for full mode.
    if (shouldInviteFullMode(burst)) {
      return withUsage({
        respond: true,
        message: briefFullModeInvite(burst),
        burstIds: burst.map((row) => row.id),
        revisions: revision,
        throughSequence,
      });
    }
    const replyingToAssistant = await isReplyingToAssistant(db, threadId, burst);
    const soloRunNeedsReply = needsSoloRunReply(burst);
    const namedOrComplaining =
      burstAddressesAgent(burst) || isAgentDirectedComplaint(burst);
    const mustReply = mustOpportunisticReply(burst, { replyingToAssistant });
    // Hard silence: pure "好的/收到" after we just spoke — do not ping-pong.
    if (replyingToAssistant && isPureAcknowledgement(burst) && !namedOrComplaining && !soloRunNeedsReply) {
      return withUsage({
        respond: false,
        deferred: undefined,
        burstIds: burst.map((row) => row.id),
        revisions: revision,
      });
    }
    // Always let the model phrase the reply; hard rules only force respond / fallback copy.
    const history = await query(
      db,
      `SELECT m.body,m.source,u.name author FROM messages m
       JOIN users u ON u.id=m.author_id
       WHERE m.thread_id=? AND m.sequence<=? ORDER BY m.sequence DESC LIMIT ?`,
      [threadId, throughSequence, OPPORTUNISTIC_HISTORY_LIMIT],
    );
    let decision;
    try {
      const raw = await decide({
        title,
        messages: compactParticipationMessages(history.reverse()),
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

    return withUsage({
      ...decision,
      deferred: decision.respond ? undefined : revision > 0 ? "revised_silent" : undefined,
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
 * Persist light-path (non-harness) participation usage, timing, and L2 trajectory events.
 * Uses the thread's agent_sessions.session_id when present; otherwise creates a UUID binder
 * so events still appear under「二级小祥轨迹」without opening a DSH harness.
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
    const configured = modelConfig("coordinator");
    const modelMs = Math.round(
      Number.isFinite(decision.executionDurationMs)
        ? decision.executionDurationMs
        : wallDurationMs || 0,
    );
    if (decision.usage || modelMs > 0) {
      await saveReplyUsage(db, messageId, {
        ...(decision.usage || {}),
        model: configured.model,
        reasoningEffort: "none",
        executionDurationMs: Math.max(0, modelMs),
      });
    }
    await query(
      db,
      `UPDATE assistant_replies SET first_response_at=COALESCE(first_response_at,UTC_TIMESTAMP(3))
       WHERE message_id=?`,
      [messageId],
    );

    await query(
      db,
      "INSERT IGNORE INTO agent_sessions(thread_id,session_id) VALUES(?,UUID())",
      [threadId],
    );
    const [session] = await query(
      db,
      "SELECT session_id FROM agent_sessions WHERE thread_id=?",
      [threadId],
    );
    if (!session?.session_id) return;

    const durationUs = Math.max(0, modelMs) * 1000;
    const input = JSON.stringify({
      mode: "opportunistic",
      respond: !!decision.respond,
      deferred: decision.deferred || null,
      revisions: decision.revisions ?? 0,
      burstCount: decision.burstIds?.length ?? 1,
      calls: decision.usage?.calls ?? 0,
      fullModeInvite: !!(decision.message && /@小祥/.test(decision.message) && /完整模式/.test(decision.message)),
    });
    const judgeOutput = decision.respond
      ? (/完整模式/.test(decision.message || "") ? "提醒 @ 完整模式" : "决定参与")
      : `决定沉默${decision.deferred ? `（${decision.deferred}）` : ""}`;
    await query(
      db,
      `INSERT INTO agent_events(message_id,agent_session_id,tool,status,input,output,created_at,finished_at)
       VALUES(?,?,'participation_judge','completed',?,?,DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? MICROSECOND),UTC_TIMESTAMP(3))`,
      [messageId, session.session_id, input, judgeOutput, durationUs],
    );
    if (decision.respond && decision.message) {
      await query(
        db,
        `INSERT INTO agent_events(message_id,agent_session_id,tool,status,input,output,finished_at)
         VALUES(?,?,'assistant_final','completed','{}',?,UTC_TIMESTAMP(3))`,
        [messageId, session.session_id, String(decision.message).slice(0, 4000)],
      );
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
  '群聊助理小祥。未 @ 时判断是否插话。默认少说（互聊/确认/闲聊沉默）。点名小祥、催沉默、紧跟你说话的点评追问、同内容连发×3 须短回一句。若成员要写文档/总结/改代码/派任务，或语气明显着急/不满，不要假装开工或空应声，应提醒对方 @小祥 以启动完整模式。只返回 JSON：{"respond":false} 或 {"respond":true,"message":"一句中文"}。不要承诺每条都回。';

const PARTICIPATION_REVISE_SYSTEM =
  '群聊助理小祥。未发出的回复需按新消息改稿或 {"respond":false}。点名/催沉默/mustReply=true 应保留短回；实活需求或对方情绪不佳时，应提醒 @小祥 走完整模式，不要承诺自己马上开干。只返回 JSON。';

export async function decideParticipation(context, request = fetch) {
  const messages =
    context.modelMessages ||
    compactParticipationMessages(context.messages || []);
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
  const data = await modelResponse(
    {
      scope: "coordinator",
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
    durationMs: Math.round(performance.now() - started),
  };
}
