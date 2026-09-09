import React, { useEffect, useRef, useState } from "react";

type Kind = "all" | "mention" | "member_added" | "member_removed";
type Notice = { id: string; kind: Exclude<Kind, "all">; title: string; sender_name: string; body: string; project_name: string; read_at: string | null; created_at: string; can_open: boolean; thread_id: string | null };
type Page = { items: Notice[]; unread: number; counts: Partial<Record<Kind, { total: number; unread: number }>>; next: string | null };
const tabs: { id: Kind; label: string }[] = [{ id: "all", label: "全部" }, { id: "mention", label: "@我的" }, { id: "member_added", label: "加入项目" }, { id: "member_removed", label: "移出项目" }];
const empty: Page = { items: [], unread: 0, counts: {}, next: null };
const time = (value: string, compact = false) => new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z").toLocaleString("zh-CN", compact ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false } : { hour12: false });
export function Notifications({ api, onOpen }: {
  api: (path: string, data?: unknown, method?: string, signal?: AbortSignal) => Promise<any>;
  onOpen: (target: any) => void;
}) {
  const [page, setPage] = useState<Page>(empty);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("all");
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const bell = useRef<HTMLButtonElement>(null);
  const revision = useRef(0);
  const pages = useRef(new Map<string, Page>());
  const selected = page.items.find((n) => n.id === selectedId);
  const cursor = cursors[cursors.length - 1];
  const total = kind === "all" ? Object.values(page.counts).reduce((sum, count) => sum + count.total, 0) : page.counts[kind]?.total || 0;
  useEffect(() => {
    let alive = true;
    const version = ++revision.current;
    const path = `/notifications?kind=${kind}&limit=12${cursor ? `&before=${cursor}` : ""}`;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let inFlight = false;
    let needsPage = open;
    const cached = pages.current.get(path);
    if (open) {
      if (cached) setPage(cached);
      else setPage((old) => ({ ...empty, counts: old.counts, unread: old.unread }));
    }
    const load = async () => {
      clearTimeout(timer);
      if (document.hidden || inFlight) return;
      inFlight = true;
      if (needsPage && !cached) setLoading(true);
      try {
        const full = needsPage;
        const result: Page = await api(full ? path : "/notifications?summary=1", undefined, undefined, controller.signal);
        if (!alive || version !== revision.current) return;
        if (full) {
          needsPage = false;
          pages.current.set(path, result);
          if (pages.current.size > 12) pages.current.delete(pages.current.keys().next().value!);
          setPage(result);
          setSelectedId((current) => result.items.some((n) => n.id === current) ? current : "");
        } else setPage((old) => ({ ...old, unread: result.unread, counts: result.counts }));
        setError("");
      } catch (e) { if (alive) setError((e as Error).message); }
      finally {
        inFlight = false;
        if (alive) { setLoading(false); timer = setTimeout(() => void load(), open ? 8000 : 15000); }
      }
    };
    const resume = () => { if (!document.hidden) void load(); else clearTimeout(timer); };
    void load();
    document.addEventListener("visibilitychange", resume);
    return () => { alive = false; controller.abort(); clearTimeout(timer); document.removeEventListener("visibilitychange", resume); };
  }, [open, kind, cursor, reload]);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const act = async (action: () => Promise<void>) => {
    setBusy(true); setError(""); pages.current.clear();
    try { await action(); } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const select = (notice: Notice) => {
    setSelectedId(notice.id);
    if (!notice.read_at) void act(async () => {
      await api(`/notifications/${notice.id}/read`, {});
      setPage((old) => ({ ...old, unread: Math.max(0, old.unread - 1), counts: { ...old.counts, [notice.kind]: { total: old.counts[notice.kind]?.total || 0, unread: Math.max(0, (old.counts[notice.kind]?.unread || 0) - 1) } }, items: old.items.map((n) => n.id === notice.id ? { ...n, read_at: new Date().toISOString() } : n) }));
    });
  };
  const changeTab = (next: Kind) => { if (next === kind) return; setKind(next); setCursors([null]); setSelectedId(""); setPage((old) => ({ ...old, items: [], next: null })); };
  return <>
    <button ref={bell} className="sidebar-toggle notification-bell" title="站内信" aria-label={`站内信，${page.unread} 条未读`} onClick={() => setOpen(true)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      {page.unread > 0 && <span className="notification-count">{page.unread > 99 ? "99+" : page.unread}</span>}
    </button>
    <dialog ref={dialog} className="notification-dialog" aria-labelledby="notification-title" onCancel={() => setOpen(false)} onClose={() => { setOpen(false); bell.current?.focus(); }}>
      <div className="notification-heading"><h2 id="notification-title">站内信 <small>{page.unread} 条未读</small></h2><button aria-label="关闭站内信" onClick={() => setOpen(false)}>×</button></div>
      <div className="notification-toolbar">
        <div className="notification-tabs" role="tablist" aria-label="站内信类型">{tabs.map((item, index) => <button key={item.id} role="tab" id={`notice-tab-${item.id}`} aria-controls="notice-panel" aria-selected={kind === item.id} tabIndex={kind === item.id ? 0 : -1} disabled={busy} onClick={() => changeTab(item.id)} onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const target = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
          changeTab(tabs[target].id);
          document.getElementById(`notice-tab-${tabs[target].id}`)?.focus();
        }}>{item.label}{(item.id === "all" ? page.unread : page.counts[item.id]?.unread || 0) > 0 && <span>{item.id === "all" ? page.unread : page.counts[item.id]?.unread}</span>}</button>)}</div>
        <div className="notification-tools"><button disabled={busy || loading} onClick={() => { setCursors([null]); setSelectedId(""); setReload((v) => v + 1); }}>刷新</button><button disabled={busy || !page.unread} onClick={() => void act(async () => { await api("/notifications/read-all", {}); setReload((v) => v + 1); })}>全部已读</button></div>
      </div>
      {error && <p role="alert" className="notification-error">{error}</p>}
      <div id="notice-panel" role="tabpanel" aria-labelledby={`notice-tab-${kind}`} className="notification-split">
        <section className="notification-inbox" aria-label="消息列表" aria-busy={loading}>
          <div className="notification-columns"><span>标题</span><span>发送人</span><span>时间</span></div>
          <div className="notification-rows">
            {loading ? <p className="notification-empty">正在加载…</p> : !page.items.length ? <p className="notification-empty">暂无此类站内信</p> : page.items.map((notice) => <button key={notice.id} className={`notification-row ${notice.read_at ? "" : "unread"} ${selectedId === notice.id ? "selected" : ""}`} disabled={busy} aria-pressed={selectedId === notice.id} onClick={() => select(notice)}>
              <span title={notice.title}>{notice.title}</span><span title={notice.sender_name}>{notice.sender_name}</span><time title={time(notice.created_at)} dateTime={notice.created_at}>{time(notice.created_at, true)}</time>
            </button>)}
          </div>
          <div className="notification-pagination"><small>共 {total} 条 · 第 {cursors.length} 页</small><div><button disabled={busy || loading || cursors.length === 1} onClick={() => { setCursors((old) => old.slice(0, -1)); setSelectedId(""); }}>上一页</button><button disabled={busy || loading || !page.next} onClick={() => { setCursors((old) => [...old, page.next]); setSelectedId(""); }}>下一页</button></div></div>
        </section>
        <section className="notification-detail" aria-label="消息详情" aria-live="polite">
          {!selected || loading ? <div className="notification-detail-empty"><span>✉</span><p>选择左侧消息，查看详情</p></div> : <>
            <span className="notification-kind">{tabs.find((item) => item.id === selected.kind)?.label}</span>
            <h3>{selected.title}</h3>
            <div className="notification-meta"><span>发送人：{selected.sender_name}</span><time>{time(selected.created_at)}</time><span>项目：{selected.project_name}</span></div>
            <p className="notification-body">{selected.body}</p>
            <div className="notification-actions">
              {!!selected.can_open && <button disabled={busy} onClick={() => void act(async () => { const target = await api(`/notifications/${selected.id}/open`, {}); onOpen(target); setOpen(false); })}>{selected.thread_id ? "打开迭代会话" : "进入项目"}</button>}
              {!selected.can_open && selected.kind !== "member_removed" && <small>已无该项目的访问权限</small>}
              {!selected.read_at && <button disabled={busy} onClick={() => select(selected)}>标为已读</button>}
            </div>
          </>}
        </section>
      </div>
    </dialog>
  </>;
}
