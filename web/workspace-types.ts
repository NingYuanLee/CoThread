import type { ContextUsage } from "../shared/context.js";
import type { UsageStats } from "./MessageUsage";

export type Project = {
  id: string;
  created_by: string;
  created_at: string;
  name: string;
  description: string;
  role: string;
  joined_at: string;
  active_threads: string;
  tab_visible: number;
  tab_pinned_at: string | null;
};

export type Version = {
  id: string;
  artifact_id: string;
  folder_id?: string | null;
  folder_thread_id?: string | null;
  folder_kind?: string | null;
  deleted_at?: string | null;
  title: string;
  version: number;
  filename: string;
  mime?: string | null;
  byte_size: number;
  author: string;
  review: string | null;
  thread_id: string;
};

export type Detail = Project & {
  threads: {
    id: string;
    title: string;
    status: string;
    creator: string;
    created_at: string;
    last_active_at: string;
  }[];
  members: {
    id: string;
    user_number?: number;
    username?: string;
    name: string;
    email: string;
    bound_email?: string | null;
    role: string;
    kind?: "human" | "l1";
    avatar?: string | null;
    motto?: string;
    identity_tags?: string[];
  }[];
  folders: { id: string; parent_id: string | null; thread_id?: string | null; folder_kind?: string | null; system_key?: string | null; name: string }[];
  versions: Version[];
  documentOrganizationJobs: { id: string; thread_id?: string | null; scope: "iteration" | "project"; status: string; error?: string | null }[];
  longTermSummary?: { summary: string; updatedAt: string | null; lastThreadTitle: string | null } | null;
};

export type MessageQuote = {
  id: string;
  thread_id?: string;
  author: string;
  body: string;
  source: string;
  refs: string[];
  folder_refs?: string[];
};

export type LocalTask = {
  id: string;
  status: "awaiting_approval" | "queued" | "running" | "paused" | "stopped_pending_approval" |
    "completed_pending_notification" | "failed_pending_notification" | "completed" | "failed" | "cancelled" | "interrupted";
};

export type AvailableConnector = {
  projectId: string;
  id: string;
  name: string;
  platform?: string;
  ownerId: string;
  ownerName: string;
  policy: "unrestricted" | "style_only" | "layout_style";
  allowGitPush: boolean;
};

export type AgentTask = {
  id: string;
  origin_thread_id: string | null;
  title: string;
  goal: string;
  task_type: "assist_l2" | "formal";
  status: string;
  source_type: string;
  source_user_id: string | null;
  created_by_type: string;
  created_by_id: string;
  target_type: string | null;
  target_id: string | null;
  claimed_by_type: string | null;
  claimed_by_id: string | null;
  execution_agent_type: string | null;
  execution_agent_id: string | null;
  progress: string | null;
  result_summary: string | null;
  updated_at: string;
};

export type AgentTaskDetail = AgentTask & {
  constraints: string | null;
  document_refs?: string[] | string | null;
  folder_refs?: string[] | string | null;
  artifact_refs: unknown[] | string | null;
  assignmentHistory: { id: number; event_type: "assigned" | "transferred" | "rejected" | "acknowledged" | "reopened"; from_target_type: string | null; from_target_id: string | null; to_target_type: string | null; to_target_id: string | null; changed_by_type: string; changed_by_id: string | null; actor_name?: string | null; reason: string | null; created_at: string }[];
  questions: { id: string; source_user_id: string | null; question: string; answer: string | null; status: string; created_at: string }[];
  executionRuns: { id: string; executor_type: string; executor_id: string | null; executor_label?: string | null; executor_member_name?: string | null; executor_owner_name?: string | null; status: string; progress: string | null; result_summary: string | null; error: string | null; created_at: string }[];
  updates: { id: string; body: string; source_type: string; source_id: string; created_at: string }[];
  rejectionReview: { rejected: boolean; resolved: boolean; reviewer_type: string | null; reviewer_id: string | null };
  statusHistory: { id: number; from_status: string | null; to_status: string; actor_type: string; actor_id: string | null; actor_name?: string | null; actor_name_snapshot?: string | null; reason: string | null; created_at: string }[];
  activity?: { kind: "member_update" | "status_change" | "l3_execution"; at: string; body?: string; source_type?: string; actor_name?: string | null; to_status?: string; reason?: string | null; progress?: string | null; result_summary?: string | null }[];
};

export type TaskTimelineKind = "member_update" | "status_change" | "assignment" | "execution";
export type TaskTimelineItem = {
  key: string;
  kind: TaskTimelineKind;
  at: string;
  title: string;
  actorType: string;
  actorId: string | null;
  actorName?: string | null;
  body?: string | null;
};

export type Thread = {
  page?: { hasMore: boolean; before: string | null; after: string | null };
  contextUsage: ContextUsage;
  id: string;
  title: string;
  status: string;
  messages: {
    sequence: string;
    id: string;
    body: string;
    source: string;
    execution_target?: "cloud" | "local";
    refs: string[];
    folder_refs?: string[];
    author: string;
    author_id: string;
    author_avatar?: string | null;
    author_role?: string | null;
    agent_task_id?: string | null;
    quoteTargetId?: string;
    render_key?: string;
    delivery_status?: "sending" | "failed";
    delivery_error?: string;
    quotes?: MessageQuote[];
    created_at: string;
  }[];
  archive_snapshot: { conclusion: string; versions: Version[] } | null;
  runs: {
    id: string;
    status: string;
    output: string;
    kind: string;
    progress: string | null;
    created_at: string;
  }[];
  replies: {
    message_id: string;
    reply_id: string | null;
    parent_message_id: string | null;
    agent_slot: number | null;
    dispatch_ready: boolean;
    participation: "pending" | "reply" | "silent";
    status: string;
    finished_at?: string | null;
    started_at?: string;
    first_response_at?: string | null;
    usage_stats?: UsageStats | string | null;
    error: string | null;
    progress: string | null;
  }[];
  updates: { message_id: string; task_message_id: string; delivered_at: string | null }[];
  requests: { usage_stats?: UsageStats | string | null; first_response_at?: string | null; message_id: string; status: string; response_id: string | null; error: string | null }[];
  connectorTasks: LocalTask[];
  events: {
    id: string;
    message_id: string;
    tool: string;
    status: string;
    input: string;
    output: string | null;
    created_at: string;
    finished_at: string | null;
  }[];
};

export type Modal =
  | "profile"
  | "project"
  | "thread"
  | "settings"
  | "admin-projects"
  | "admin-accounts"
  | "admin-plugins"
  | "archive"
  | "password"
  | "email"
  | "mcp"
  | "run"
  | null;
