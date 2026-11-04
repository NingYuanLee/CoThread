/**
 * 记忆作业的维护会话：版式对齐工作空间里的问老翁，会话和轨迹在同一个弹窗里切换。
 * 只读，没有输入框；会话版式与运行态由 SessionConversationDialog 统一维护。
 */
import { buildTrajectory, type AgentLogData, type AgentLogScope } from "./trajectory-model";
import { SessionConversationDialog, type SessionApi } from "./SessionConversationDialog";

export function MemoryJobSessionDialog({
  title,
  projectId,
  task,
  api,
  onClose,
}: {
  title: string;
  projectId: string;
  task: string;
  api: SessionApi;
  onClose: () => void;
}) {
  const scope: AgentLogScope = { type: "project", id: projectId, task };
  const sourceKey = projectId + ":" + task;
  const load = async (signal: AbortSignal) => {
    const [sessionResult, trajectoryResult] = await Promise.allSettled([
      api(`/projects/${projectId}/laoweng-sessions/${task}`, undefined, "GET", signal),
      api(
        `/projects/${projectId}/agent-logs?task=${encodeURIComponent(task)}`,
        undefined,
        undefined,
        signal,
      ),
    ]);
    if (sessionResult.status === "rejected") throw sessionResult.reason;
    return {
      data: sessionResult.value,
      totals:
        trajectoryResult.status === "fulfilled"
          ? buildTrajectory(trajectoryResult.value as AgentLogData, Date.now()).totals
          : null,
    };
  };

  return (
    <SessionConversationDialog
      title={title}
      titleId="memory-job-session-title"
      subtitle="维护会话 · 只读"
      closeLabel="关闭维护会话"
      api={api}
      load={load}
      sourceKey={sourceKey}
      trajectory={scope}
      navigatorAuthor="老翁"
      empty={() => (
        <div className="conversation-empty">
          <h3>还没有会话内容</h3>
          <p>运行之后，输入和回答会留在这里。不能在这里继续发言。</p>
        </div>
      )}
      context={() => ({ writable: false })}
      onClose={onClose}
    />
  );
}
