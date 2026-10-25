/**
 * 轨迹模型：对齐 DSH 原生轨迹。
 * 顶部技术数据只有三大类泳道（输入 / 模型 / 工具）；
 * 步骤按七类：系统、用户、上下文（输入）；请求、助手（模型）；工具、子工具（工具）。
 */
import type { DialogueMode } from "../shared/dialogue-mode.js";

export type AgentLogScope =
  | { type: "project"; id: string; task: string }
  | { type: "thread" | "task"; id: string }
  | { type: "wiki"; id: string; room: string };

export type AgentLogEvent = {
  id: string;
  agentType: "laoweng" | "xiaoxiang" | "child_agent";
  agentSessionId: string | null;
  taskId: string | null;
  task?: string;
  messageId: string | null;
  /** 轮锚：一次 run 一轮；子 Agent 完工续报是独立一轮。 */
  turnKey?: string | null;
  threadId: string | null;
  tool: string;
  action: string;
  target?: string;
  status: "running" | "completed" | "failed";
  createdAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  preview?: string;
  /** 服务端给的稳定轮次（触发消息在迭代里的序号）；分页加载不会让它变。 */
  turn?: number | null;
  /** context_notice 的来源 kind：system-agents-md / notice / cothread… */
  noticeKind?: string | null;
  error?: string;
  screenshotUrl?: string;
  usage?: {
    model?: string;
    reasoningEffort?: string;
    settingsVersion?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    modelMs?: number;
    executionDurationMs?: number;
    ttftMs?: number;
    ttftSteps?: number;
    decodeMs?: number;
    decodeTokens?: number;
    calls?: number;
  } | null;
};

export type AgentLogInput = {
  id: string;
  messageId: string;
  createdAt: string;
  preview: string;
  /** 消息正文（完整）；老翁的提问从事件里取，这里是空。 */
  body?: string;
  /** 引用的文件（versions），预览里列出来。 */
  files?: { id: string; name: string; mime?: string | null; size?: number | null }[];
  /**
   * 输入是谁给的：群里的用户、小祥派给子 Agent 的任务书、老翁定时任务、老翁手动「立即整理」。
   * 轨迹行分别标成「用户」「小祥派活」「定时任务」「手动任务」。
   */
  from?: "user" | "coordinator" | "scheduled" | "manual";
  /** 这一轮群聊的对话模式；老翁与旧数据没有这个字段，按 null 处理（不显示标签）。 */
  dialogueMode?: DialogueMode | null;
};

/** 上下文压缩结果：before/after 都是词元数。 */
export type CompactUsage = {
  before: number | null;
  after: number | null;
  changed: boolean;
  reason: string | null;
};

/** 词元数的短写法：17500 → 17.5K，和问老翁消息流里的压缩行一致。 */
export function shortTokens(value?: number | null) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "0";
  return amount >= 1000 ? String(Math.round(amount / 100) / 10) + "K" : String(Math.round(amount));
}

/**
 * context_compact 事件的 input 是 JSON 字符串 {before,after,changed,reason}。
 * 列表接口不返回 input，调用方按需取详情后再解析；解析不了就返回 null，不猜数值。
 */
export function parseCompactUsage(input: unknown): CompactUsage | null {
  let value = input;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const num = (candidate: unknown) =>
    typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
  const before = num(record.before);
  const after = num(record.after);
  const changed = record.changed === true;
  const reason = typeof record.reason === "string" && record.reason ? record.reason : null;
  if (before == null && after == null && !changed && !reason) return null;
  return { before, after, changed, reason };
}

/**
 * 压缩行的结果文案：压缩完成：X → Y / 本次压缩未减少用量 / 压缩失败。
 * 拿不到 input 时退回服务端写好的 output 文案；仍在进行中绝不能写「已完成」。
 */
export function compactLine(
  status: AgentLogEvent["status"],
  usage: CompactUsage | null,
  fallback?: string | null,
) {
  // 行首已经有黄色「压缩」标签，这里只写结果，不再重复“压缩”两字。
  if (status === "running") return "正在摘要较早的对话";
  if (status === "failed") return "没有完成";
  if (usage) {
    if (usage.changed && usage.before != null && usage.after != null && usage.after < usage.before)
      return `已收成摘要：${shortTokens(usage.before)} → ${shortTokens(usage.after)}`;
    if (usage.reason === "not_smaller" || usage.changed) return "没有减少用量";
    if (usage.reason === "already_small") return "上下文较短，无需压缩";
    if (usage.before != null && usage.after != null)
      return `已收成摘要：${shortTokens(usage.before)} → ${shortTokens(usage.after)}`;
  }
  return String(fallback || "").trim() || "已完成";
}

/** 压缩前后的明细文案；数值缺失就返回空串，不编造。 */
export function compactTokensLine(usage: CompactUsage | null) {
  if (!usage || usage.before == null || usage.after == null) return "";
  const saved = Math.max(0, usage.before - usage.after);
  const base = `压缩前 ${shortTokens(usage.before)} 词元 · 压缩后 ${shortTokens(usage.after)} 词元`;
  return saved > 0 ? `${base} · 释放约 ${shortTokens(saved)} 词元` : base;
}

export type AgentLogData = {
  title: string;
  scopeType?: AgentLogScope["type"];
  scopeId?: string;
  systemPrompt?: string;
  /** 系统提示词按段给出：名称、顺序、来源与正文，和 DSH 拼装方式一致。 */
  systemSections?: { name: string; order: number; source?: string; text: string }[];
  tools?: string[];
  inputs?: AgentLogInput[];
  /** 轨迹分页：是否还有更早的一页，以及继续往前翻的游标（当前最老事件 id）。 */
  page?: { hasMore: boolean; before: string | null };
  events: AgentLogEvent[];
};

export type LaneId = "input" | "model" | "tool";
export type StepKind = "system" | "user" | "context" | "request" | "assistant" | "tool" | "subtool";

export const LANES: { id: LaneId; label: string }[] = [
  { id: "input", label: "输入" },
  { id: "model", label: "模型" },
  { id: "tool", label: "工具" },
];

export const STEP_KINDS: Record<
  StepKind,
  { label: string; lane: LaneId; dot?: boolean; tabs: string[] }
> = {
  system: { label: "系统", lane: "input", tabs: ["系统提示词", "工具"] },
  user: { label: "用户", lane: "input", tabs: ["概述", "预览", "原始内容", "来源"] },
  context: { label: "上下文", lane: "input", tabs: ["概述", "预览", "原始内容", "来源"] },
  request: { label: "请求", lane: "model", tabs: ["概述", "选项", "用量", "计时"] },
  assistant: { label: "助手", lane: "model", dot: true, tabs: ["概述", "预览", "原始内容"] },
  tool: { label: "工具", lane: "tool", tabs: ["概述", "代码", "结果", "Schema", "计时"] },
  subtool: { label: "子工具", lane: "tool", tabs: ["概述", "参数", "结果", "Schema", "计时"] },
};

export type TrajectoryStep = {
  id: string;
  kind: StepKind;
  lane: LaneId;
  turn: number;
  /** 轮内原始步骤序号，从 1 开始（含输入类步骤，只用于排序） */
  index: number;
  /**
   * 轮内第几步：只有模型请求才算一步，请求之前的输入类步骤为 0（不计步）。
   * 请求之后的思考、工具、子工具、上下文都归到这一步，直到下一次请求。
   */
  stepNo: number;
  /** 是否在步骤列表里显示；请求只作为助手行的圆点出现 */
  hiddenFromList?: boolean;
  /** 助手步骤对应的请求步骤 id（圆点选中它就是选中请求） */
  requestId?: string;
  /** 是否为该轮第一个步骤（左上角显示「第 N 轮」） */
  turnStart: boolean;
  title: string;
  summary: string;
  status: AgentLogEvent["status"];
  createdAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  isError: boolean;
  start: number;
  end: number;
  event: AgentLogEvent | null;
  input: AgentLogInput | null;
};

export type TrajectoryTurn = {
  turn: number;
  label: string;
  steps: TrajectoryStep[];
  runMode: "light" | "dsh" | null;
  /** 这一轮提问带的对话模式；null 表示不显示标签。 */
  dialogueMode: DialogueMode | null;
};

export type TrajectoryTotals = {
  turns: number;
  steps: number;
  modelCalls: number;
  toolCalls: number;
  durationMs: number;
  tokens: number;
  cacheHitRate: number | null;
};

export type TrajectoryModel = {
  turns: TrajectoryTurn[];
  steps: TrajectoryStep[];
  spans: { id: string; kind: StepKind; lane: LaneId; start: number; end: number; label: string }[];
  start: number;
  end: number;
  totals: TrajectoryTotals;
};

const REPLY_PHASE = new Set(["assistant_text", "assistant_final"]);
const MODEL_PHASE = new Set(["thinking"]);
// 真正的上下文注入。老翁维护流水线里的「启动 DSH 会话」「保存检查点」是动作，不算上下文，
// 以前混在这里会让每轮显示成「用户 + 三个上下文」。
const CONTEXT_TOOLS = new Set([
  "context_notice",
  "prepare_context",
  "compact_context",
  "context_compact",
  "context_sync",
]);

/** 事件 id 可能是自增数字，也可能是 wiki 的 UUID：数字按大小，其余按字典序。 */
export function compareIds(left: string, right: string) {
  const numeric = /^\d+$/.test(left) && /^\d+$/.test(right);
  if (numeric) return Number(left) - Number(right);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function timestamp(value: string) {
  return new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z").getTime();
}

export function formatClock(value: string) {
  return new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z").toLocaleString(
    "zh-CN",
    { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" },
  );
}

export function prettyPayload(value: string | null | undefined) {
  if (!value) return "";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export function stepKindLabel(kind: StepKind) {
  return STEP_KINDS[kind].label;
}

/** 上下文压缩事件：列表行要写成「压缩」，不混在普通上下文注入里。 */
export function isCompactEvent(event: AgentLogEvent | null | undefined) {
  return event?.tool === "context_compact";
}

/** 列表里的类型名：压缩事件显示「压缩」，其余仍是七类名称。 */
export function stepKindText(step: TrajectoryStep) {
  if (isCompactEvent(step.event)) return "压缩";
  // 子 Agent 的输入是小祥写的任务书，不是用户消息。
  if (step.kind === "user" && step.input?.from === "coordinator") return "小祥派活";
  // 老翁维护任务没有提问者，输入是调度给它的维护任务。
  if (step.kind === "user" && step.input?.from === "scheduled") return "定时任务";
  if (step.kind === "user" && step.input?.from === "manual") return "手动任务";
  return STEP_KINDS[step.kind].label;
}

export function stepTabs(kind: StepKind) {
  return STEP_KINDS[kind].tabs;
}

/** 事件 → 步骤类别。老翁维护阶段与问老翁步骤都按同一套语义归类。 */
export function classifyEvent(event: AgentLogEvent): StepKind {
  if (event.tool === "user_input") return "user";
  if (CONTEXT_TOOLS.has(event.tool)) return "context";
  if (event.agentType === "laoweng") {
    if (event.tool === "model_run" || event.tool === "understanding") return "assistant";
    if (REPLY_PHASE.has(event.tool)) return "assistant";
    if (event.tool === "validate_result") return "tool";
    return "tool";
  }
  if (MODEL_PHASE.has(event.tool) || REPLY_PHASE.has(event.tool)) return "assistant";
  // 子工具只指子 Agent 自己执行的工具；派单本身（agent_run）仍是工具。
  if (event.agentType === "child_agent") return "subtool";
  return "tool";
}

function stepTitle(event: AgentLogEvent, kind: StepKind) {
  if (kind === "assistant") {
    if (event.tool === "thinking" || event.tool === "model_run" || event.tool === "understanding")
      return "思考";
    return event.preview ? "回答" : "助手";
  }
  if (kind === "tool") return event.action.trim() || event.tool;
  if (kind === "subtool") return event.action.trim() || event.tool;
  if (kind === "context") return event.action.trim() || event.tool;
  return STEP_KINDS[kind].label;
}

function stepSummary(event: AgentLogEvent, kind: StepKind) {
  const text = (event.preview || event.target || "").replace(/\s+/g, " ").trim();
  if (kind === "assistant") return text;
  if (kind === "tool" || kind === "subtool") return text || event.action;
  return text || event.action;
}

/** 一轮内：每次模型调用前补一条「请求」，助手步骤用圆点标记。 */
export function buildTrajectory(data: AgentLogData | null, now: number): TrajectoryModel {
  const events = [...(data?.events || [])].sort((left, right) => {
    const delta = timestamp(left.createdAt) - timestamp(right.createdAt);
    return delta || compareIds(left.id, right.id);
  });
  const inputs = data?.inputs || [];
  const inputByMessage = new Map(inputs.map((item) => [item.messageId, item]));

  const groups = new Map<string, AgentLogEvent[]>();
  const order: string[] = [];
  let laowengRun = 0;
  let openedByQuestion = false;
  for (const event of events) {
    let key = event.turnKey || event.messageId;
    if (!key && event.agentType === "laoweng") {
      // 只按「提问」和「维护任务开始」切轮；understanding 是一次请求的叙述，
      // 属于本轮里的某一步，不能另起一轮。
      if (event.tool === "user_input") {
        laowengRun += 1;
        openedByQuestion = true;
      } else if (event.tool === "prepare_context") {
        if (!openedByQuestion) laowengRun += 1;
        openedByQuestion = false;
      }
      key = `laoweng:${Math.max(laowengRun, 1)}`;
    }
    key = key || event.id;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(event);
  }

  const turns: TrajectoryTurn[] = [];
  const steps: TrajectoryStep[] = [];
  let fallbackTurn = 0;
  for (const [key, group] of order.map((item) => [item, groups.get(item)!] as const)) {
    fallbackTurn += 1;
    // 优先用服务端给的稳定轮次：轨迹分页往上翻、加载更早的事件时不会整体重编号。
    const turn = group.find((event) => Number.isFinite(event.turn))?.turn || fallbackTurn;
    // 每轮从 0 起算：遇到模型请求才 +1，输入类步骤不占步数。
    let stepNo = 0;
    const input = inputByMessage.get(key) || null;
    const turnSteps: TrajectoryStep[] = [];
    const push = (
      kind: StepKind,
      payload: {
        id: string;
        title: string;
        summary: string;
        status: AgentLogEvent["status"];
        createdAt: string;
        finishedAt: string | null;
        durationMs: number | null;
        start: number;
        end: number;
        event?: AgentLogEvent | null;
        input?: AgentLogInput | null;
        requestId?: string;
        hiddenFromList?: boolean;
      },
    ) => {
      const hiddenFromList = payload.hiddenFromList || kind === "request";
      const step: TrajectoryStep = {
        id: payload.id,
        kind,
        lane: STEP_KINDS[kind].lane,
        turn,
        index: turnSteps.length + 1,
        // 输入泳道（系统/用户/上下文）不占步数，也不显示步数。
        stepNo: STEP_KINDS[kind].lane === "input" ? 0 : stepNo,
        hiddenFromList,
        requestId: payload.requestId,
        turnStart: turnSteps.length === 0,
        title: payload.title,
        summary: payload.summary,
        status: payload.status,
        createdAt: payload.createdAt,
        finishedAt: payload.finishedAt,
        durationMs: payload.durationMs,
        isError: payload.status === "failed",
        start: payload.start,
        end: payload.end,
        event: payload.event ?? null,
        input: payload.input ?? null,
      };
      turnSteps.push(step);
      steps.push(step);
      return step;
    };

    const groupStart = timestamp(group[0].createdAt);
    const groupEnd = group.reduce(
      (acc, event) => Math.max(acc, timestamp(event.finishedAt || event.createdAt)),
      groupStart,
    );
    // cothread 的系统提示词会随补丁/重启变化：同一会话的下一轮可能换了新版本，
    // 所以逐轮显示，并优先用本轮真实生效的那份（system_prompt 事件）。
    const systemEvent = group.find((event) => event.tool === "system_prompt") || null;
    // 老翁维护任务每次运行都不记逐轮系统提示词，补一条「当前版本」只会让每轮看起来一模一样。
    const maintenanceScope = data?.scopeType === "project";
    if (!maintenanceScope || systemEvent)
      push("system", {
        id: `${key}:system`,
        title: "系统",
        summary: systemEvent
          ? "本轮系统提示词"
          : data?.systemPrompt
            ? "系统提示词（当前版本）"
            : "未记录",
        status: "completed",
        createdAt: group[0].createdAt,
        finishedAt: group[0].createdAt,
        durationMs: null,
        start: groupStart,
        end: groupStart + Math.min(120, Math.max(1, groupEnd - groupStart)),
        event: systemEvent,
      });
    if (input) {
      push("user", {
        id: input.id,
        title:
          input.from === "coordinator"
            ? "小祥派活"
            : input.from === "scheduled"
              ? "定时任务"
              : input.from === "manual"
                ? "手动任务"
                : "用户",
        summary: input.preview,
        status: "completed",
        createdAt: input.createdAt,
        finishedAt: input.createdAt,
        durationMs: null,
        start: timestamp(input.createdAt),
        end: timestamp(input.createdAt) + 80,
        input,
      });
    }

    let lastAssistantId: string | null = null;
    let lastAssistantMessageId: string | null = null;
    let pendingRequestId: string | null = null;
    // 一次模型返回可能拆成 thinking / text 多个助手块：列表里只留一行，其余并进「原始内容」。
    let lastAssistantStep: TrajectoryStep | null = null;
    for (const event of group) {
      // 系统提示词已经落在本轮的「系统」行上，不再单独占一行。
      if (event.tool === "system_prompt") continue;
      const kind = classifyEvent(event);
      const start = timestamp(event.createdAt);
      const finished = event.finishedAt
        ? timestamp(event.finishedAt)
        : event.status === "running"
          ? now
          : start;
      const end = Math.max(finished, start + 1);
      // 老数据里可能缺这次请求的叙述行：工具调用本身就说明前面发生过一次请求。
      // 不补的话这些工具会落到「不计步」，与「每步都是请求」对不上。
      if ((kind === "tool" || kind === "subtool") && stepNo === 0) {
        stepNo += 1;
        push("request", {
          id: `${key}:request:implicit:${event.id}`,
          title: "请求",
          summary: "未记录请求内容",
          status: "completed",
          createdAt: event.createdAt,
          finishedAt: event.createdAt,
          durationMs: null,
          start,
          end: Math.max(start + 1, Math.min(start + 60, end)),
          event: null,
        });
      }
      // 同一条消息里的 thinking / text 属于同一次返回；老翁每次「理解」「说明」都是独立请求。
      const sameResponse =
        kind === "assistant" &&
        lastAssistantId !== null &&
        Boolean(event.messageId) &&
        event.messageId === lastAssistantMessageId;
      const startsModelCall = kind === "assistant" && !sameResponse;
      if (startsModelCall) {
        stepNo += 1;
        lastAssistantStep = null;
        const requestId = `${key}:request:${event.id}`;
        pendingRequestId = requestId;
        push("request", {
          id: requestId,
          title: "请求",
          summary: event.usage?.totalTokens ? `${event.usage.totalTokens} tokens` : "未记录选项",
          status: "completed",
          createdAt: event.createdAt,
          finishedAt: event.createdAt,
          durationMs: null,
          start,
          end: Math.max(start + 1, Math.min(start + 60, end)),
          event: null,
        });
      }
      if (kind === "assistant") lastAssistantId = event.id;
      else if (kind === "tool" || kind === "subtool" || kind === "context") {
        lastAssistantId = null;
        lastAssistantMessageId = null;
        lastAssistantStep = null;
      }
      const pushed = push(kind, {
        id: event.id,
        title: stepTitle(event, kind),
        summary: stepSummary(event, kind),
        status: event.status,
        createdAt: event.createdAt,
        finishedAt: event.finishedAt,
        durationMs: event.durationMs,
        start,
        end,
        event,
        requestId: kind === "assistant" ? (pendingRequestId ?? undefined) : undefined,
      });
      if (kind === "assistant") {
        lastAssistantMessageId = event.messageId ?? null;
        // 同一次返回的后续块并进第一行：圆点跟着留下那一行，块本身仍在「原始内容」里。
        if (sameResponse && lastAssistantStep && lastAssistantStep !== pushed) {
          pushed.requestId = lastAssistantStep.requestId;
          lastAssistantStep.hiddenFromList = true;
          lastAssistantStep.requestId = undefined;
        }
        lastAssistantStep = pushed;
        pendingRequestId = null;
      }
    }

    turns.push({
      turn,
      label: laowengLabel(group),
      steps: turnSteps,
      runMode: turnRunMode(group),
      dialogueMode: input?.dialogueMode ?? null,
    });
  }

  // 请求的「选项 / 用量 / 计时」都来自同一次模型返回：把用量和时间回填到请求行上。
  for (const built of turns) {
    const responses = new Map<string, TrajectoryStep[]>();
    for (const step of built.steps) {
      if (step.kind !== "assistant" || !step.requestId) continue;
      const list = responses.get(step.requestId) || [];
      list.push(step);
      responses.set(step.requestId, list);
    }
    for (const step of built.steps) {
      if (step.kind !== "request") continue;
      const list = responses.get(step.id);
      if (!list?.length) continue;
      const source = list.find((item) => item.event?.usage) || list[list.length - 1];
      if (!source?.event) continue;
      step.event = source.event;
      step.finishedAt = source.finishedAt ?? step.finishedAt;
      step.durationMs = source.event.usage?.executionDurationMs ?? step.durationMs ?? null;
      if (source.finishedAt) step.end = Math.max(step.start + 1, timestamp(source.finishedAt));
    }
  }

  // 轮次徽标挂在每轮第一个「可见」步骤上。
  for (const built of turns) {
    let marked = false;
    for (const step of built.steps) {
      step.turnStart = !step.hiddenFromList && !marked;
      if (step.turnStart) marked = true;
    }
  }

  // 计时条只画真正发生的事：请求不占色块，同一次返回里被并掉的内容块也不重复画。
  const spans = steps
    .filter((step) => !step.hiddenFromList)
    .map((step) => ({
      id: step.id,
      kind: step.kind,
      lane: step.lane,
      start: step.start,
      end: step.end,
      label: `${step.title}${step.summary ? " · " + step.summary : ""}`,
    }));
  const start = spans.length ? Math.min(...spans.map((span) => span.start)) : now;
  const end = spans.length ? Math.max(...spans.map((span) => span.end)) : now;
  const durationMs = steps.reduce((acc, step) => acc + (step.durationMs || 0), 0);
  const tokens = events.reduce((acc, event) => acc + (event.usage?.totalTokens || 0), 0);
  const cacheHit = events.length
    ? events.filter((event) => (event.usage as any)?.cacheReadTokens).length / events.length
    : null;
  return {
    turns,
    steps,
    spans,
    start,
    end,
    totals: {
      turns: turns.length,
      // 步数 = 模型请求数：工具、思考、输入都并进所在的那一步，不另计。
      steps: steps.filter((step) => step.kind === "request").length,
      modelCalls: steps.filter((step) => step.kind === "request").length,
      toolCalls: steps.filter((step) => step.kind === "tool" || step.kind === "subtool").length,
      durationMs,
      tokens,
      cacheHitRate: cacheHit,
    },
  };
}

function laowengLabel(group: AgentLogEvent[]) {
  const task = group.find((event) => event.task)?.task;
  if (!task) return "";
  return task;
}

export function turnRunMode(events: AgentLogEvent[]): "light" | "dsh" | null {
  if (!events.length) return null;
  if (events.every((event) => event.agentType === "laoweng")) return null;
  if (events.some((event) => event.tool === "participation_judge")) return "light";
  if (
    REPLY_PHASE.has(events[0]?.tool || "") &&
    events.every((event) => event.agentType === "xiaoxiang")
  )
    return "light";
  return "dsh";
}

export function runModeLabel(mode: "light" | "dsh" | null) {
  return mode === "light" ? "轻量" : mode === "dsh" ? "完整" : "";
}
