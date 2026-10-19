import React from "react";

import type { ContextUsage } from "../shared/context.js";

export type L1Run = {
  id: string;
  task: string;
  thread_id?: string | null;
  trigger_source: "schedule" | "user";
  status: string;
  agent_called: boolean;
  had_updates: boolean;
  item_count: number | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};
export type L1Session = {
  id: string;
  task: string;
  threadId: string | null;
  threadTitle: string | null;
  sessionId: string | null;
  sessionStatus: "idle" | "running" | "failed";
  lastError: string | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  contextUsage: ContextUsage;
};
export type HistoryColumn = { key: string; label: string };
export type HistoryRow = {
  id: string;
  tone?: "idle" | "running" | "waiting" | "failed";
  cells: Record<string, string>;
  actions?: React.ReactNode;
};
export type MonitorData = {
  generatedAt: string;
  models: Record<
    "knowledge" | "runtime" | "coordinator" | "executor",
    {
      model: string;
      reasoningEffort: string;
    }
  >;
  knowledge: {
    sessionId: string | null;
    sessionStatus: "idle" | "running" | "failed";
    lastTask: string | null;
    lastError: string | null;
    lastStartedAt: string | null;
    lastFinishedAt: string | null;
    memberPending: number;
    documentPending: number;
    ready: number;
    nextAt: string | null;
    lastUpdatedAt: string | null;
    memberLastAt: string | null;
    memberNextAt: string | null;
    documentLastAt: string | null;
    documentNextAt: string | null;
    projectDocumentPending: number;
    projectDocumentLastAt: string | null;
    projectDocumentNextAt: string | null;
    iterationDocumentPending: number;
    iterationDocumentLastAt: string | null;
    iterationDocumentNextAt: string | null;
    memberRuns: L1Run[];
    projectDocumentRuns: L1Run[];
    iterationDocumentRuns: L1Run[];
    documentRuns: L1Run[];
    sessions: L1Session[];
    organizationLastAt: string | null;
    organizationJobs: {
      id: string;
      thread_id: string | null;
      thread_title: string | null;
      scope: "iteration" | "project";
      status: string;
      error: string | null;
      document_count: number | null;
      created_at: string;
      started_at: string | null;
      finished_at: string | null;
    }[];
    archiveLastAt: string | null;
    archives: {
      id: string;
      title: string;
      archived_at: string;
      conclusion: string;
      contextUsage?: ContextUsage;
      sessionStatus?: string;
      runs?: L1Run[];
    }[];
    archiveHistory?: {
      id: string;
      kind: "plan" | "record";
      title: string;
      occurredAt: string | null;
      conclusion: string;
      status: string;
      error: string | null;
    }[];
  };
  coordinators: {
    id: string;
    title: string;
    status: string;
    queued_requests: number;
    running_requests: number;
    active_executors: number;
    convergence_state: string;
    steering_epoch: number;
    wait_reason: string | null;
    current_action: string | null;
    react_phase: string | null;
    recent_message: string | null;
    last_activity_at: string;
    contextUsage?: ContextUsage;
  }[];
  humanAgents: {
    member_id: string;
    name: string;
    nodes: {
      executor_type: "human_self" | "human_connector";
      executor_id: string | null;
      online: boolean;
      configured?: boolean;
    }[];
  }[];
  executors: {
    task_id: string;
    thread_id: string;
    thread_title: string;
    requested_by: string;
    goal: string;
    status: string;
    progress: string | null;
    agent_slot: number | null;
    execution_active: number;
    started_at: string;
    finished_at: string | null;
    last_action: string | null;
    last_action_status: string | null;
    last_action_at: string | null;
    update_count: number;
    contextUsage?: ContextUsage;
    executor_type?: "dsh_l3" | "human_self" | "human_connector";
    executor_id?: string | null;
    target_type?: string | null;
    target_id?: string | null;
    task_type?: "assist_l2" | "formal";
    source_type?: string;
    created_by_type?: string;
    created_by_id?: string;
    claimed_by_type?: string | null;
    claimed_by_id?: string | null;
    result_summary?: string | null;
    artifact_refs?: unknown[] | string | null;
  }[];
  taskPool: {
    task_id: string;
    origin_thread_id?: string | null;
    title: string;
    goal: string;
    task_type: "assist_l2" | "formal";
    task_status: string;
    run_status: string | null;
    source_type: string;
    source_user_id: string | null;
    target_type: string | null;
    target_id: string | null;
    claimed_by_type: string | null;
    claimed_by_id: string | null;
    created_by_type: string;
    created_by_id: string;
    executor_type: "dsh_l3" | "human_self" | "human_connector" | null;
    executor_id: string | null;
    progress: string | null;
    result_summary: string | null;
    artifact_refs: unknown[] | string | null;
    started_at?: string | null;
    finished_at?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  }[];
  eventLog: {
    id: string;
    message_id: string;
    thread_id: string;
    thread_title: string;
    agent_session_id: string | null;
    agent_type: "l2" | "dsh_l3";
    tool: string;
    action: string;
    status: "running" | "completed" | "failed";
    created_at: string;
    finished_at: string | null;
    duration_ms: number | null;
  }[];
};
export type WorkflowTone = "idle" | "running" | "waiting" | "failed" | "blocked";
export type L3Detail = {
  id: string;
  title: string;
  typeLabel: string;
  statusLabel: string;
  tone: WorkflowTone;
  goal: string;
  progress: string | null;
  result: string | null;
  artifacts: number;
  source: string;
  target: string;
  executor: string;
  time: string;
};
export type TaskSessionData = {
  status?: string;
  progress?: string | null;
  running?: boolean;
  error?: string | null;
  contextUsage: ContextUsage;
  messages: { id: string; role: string; source: string | null; text: string }[];
  events?: {
    id: string;
    tool: string;
    status: string;
    input: string;
    finished_at: string | null;
    screenshotUrl?: string | null;
  }[];
  pending?: { id: string; author: string; body: string; createdAt: string }[];
};
export type SessionTarget =
  { kind: "l1"; task: string } | { kind: "l3"; title: string; threadId: string; messageId: string };
