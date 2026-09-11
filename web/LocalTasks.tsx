import React, { useEffect, useRef, useState } from "react";

export type LocalTask = {
  id: string;
  connector_id: string;
  message_id: string;
  requested_by: string;
  assigned_to: string;
  status: "awaiting_approval" | "queued" | "running" | "paused" | "stopped_pending_approval" |
    "completed_pending_notification" | "failed_pending_notification" | "completed" | "failed" | "cancelled" | "interrupted";
  policy: "unrestricted" | "style_only" | "layout_style";
  allowGitPush: boolean;
  progress: string | null;
  instruction: string | null;
  output: string | null;
  diff: string | null;
  error: string | null;
  connector_name: string;
  connector_owner_name: string;
  created_at: string;
  finished_at?: string | null;
};

export type AvailableConnector = {
  projectId: string; id: string; name: string; ownerId: string; ownerName: string;
  policy: "unrestricted" | "style_only" | "layout_style";
  allowGitPush: boolean;
};

const labels: Record<LocalTask["status"], string> = {
  awaiting_approval: "待你确认", queued: "待开始", running: "执行中", paused: "暂停",
  stopped_pending_approval: "终止待通过", completed_pending_notification: "成功待通知",
  failed_pending_notification: "失败待通知", completed: "成功", failed: "失败", cancelled: "终止", interrupted: "终止",
};
const pushLabel = (allowed: boolean) => allowed ? "允许 Git 推送" : "不允许 Git 推送";

export function LocalTasks({ tasks, userId, availableConnectors, api, onRefresh }: {
  tasks: LocalTask[];
  userId: string;
  availableConnectors: AvailableConnector[];
  api: (path: string, data?: unknown, method?: string) => Promise<any>;
  onRefresh: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const reversed = [...tasks].reverse();
  const pending = reversed.find((task) => task.status === "awaiting_approval" && task.assigned_to === userId && task.instruction);
  const latest = reversed.find((task) => ["awaiting_approval", "queued", "running", "paused", "stopped_pending_approval",
    "completed_pending_notification", "failed_pending_notification"].includes(task.status)) || tasks.at(-1);
  const [selectedId, setSelectedId] = useState("");
  const selected = tasks.find((task) => task.id === selectedId) || latest;
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [transferId, setTransferId] = useState("");
  useEffect(() => {
    if (!pending || dialog.current?.open) return;
    setSelectedId(pending.id);
    setPrompt(pending.instruction || "");
    dialog.current?.showModal();
  }, [pending?.id]);
  useEffect(() => {
    setPrompt(selected?.instruction || "");
    setTransferId(availableConnectors.find((item) => item.ownerId !== selected?.assigned_to)?.id || "");
  }, [selected?.id, selected?.instruction, selected?.assigned_to, availableConnectors]);
  if (!latest) return null;
  const decide = async (approved: boolean) => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      await api(`/connector-tasks/${selected.id}/decision`, { approved, ...(approved ? { prompt } : {}) });
      await onRefresh();
      if (!approved) dialog.current?.close();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  const reassign = async () => {
    if (!selected || !transferId) return;
    setBusy(true); setError("");
    try {
      await api(`/connector-tasks/${selected.id}/reassign`, { connectorId: transferId });
      await onRefresh();
      dialog.current?.close();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  const canDecide = selected?.status === "awaiting_approval" && selected.assigned_to === userId;
  const canWithdraw = selected?.requested_by === userId && selected.assigned_to !== userId &&
    ["awaiting_approval", "queued", "running", "paused"].includes(selected.status);
  const transferTargets = availableConnectors.filter((item) => item.ownerId !== selected?.assigned_to);
  const statusLabel = (task: LocalTask) => task.status === "awaiting_approval" && task.assigned_to !== userId
    ? `待 ${task.connector_owner_name} 确认` : labels[task.status];
  return <>
    <button type="button" className={`local-task-summary ${latest.status}`} onClick={() => {
      setSelectedId(latest.id); setPrompt(latest.instruction || ""); dialog.current?.showModal();
    }}>
      <span className="local-task-dot" aria-hidden="true" />
      <strong>{statusLabel(latest)}</strong>
      <span>{latest.progress || `${latest.connector_owner_name} / ${latest.connector_name}`}</span>
      <span aria-hidden="true">›</span>
    </button>
    <dialog ref={dialog} className="local-task-dialog" onClose={() => setError("")}>
      <header>
        <div><small>LOCAL CODEX</small><h2>本机任务</h2></div>
        <button type="button" aria-label="关闭" title="关闭" onClick={() => dialog.current?.close()}>×</button>
      </header>
      <div className="local-task-layout">
        <nav aria-label="本机任务列表">
          {[...tasks].reverse().map((task) => <button type="button" key={task.id}
            aria-current={selected?.id === task.id ? "page" : undefined} onClick={() => setSelectedId(task.id)}>
            <strong>{statusLabel(task)}</strong><span>{task.connector_owner_name} / {task.connector_name}</span><small>{pushLabel(task.allowGitPush)}</small>
          </button>)}
        </nav>
        {selected && <section>
          <div className="local-task-heading"><div><h3>{selected.status === "awaiting_approval" && selected.assigned_to !== userId ? `等待 ${selected.connector_owner_name} 确认` : labels[selected.status]}</h3><p>执行设备：{selected.connector_owner_name} / {selected.connector_name} · {pushLabel(selected.allowGitPush)}</p></div></div>
          {selected.instruction && (canDecide
            ? <textarea aria-label="待确认任务说明" value={prompt} maxLength={20000} onChange={(event) => setPrompt(event.target.value)} />
            : <pre className="local-task-prompt">{selected.instruction}</pre>)}
          {selected.output && <><h4>执行结果</h4><pre>{selected.output}</pre></>}
          {selected.diff && <><h4>代码差异</h4><pre className="local-task-diff">{selected.diff}</pre></>}
          {selected.error && <p className="project-settings-error">{selected.error}</p>}
          {error && <p className="project-settings-error" role="alert">{error}</p>}
          {canDecide && <footer className="local-task-decision">
            {!!transferTargets.length && <><select aria-label="转交成员" value={transferId} onChange={(event) => setTransferId(event.target.value)}>
              {transferTargets.map((item) => <option value={item.id} key={item.id}>{item.ownerName} / {item.name}</option>)}
            </select><button type="button" disabled={busy || !transferId} onClick={() => void reassign()}>转交</button></>}
            <button type="button" disabled={busy} onClick={() => void decide(false)}>取消任务</button>
            <button type="button" className="primary" disabled={busy || prompt.trim().length < 80} onClick={() => void decide(true)}>{busy ? "正在提交…" : "确认并发送"}</button>
          </footer>}
          {canWithdraw && <footer><button type="button" disabled={busy} onClick={() => void (async () => {
            setBusy(true); setError(""); try { await api(`/connector-tasks/${selected.id}/cancel`, {}); await onRefresh(); dialog.current?.close(); }
            catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
          })()}>撤回任务</button></footer>}
          {["queued", "running", "paused"].includes(selected.status) && [selected.requested_by, selected.assigned_to].includes(userId) && <footer><button type="button" disabled={busy} onClick={() => void (async () => {
            setBusy(true); setError(""); try { await api(`/connector-tasks/${selected.id}/cancel`, {}); await onRefresh(); }
            catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
          })()}>停止任务</button></footer>}
        </section>}
      </div>
    </dialog>
  </>;
}
