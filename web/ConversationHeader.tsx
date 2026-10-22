/**
 * 会话头部：对话/轨迹视图切换、停止当前执行。
 * 数据与回调由 WorkspaceApp 打包成 props 传入。
 */
import { type Dispatch, type SetStateAction } from "react";
import { COORDINATOR_LOG_IDLE_LABEL } from "./agent-label";
import { UiIcon } from "./ui-icon";
import { api } from "./workspace-api";
import type { Thread } from "./workspace-types";

export type ConversationHeaderProps = {
  thread: Thread | null;
  threadView: "chat" | "trajectory" | "brief";
  setThreadView: Dispatch<SetStateAction<"chat" | "trajectory" | "brief">>;
  coordinatorLogLabel: string;
  liveCoordinator: Thread["replies"][number] | undefined;
  active: boolean;
  busy: boolean;
  threadId: string;
  run: (task: () => Promise<void>) => Promise<void>;
  refresh: () => Promise<void>;
};

export function ConversationHeader({
  thread,
  threadView,
  setThreadView,
  coordinatorLogLabel,
  liveCoordinator,
  active,
  busy,
  threadId,
  run,
  refresh,
}: ConversationHeaderProps) {
  return (
    <div className="conversation-heading">
      {thread && (
        <span className="conversation-log-group">
          <div className="conversation-views" role="tablist" aria-label="会话视图">
            <button
              type="button"
              role="tab"
              className="conversation-view"
              aria-selected={threadView === "chat"}
              onClick={() => setThreadView("chat")}
            >
              <UiIcon name="chat" size={13} />
              对话
            </button>
            <button
              type="button"
              role="tab"
              className="conversation-view"
              aria-selected={threadView === "trajectory"}
              data-live={coordinatorLogLabel !== COORDINATOR_LOG_IDLE_LABEL || undefined}
              title={
                coordinatorLogLabel === COORDINATOR_LOG_IDLE_LABEL
                  ? "查看轨迹"
                  : coordinatorLogLabel
              }
              onClick={() => setThreadView("trajectory")}
            >
              {coordinatorLogLabel !== COORDINATOR_LOG_IDLE_LABEL && (
                <span className="conversation-log-pulse" aria-hidden="true" />
              )}
              <UiIcon name="trajectory" size={13} />
              轨迹
            </button>
            <button
              type="button"
              role="tab"
              className="conversation-view"
              aria-selected={threadView === "brief"}
              onClick={() => setThreadView("brief")}
            >
              <UiIcon name="info" size={13} />
              背景与目标
            </button>
          </div>
          {coordinatorLogLabel !== COORDINATOR_LOG_IDLE_LABEL && (
            <span className="conversation-view-status" aria-live="polite">
              {coordinatorLogLabel}
            </span>
          )}
          {liveCoordinator && active && (
            <button
              type="button"
              className="conversation-log-stop"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api(`/threads/${threadId}/replies/${liveCoordinator.message_id}/stop`, {});
                  await refresh();
                })
              }
            >
              <UiIcon name="stop" size={12} />
              停止
            </button>
          )}
        </span>
      )}
    </div>
  );
}
