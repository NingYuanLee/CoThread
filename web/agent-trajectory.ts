import { l1TaskLabel } from "../shared/agent-label.js";

export type AgentLogScope = { type: "project" | "thread" | "task"; id: string };
export type AgentLogEvent = {
  id: string;
  agentType: "l1" | "l2" | "dsh_l3";
  agentSessionId: string | null;
  taskId: string | null;
  task?: string;
  messageId: string | null;
  threadId: string | null;
  tool: string;
  action: string;
  target?: string;
  status: "running" | "completed" | "failed";
  createdAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  preview?: string;
  error?: string;
};
export type AgentLogInput = {
  id: string;
  messageId: string;
  createdAt: string;
  preview: string;
};
export type AgentLogData = {
  title: string;
  scopeType?: AgentLogScope["type"];
  scopeId?: string;
  inputs?: AgentLogInput[];
  events: AgentLogEvent[];
};
export type TimelineKind = "user" | "message" | "reply" | "tool";
export type TimelineSpan = {
  id: string;
  event: AgentLogEvent | null;
  input: AgentLogInput | null;
  start: number;
  end: number;
  kind: TimelineKind;
  lane: 0 | 1 | 2 | 3;
  isError: boolean;
  label: string;
};
export type TimelineModel = { start: number; end: number; spans: TimelineSpan[] };
export type LedgerRow = {
  id: string;
  kind: TimelineKind | "header";
  turn: number;
  step: number | null;
  label: string;
  inputText: string;
  outputText: string;
  thinkText: string;
  event: AgentLogEvent | null;
  input: AgentLogInput | null;
  createdAt: string;
  durationMs: number | null;
  isError: boolean;
};
export type LedgerTurn = { turn: number; label: string; rows: LedgerRow[] };

const MODEL_PHASE = new Set(["thinking"]);
const REPLY_PHASE = new Set(["assistant_text", "assistant_final"]);

export function timestamp(value: string) {
  return new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z").getTime();
}

export function formatClock(value: string) {
  return new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z")
    .toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function eventKind(event: AgentLogEvent): TimelineKind {
  if (event.tool === "user_input") return "user";
  if (REPLY_PHASE.has(event.tool)) return "reply";
  if (event.agentType === "l1") {
    if (event.tool === "model_run") return "message";
    if (event.tool === "validate_result") return "reply";
    return "tool";
  }
  return MODEL_PHASE.has(event.tool) ? "message" : "tool";
}

export const TIMELINE_LANES: TimelineKind[] = ["user", "message", "tool", "reply"];

export function kindLabel(kind: TimelineKind) {
  return kind === "user" ? "输入" : kind === "message" ? "思考" : kind === "reply" ? "正文" : "工具";
}

export function rowKindLabel(event: AgentLogEvent | null, input: AgentLogInput | null) {
  if (input) return "输入";
  if (!event) return "";
  if (event.agentType === "l1") return kindLabel(eventKind(event));
  if (event.tool === "thinking") return "思考";
  if (REPLY_PHASE.has(event.tool)) return "正文";
  return event.action.split(" ")[0] || "工具";
}

function laneFor(kind: TimelineKind): 0 | 1 | 2 | 3 {
  return TIMELINE_LANES.indexOf(kind) as 0 | 1 | 2 | 3;
}

function isModelTurn(event: AgentLogEvent) {
  return MODEL_PHASE.has(event.tool) || REPLY_PHASE.has(event.tool)
    || (event.agentType === "l1" && (event.tool === "model_run" || event.tool === "validate_result"));
}

export function buildTimeline(events: AgentLogEvent[], inputs: AgentLogInput[], now: number): TimelineModel | null {
  const raw: TimelineSpan[] = [
    ...inputs.map((input) => {
      const start = timestamp(input.createdAt);
      return {
        id: input.id,
        event: null,
        input,
        start,
        end: start + 80,
        kind: "user" as const,
        lane: 0 as const,
        isError: false,
        label: input.preview || "输入",
      };
    }),
    ...events.map((event) => {
      const kind = eventKind(event);
      const start = timestamp(event.createdAt);
      const finished = event.finishedAt ? timestamp(event.finishedAt) : (event.status === "running" ? now : start);
      return {
        id: event.id,
        event,
        input: null,
        start,
        end: Math.max(finished, start + 1),
        kind,
        lane: laneFor(kind),
        isError: event.status === "failed",
        label: event.preview || event.action,
      };
    }),
  ].sort((left, right) => left.start - right.start || left.end - right.end);
  if (!raw.length) return null;
  let removedIdle = 0;
  let coveredUntil: number | null = null;
  const offsetById = new Map<string, number>();
  for (const span of raw) {
    if (coveredUntil !== null && span.start > coveredUntil) removedIdle += span.start - coveredUntil;
    offsetById.set(span.id, removedIdle);
    coveredUntil = coveredUntil === null ? span.end : Math.max(coveredUntil, span.end);
  }
  const spans = raw.map((span) => {
    const offset = offsetById.get(span.id) || 0;
    return { ...span, start: span.start - offset, end: span.end - offset };
  });
  const start = Math.min(...spans.map((span) => span.start));
  const end = Math.max(...spans.map((span) => span.end));
  if (end - start < 50) {
    return {
      start: 0,
      end: spans.length,
      spans: spans.map((span, index) => ({ ...span, start: index, end: index + 1 })),
    };
  }
  return { start, end, spans };
}

function ledgerInputText(event: AgentLogEvent | null, input: AgentLogInput | null) {
  if (input) return input.preview;
  if (!event) return "";
  if (MODEL_PHASE.has(event.tool) || REPLY_PHASE.has(event.tool)) return "";
  return event.target || event.action;
}

function ledgerOutputText(event: AgentLogEvent | null) {
  if (!event) return "";
  if (event.tool === "thinking" || (event.agentType === "l1" && event.tool === "model_run")) return "";
  if (event.status === "failed") return event.error || "失败";
  if (event.agentType === "l1" && event.tool === "validate_result") return "校验通过";
  if (REPLY_PHASE.has(event.tool)) return event.preview || "";
  return event.status === "running" ? "进行中" : "已完成";
}

function ledgerThinkText(event: AgentLogEvent | null) {
  if (event?.tool === "thinking") return "思考";
  if (event?.agentType === "l1" && event.tool === "model_run") return "思考";
  return "";
}

export function ledgerSummary(row: LedgerRow) {
  if (row.kind === "user") return row.inputText;
  if (row.kind === "reply") return row.outputText;
  if (row.kind === "message") return "";
  return row.inputText || row.outputText;
}

export function buildLedger(events: AgentLogEvent[], inputs: AgentLogInput[]): LedgerTurn[] {
  const chronological = [...events].sort((left, right) => {
    const delta = timestamp(left.createdAt) - timestamp(right.createdAt);
    return delta || (BigInt(left.id) < BigInt(right.id) ? -1 : 1);
  });
  const groups = new Map<string, AgentLogEvent[]>();
  const order: string[] = [];
  let l1Run = 0;
  for (const event of chronological) {
    let key = event.messageId;
    if (!key && event.agentType === "l1") {
      if (event.tool === "prepare_context") l1Run += 1;
      key = `l1:${Math.max(l1Run, 1)}`;
    }
    key = key || event.id;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(event);
  }
  const inputByMessage = new Map(inputs.map((item) => [item.messageId, item]));
  return order.map((key, index) => {
    const group = groups.get(key)!;
    const input = inputByMessage.get(key) || null;
    const rows: LedgerRow[] = [];
    if (input) {
      rows.push({
        id: input.id,
        kind: "user",
        turn: index + 1,
        step: null,
        label: "输入",
        inputText: input.preview,
        outputText: "",
        thinkText: "",
        event: null,
        input,
        createdAt: input.createdAt,
        durationMs: null,
        isError: false,
      });
    }
    let step = 0;
    let messageOpen = false;
    for (const event of group) {
      const model = isModelTurn(event);
      if (model) {
        if (!messageOpen) {
          step += 1;
          messageOpen = true;
        }
      } else {
        step += 1;
        messageOpen = false;
      }
      const kind = eventKind(event);
      rows.push({
        id: event.id,
        kind,
        turn: index + 1,
        step,
        label: rowKindLabel(event, null),
        inputText: ledgerInputText(event, null),
        outputText: ledgerOutputText(event),
        thinkText: ledgerThinkText(event),
        event,
        input: null,
        createdAt: event.createdAt,
        durationMs: event.durationMs,
        isError: event.status === "failed",
      });
    }
    return {
      turn: index + 1,
      label: l1TaskLabel(group.find((event) => event.task)?.task) || `第 ${index + 1} 轮`,
      rows,
    };
  });
}

export function prettyPayload(value: string | null | undefined) {
  if (!value) return "";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export function inspectorTabsFor(kind: TimelineKind, tool?: string): string[] {
  if (kind === "user") return ["概述", "输入", "计时"];
  if (tool === "thinking" || tool === "model_run") return ["概述", "思考", "计时"];
  if (tool === "assistant_text" || tool === "assistant_final" || tool === "validate_result") return ["概述", "输出", "计时"];
  return ["概述", "参数", "结果", "计时"];
}
