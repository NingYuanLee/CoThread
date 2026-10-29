/**
 * 会话头部：群聊/轨迹/任务视图切换、老翁单聊/轨迹切换、停止当前执行。
 * 数据与回调由 WorkspaceApp 打包成 props 传入。
 */
import React, { type Dispatch, type SetStateAction } from "react";
import { COORDINATOR_LOG_IDLE_LABEL } from "./agent-label";
import { UiIcon } from "./ui-icon";
import { api } from "./workspace-api";
import type { Thread, ThreadView } from "./workspace-types";

export type ConversationHeaderProps = {
  thread: Thread | null;
  /** 有项目且有登录人就能问老翁，不要求项目已有迭代。 */
  canAskElder: boolean;
  threadView: ThreadView;
  setThreadView: Dispatch<SetStateAction<ThreadView>>;
  coordinatorLogLabel: string;
  liveCoordinator: Thread["replies"][number] | undefined;
  active: boolean;
  busy: boolean;
  threadId: string;
  run: (task: () => Promise<void>) => Promise<void>;
  refresh: () => Promise<void>;
  elderOpen: boolean;
  setElderOpen: Dispatch<SetStateAction<boolean>>;
  elderView: "chat" | "trajectory";
  setElderView: Dispatch<SetStateAction<"chat" | "trajectory">>;
  onElderSplitPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
};

export function ConversationHeader({
  thread,
  canAskElder,
  threadView,
  setThreadView,
  coordinatorLogLabel,
  liveCoordinator,
  active,
  busy,
  threadId,
  run,
  refresh,
  elderOpen,
  setElderOpen,
  elderView,
  setElderView,
  onElderSplitPointerDown,
}: ConversationHeaderProps) {
  // 分栏与「问老翁」入口只看能不能问（项目 + 登录人），不再要求已有迭代。
  const elderSplit = canAskElder && elderOpen;
  return (
    <div
      className={
        elderSplit ? "conversation-heading conversation-heading-split" : "conversation-heading"
      }
    >
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
              <UiIcon name="users" size={13} />
              群聊
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
              aria-selected={threadView === "tasks"}
              title="查看本迭代任务"
              onClick={() => setThreadView("tasks")}
            >
              <UiIcon name="list" size={13} />
              任务
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
      {elderSplit && (
        <div
          className="conversation-heading-divider"
          aria-hidden="true"
          title="拖拽调整群聊与问老翁宽度"
          onPointerDown={onElderSplitPointerDown}
        />
      )}
      {canAskElder && (
        <span className={elderSplit ? "elder-heading-side" : "conversation-heading-end"}>
          {elderSplit && (
            <div className="conversation-views" role="tablist" aria-label="老翁视图">
              <button
                type="button"
                role="tab"
                className="conversation-view"
                aria-selected={elderView === "chat"}
                onClick={() => setElderView("chat")}
              >
                <UiIcon name="human" size={13} />
                单聊
              </button>
              <button
                type="button"
                role="tab"
                className="conversation-view"
                aria-selected={elderView === "trajectory"}
                onClick={() => setElderView("trajectory")}
              >
                <UiIcon name="trajectory" size={13} />
                轨迹
              </button>
            </div>
          )}
          <button
            type="button"
            className="ask-elder"
            aria-pressed={elderOpen}
            onClick={() => setElderOpen((open) => !open)}
          >
            <UiIcon name="messageQuestion" size={13} />
            问老翁
          </button>
        </span>
      )}
    </div>
  );
}
