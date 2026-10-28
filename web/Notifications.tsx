import { RefreshButton } from "./IconButton";
import { DialogHeader } from "./DialogHeader";
import { useTipError } from "./Tip";
import React, { useEffect, useRef, useState } from "react";
import { UiIcon } from "./ui-icon";
import { ProjectMark } from "./ProjectMark";
import { Dialog, animateDialogClose } from "./dialog-fx";
import { PaginationControl } from "./PaginationControl";

type Category = "all" | "chat" | "task" | "project";
type Notice = {
  id: string;
  kind: string;
  category?: "chat" | "task" | "project";
  title: string;
  sender_name: string;
  body: string;
  project_name: string;
  project_image?: string | null;
  read_at: string | null;
  created_at: string;
  can_open: boolean;
  thread_id: string | null;
};
type Page = {
  items: Notice[];
  unread: number;
  counts: Partial<Record<string, { total: number; unread: number }>>;
  categories?: Partial<Record<Exclude<Category, "all">, { total: number; unread: number }>>;
  next: string | null;
};
const tabs: { id: Category; label: string; icon: "inbox" | "mention" | "list" | "project" }[] = [
  { id: "all", label: "全部", icon: "inbox" },
  { id: "chat", label: "聊天", icon: "mention" },
  { id: "task", label: "任务", icon: "list" },
  { id: "project", label: "项目", icon: "project" },
];
const categoryKinds: Record<Exclude<Category, "all">, string[]> = {
  chat: ["mention"],
  task: ["task_assigned", "task_decision", "task_blocked", "task_completed", "task_failed"],
  project: [
    "member_added",
    "member_removed",
    "leader_gained",
    "leader_lost",
    "admin_granted",
    "admin_revoked",
    "role_changed",
    "project_archived",
    "project_restored",
  ],
};
const categoryOf = (notice: Notice): Exclude<Category, "all"> => {
  if (notice.category === "chat" || notice.category === "task" || notice.category === "project")
    return notice.category;
  if (notice.kind === "mention") return "chat";
  if (notice.kind.startsWith("task_")) return "task";
  return "project";
};
const tally = (counts: Page["counts"], names: string[]) =>
  names.reduce(
    (sum, name) => ({
      total: sum.total + (counts[name]?.total || 0),
      unread: sum.unread + (counts[name]?.unread || 0),
    }),
    { total: 0, unread: 0 },
  );
const kindLabel: Record<string, string> = {
  mention: "聊天",
  task_assigned: "任务",
  task_decision: "任务",
  task_blocked: "任务",
  task_completed: "任务",
  task_failed: "任务",
  member_added: "项目",
  member_removed: "项目",
  leader_gained: "项目",
  leader_lost: "项目",
  admin_granted: "项目",
  admin_revoked: "项目",
  role_changed: "项目",
  project_archived: "项目",
  project_restored: "项目",
};
const empty: Page = { items: [], unread: 0, counts: {}, next: null };
const time = (value: string, compact = false) =>
  new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z").toLocaleString(
    "zh-CN",
    compact
      ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }
      : { hour12: false },
  );
export function Notifications({
  api,
  onOpen,
}: {
  api: (path: string, data?: unknown, method?: string, signal?: AbortSignal) => Promise<any>;
  onOpen: (target: any) => void;
}) {
  const [page, setPage] = useState<Page>(empty);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Category>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useTipError();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const bell = useRef<HTMLButtonElement>(null);
  const revision = useRef(0);
  const pages = useRef(new Map<string, Page>());
  const selected = page.items.find((n) => n.id === selectedId);
  const categoryTotal = (id: Exclude<Category, "all">) =>
    page.categories?.[id] ?? tally(page.counts, categoryKinds[id]);
  const items =
    kind === "all" ? page.items : page.items.filter((notice) => categoryOf(notice) === kind);
  const total =
    kind === "all"
      ? Object.values(page.counts).reduce((sum, count) => sum + (count?.total || 0), 0)
      : categoryTotal(kind).total;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => {
    setCurrentPage((current) => Math.min(current, totalPages));
  }, [totalPages]);
  useEffect(() => {
    let alive = true;
    const version = ++revision.current;
    const path = `/notifications?category=${kind}&limit=${pageSize}&page=${currentPage}`;
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
        const result: Page = await api(
          full ? path : "/notifications?summary=1",
          undefined,
          undefined,
          controller.signal,
        );
        if (!alive || version !== revision.current) return;
        if (full) {
          needsPage = false;
          const filtered =
            kind === "all"
              ? result
              : {
                  ...result,
                  items: (result.items || []).filter((notice) => categoryOf(notice) === kind),
                };
          pages.current.set(path, filtered);
          if (pages.current.size > 12) pages.current.delete(pages.current.keys().next().value!);
          setPage(filtered);
          setSelectedId((current) => (filtered.items.some((n) => n.id === current) ? current : ""));
        } else
          setPage((old) => ({
            ...old,
            unread: result.unread,
            counts: result.counts,
            categories: result.categories || old.categories,
          }));
        setError("");
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        inFlight = false;
        if (alive) {
          setLoading(false);
          timer = setTimeout(() => void load(), open ? 8000 : 15000);
        }
      }
    };
    const resume = () => {
      if (!document.hidden) void load();
      else clearTimeout(timer);
    };
    void load();
    document.addEventListener("visibilitychange", resume);
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [open, kind, currentPage, pageSize, reload]);
  const close = () => animateDialogClose(dialog.current, () => setOpen(false));
  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    pages.current.clear();
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const select = (notice: Notice) => {
    setSelectedId(notice.id);
    if (!notice.read_at)
      void act(async () => {
        await api(`/notifications/${notice.id}/read`, {});
        setPage((old) => ({
          ...old,
          unread: Math.max(0, old.unread - 1),
          counts: {
            ...old.counts,
            [notice.kind]: {
              total: old.counts[notice.kind]?.total || 0,
              unread: Math.max(0, (old.counts[notice.kind]?.unread || 0) - 1),
            },
          },
          items: old.items.map((n) =>
            n.id === notice.id ? { ...n, read_at: new Date().toISOString() } : n,
          ),
        }));
      });
  };
  const changeTab = (next: Category) => {
    if (next === kind) return;
    setKind(next);
    setCurrentPage(1);
    setSelectedId("");
    setPage((old) => ({ ...old, items: [], next: null }));
  };
  return (
    <>
      <button
        ref={bell}
        className="sidebar-toggle notification-bell"
        title="站内信"
        aria-label={`站内信，${page.unread} 条未读`}
        onClick={() => setOpen(true)}
      >
        <svg
          width="1.429rem"
          height="1.429rem"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        {page.unread > 0 && (
          <span className="notification-count">{page.unread > 99 ? "99+" : page.unread}</span>
        )}
      </button>
      <Dialog
        active={open}
        onRequestClose={() => setOpen(false)}
        ref={dialog}
        className="notification-dialog"
        aria-labelledby="notification-title"
      >
        <DialogHeader
          title={<>站内信 </>}
          titleId="notification-title"
          subtitle={<>{page.unread}条未读</>}
          onClose={close}
          closeLabel="关闭站内信"
          actions={
            <>
              <RefreshButton
                pending={loading}
                disabled={busy || loading}
                onClick={() => {
                  setSelectedId("");
                  setReload((v) => v + 1);
                }}
                label="刷新站内信"
              />
            </>
          }
        />
        <div className="notification-toolbar">
          <div className="notification-tabs" role="tablist" aria-label="站内信类型">
            {tabs.map((item, index) => (
              <button
                key={item.id}
                role="tab"
                id={`notice-tab-${item.id}`}
                aria-controls="notice-panel"
                aria-selected={kind === item.id}
                tabIndex={kind === item.id ? 0 : -1}
                disabled={busy}
                onClick={() => changeTab(item.id)}
                onKeyDown={(event) => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  const target =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
                          tabs.length;
                  changeTab(tabs[target].id);
                  document.getElementById(`notice-tab-${tabs[target].id}`)?.focus();
                }}
              >
                <UiIcon name={item.icon} size={13} />
                {item.label}
                {(item.id === "all" ? page.unread : categoryTotal(item.id).unread) > 0 && (
                  <span>{item.id === "all" ? page.unread : categoryTotal(item.id).unread}</span>
                )}
              </button>
            ))}
          </div>
          <div className="notification-tools">
            <button
              disabled={busy || !page.unread}
              onClick={() =>
                void act(async () => {
                  await api("/notifications/read-all", {});
                  setReload((v) => v + 1);
                })
              }
            >
              <UiIcon name="check" size={12} />
              全部已读
            </button>
          </div>
        </div>
        <div
          id="notice-panel"
          role="tabpanel"
          aria-labelledby={`notice-tab-${kind}`}
          className="notification-split"
        >
          <section className="notification-inbox" aria-label="消息列表" aria-busy={loading}>
            <div className="notification-columns">
              <span>标题</span>
              <span>发送人</span>
              <span>时间</span>
            </div>
            <div className="notification-rows">
              {loading ? (
                <p className="notification-empty">正在加载…</p>
              ) : !items.length && !error ? (
                <p className="notification-empty">暂无此类站内信</p>
              ) : (
                items.map((notice) => (
                  <button
                    key={notice.id}
                    className={`notification-row ${notice.read_at ? "" : "unread"} ${selectedId === notice.id ? "selected" : ""}`}
                    disabled={busy}
                    aria-pressed={selectedId === notice.id}
                    onClick={() => select(notice)}
                  >
                    <span title={notice.title}>{notice.title}</span>
                    <span title={notice.sender_name}>{notice.sender_name}</span>
                    <time title={time(notice.created_at)} dateTime={notice.created_at}>
                      {time(notice.created_at, true)}
                    </time>
                  </button>
                ))
              )}
            </div>
            <PaginationControl
              className="notification-pagination"
              total={total}
              currentPage={currentPage}
              pageSize={pageSize}
              pageSizeOptions={[10, 12, 20, 50]}
              onPageChange={(next) => {
                setCurrentPage(next);
                setSelectedId("");
              }}
              onPageSizeChange={(next) => {
                setPageSize(next);
                setCurrentPage(1);
                setSelectedId("");
              }}
              disabled={busy || loading}
              ariaLabel="站内信分页"
            />
          </section>
          <section className="notification-detail" aria-label="消息详情" aria-live="polite">
            {!selected || loading ? (
              <div className="notification-detail-empty">
                <UiIcon name="inbox" size={28} />
                <p>选择左侧消息，查看详情</p>
              </div>
            ) : (
              <>
                <span className="notification-kind">
                  <UiIcon
                    name={
                      tabs.find((item) => item.id === (selected.category || "all"))?.icon || "inbox"
                    }
                    size={12}
                  />
                  {kindLabel[selected.kind] || "站内信"}
                </span>
                <h3>{selected.title}</h3>
                <div className="notification-meta">
                  <span>发送人：{selected.sender_name}</span>
                  <time>{time(selected.created_at)}</time>
                  <span className="notification-project">
                    <ProjectMark
                      name={selected.project_name}
                      image={selected.project_image}
                      size={16}
                    />
                    项目：{selected.project_name}
                  </span>
                </div>
                <p className="notification-body">{selected.body}</p>
                <div className="notification-actions">
                  {!!selected.can_open && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          const target = await api(`/notifications/${selected.id}/open`, {});
                          onOpen(target);
                          setOpen(false);
                        })
                      }
                    >
                      <UiIcon name={selected.thread_id ? "chat" : "project"} size={13} />
                      {selected.thread_id ? "打开迭代会话" : "进入项目"}
                    </button>
                  )}
                  {!selected.can_open && selected.kind !== "member_removed" && (
                    <small>已无该项目的访问权限</small>
                  )}
                  {!selected.read_at && (
                    <button disabled={busy} onClick={() => select(selected)}>
                      <UiIcon name="check" size={13} />
                      标为已读
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </Dialog>
    </>
  );
}
