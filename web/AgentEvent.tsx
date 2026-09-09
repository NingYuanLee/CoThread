import React, { useEffect, useState } from "react";
import { fetchJson } from "./api-fetch";

export function AgentEvent({ threadId, event, children }: {
  threadId: string;
  event: { id: string; tool: string; status: string; finished_at: string | null };
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<{ input: string; output: string | null } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open || event.tool === "thinking") return;
    const controller = new AbortController();
    setError("");
    fetchJson(`/api/threads/${threadId}/events/${event.id}`, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setPayload(value);
      }).catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [open, threadId, event.id, event.tool, event.status, event.finished_at]);
  return <details onToggle={(e) => setOpen(e.currentTarget.open)}>
    {children}
    {open && (event.tool === "thinking"
      ? <p className="thinking-note">分析请求并准备下一步操作。</p>
      : error ? <p>{error}</p>
      : payload ? <><pre>{payload.input}</pre>{payload.output && <pre>{payload.output}</pre>}</>
      : <p>正在读取执行详情…</p>)}
  </details>;
}
