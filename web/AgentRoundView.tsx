/**
 * 会话里的一轮 Agent 回复：轨迹入口、停止与失败重试。
 * 数据与回调由 WorkspaceApp 打包成 props 传入；reply 逐轮传入。
 */
import { AgentActivity } from "./AgentActivity";
import { isExecutorReply } from "./chat-timeline";
import { api } from "./workspace-api";
import type { LiveOutput } from "./useAgentLiveOutput";
import type { Detail, Thread } from "./workspace-types";

export type AgentRoundViewProps = {
  reply: Thread["replies"][number];
  hasAgentActivity: (reply: Thread["replies"][number]) => boolean;
  active: boolean;
  busy: boolean;
  threadId: string;
  thread: Thread | null;
  detail: Detail | null;
  liveOutput: Record<string, LiveOutput>;
  run: (task: () => Promise<void>) => Promise<void>;
  refresh: () => Promise<void>;
};

export function AgentRoundView({
  reply,
  hasAgentActivity,
  active,
  busy,
  threadId,
  thread,
  detail,
  liveOutput,
  run,
  refresh,
}: AgentRoundViewProps) {
  if (!hasAgentActivity(reply)) return null;
  const stopControl = active && (reply.status === "queued" || reply.status === "running") && (
    <button
      className="agent-stop"
      disabled={busy}
      onClick={() =>
        void run(async () => {
          await api(`/threads/${threadId}/replies/${reply.message_id}/stop`, {});
          await refresh();
        })
      }
    >
      停止
    </button>
  );
  const failed = reply.status === "failed" && (
    <div className="reply-status failed" role="status">
      <span>{reply.error}</span>
      {active && (
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await api(`/threads/${threadId}/replies/${reply.message_id}/retry`, {});
              await refresh();
            })
          }
        >
          重试回复
        </button>
      )}
    </div>
  );
  if (!isExecutorReply(reply)) {
    return failed ? (
      <div className="agent-round" data-message-id={reply.message_id}>
        {failed}
      </div>
    ) : null;
  }
  const events = thread?.events.filter((e) => e.message_id === reply.message_id) || [];
  const output = liveOutput[reply.message_id];
  return (
    <div className="agent-round" data-message-id={reply.message_id}>
      <div className="agent-trace-row">
        <AgentActivity
          threadId={threadId}
          messageId={reply.message_id}
          events={events}
          output={output}
          status={reply.status}
          progress={reply.progress}
          hasFinal={!!reply.reply_id}
          versions={detail?.versions}
          threads={detail?.threads}
        />
        {stopControl}
      </div>
      {failed}
    </div>
  );
}
