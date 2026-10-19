import { useEffect, useState } from "react";
import { api } from "./workspace-api";
import { UiIcon } from "./ui-icon";
import { showTip } from "./Tip";
import { AdminDialog } from "./AdminDialog";
import { PaginationControl } from "./PaginationControl";
import { ProjectMark } from "./ProjectMark";

const labels: Record<string, string> = {
  active: "进行中",
  archived: "已归档",
  draft: "草稿",
  awaiting_acceptance: "待确认",
  queued: "排队中",
  assigned: "已分配",
  running: "执行中",
  waiting: "等待中",
  blocked: "已阻塞",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
  superseded: "已替代",
  rejected: "已拒绝",
};
type WorkItem = {
  id: string;
  title: string;
  status: string;
  project_id: string;
  project_name: string;
  project_image?: string | null;
  project_archived_at: string | null;
  creator?: string;
  task_count?: number;
  goal?: string;
  progress?: string;
  result_summary?: string;
  iteration_title?: string;
  assignee?: string;
  created_at: string;
  updated_at?: string;
};
type WorkList = {
  items: WorkItem[];
  total: number;
  pageSize: number;
  projects: { id: string; name: string }[];
};
const dateTime = (value: string) =>
  new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z").toLocaleString("zh-CN");

export function AdminWorkManagement({
  kind,
  permissions,
  endpoint,
  notice,
}: {
  kind: "iterations" | "tasks";
  permissions: string[];
  endpoint?: string;
  notice?: string;
}) {
  const [data, setData] = useState<WorkList | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<WorkItem | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailEventsPage, setDetailEventsPage] = useState(1);
  const [detailUpdatesPage, setDetailUpdatesPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(10);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!data) return;
    setPage((current) => Math.min(current, Math.max(1, Math.ceil(data.total / pageSize))));
  }, [data, pageSize]);
  useEffect(() => {
    setDetailEventsPage(1);
    setDetailUpdatesPage(1);
  }, [detail?.id]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      search: query,
      status,
      page: String(page),
      pageSize: String(pageSize),
      ...(projectId ? { projectId } : {}),
    });
    setLoading(true);
    setError("");
    api(`${endpoint || `/admin/${kind}`}?${params}`, undefined, undefined, controller.signal)
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, endpoint, query, status, projectId, page, pageSize, revision]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
      showTip((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const states =
    kind === "iterations"
      ? ["active", "archived"]
      : Object.keys(labels).filter((key) => !["active", "archived"].includes(key));
  return (
    <section className="admin-work">
      {notice && <p className="admin-list-note">{notice}</p>}
      <form
        className="admin-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setQuery(search);
        }}
      >
        <label className="admin-search">
          <UiIcon name="search" size={16} />
          <input
            aria-label="搜索名称或项目"
            placeholder="搜索名称或项目，按回车查询"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          aria-label="所属项目"
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            setPage(1);
          }}
        >
          <option value="">全部项目</option>
          {data?.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <select
          aria-label="工作状态"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">全部状态</option>
          {states.map((key) => (
            <option key={key} value={key}>
              {labels[key]}
            </option>
          ))}
        </select>
        <button type="submit">查询</button>
        <button type="button" onClick={() => setRevision(revision + 1)} disabled={loading}>
          <UiIcon name="refresh" size={14} />
          刷新
        </button>
      </form>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {draft && (
        <AdminDialog
          title={kind === "iterations" ? "修改迭代名称" : "修改任务资料"}
          onClose={() => setDraft(null)}
          busy={busy}
        >
          {(close) => (
            <form
              className="admin-editor"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await api(
                    `/admin/${kind}/${draft.id}`,
                    { title: draft.title, ...(kind === "tasks" ? { goal: draft.goal } : {}) },
                    "PATCH",
                  );
                  setDraft(null);
                  setRevision(revision + 1);
                  showTip("资料已保存");
                });
              }}
            >
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <label>
                名称
                <input
                  autoFocus
                  required
                  maxLength={kind === "iterations" ? 160 : 240}
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                />
              </label>
              {kind === "tasks" && (
                <label>
                  任务目标
                  <textarea
                    required
                    maxLength={20000}
                    value={draft.goal || ""}
                    onChange={(event) => setDraft({ ...draft, goal: event.target.value })}
                  />
                </label>
              )}
              <div className="admin-editor-actions">
                <button type="button" disabled={busy} onClick={close}>
                  取消
                </button>
                <button className="primary" disabled={busy}>
                  保存
                </button>
              </div>
            </form>
          )}
        </AdminDialog>
      )}
      <div className="admin-table-wrap" aria-busy={loading}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>{kind === "iterations" ? "迭代" : "任务"}名称</th>
              <th>所属项目</th>
              <th>{kind === "iterations" ? "创建人 / 任务数" : "所属迭代 / 承接人"}</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {!loading &&
              data?.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong title={item.title}>{item.title}</strong>
                    {item.progress && <small>{item.progress}</small>}
                  </td>
                  <td>
                    <span className="admin-project-person">
                      <ProjectMark name={item.project_name} image={item.project_image} size={18} />
                      <span>{item.project_name}</span>
                    </span>
                    {item.project_archived_at && <small>项目已结项</small>}
                  </td>
                  <td>
                    {kind === "iterations" ? (
                      <>
                        {item.creator}
                        <small>{item.task_count} 个任务</small>
                      </>
                    ) : (
                      <>
                        {item.iteration_title || "未关联迭代"}
                        <small>{item.assignee || "尚未承接"}</small>
                      </>
                    )}
                  </td>
                  <td>
                    <span
                      className={`status-badge ${["archived", "failed", "cancelled", "blocked"].includes(item.status) ? "inactive" : ""}`}
                    >
                      {labels[item.status] || item.status}
                    </span>
                  </td>
                  <td className="admin-date">{dateTime(item.created_at)}</td>
                  <td>
                    <div className="admin-table-actions">
                      {kind === "tasks" && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(async () =>
                              setDetail(await api(`${endpoint || "/admin/tasks"}/${item.id}`)),
                            )
                          }
                        >
                          详情
                        </button>
                      )}
                      {kind === "iterations" && permissions.includes("iterations.update") && (
                        <button
                          disabled={
                            busy ||
                            !!item.project_archived_at ||
                            (kind === "iterations"
                              ? item.status !== "active"
                              : !["draft", "awaiting_acceptance"].includes(item.status))
                          }
                          onClick={() => setDraft({ ...item })}
                        >
                          编辑
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {loading ? (
          <p className="admin-empty" role="status">
            正在加载…
          </p>
        ) : (
          !data?.items.length && (
            <p className="admin-empty">
              没有符合筛选条件的{kind === "iterations" ? "迭代" : "任务"}
            </p>
          )
        )}
      </div>
      <footer className="admin-pagination">
        <PaginationControl
          total={data?.total ?? 0}
          currentPage={page}
          pageSize={data?.pageSize ?? pageSize}
          pageSizeOptions={[10, 20, 30, 50, 100]}
          onPageChange={setPage}
          onPageSizeChange={(next) => {
            setPageSize(next);
            setPage(1);
          }}
          disabled={loading}
          ariaLabel={kind === "iterations" ? "迭代列表分页" : "任务列表分页"}
        />
      </footer>

      {detail && (
        <AdminDialog title={`${detail.title} · 任务详情`} onClose={() => setDetail(null)}>
          <p className="admin-list-note">
            <ProjectMark name={detail.project_name} image={detail.project_image} size={16} />
            {detail.project_name} · {detail.iteration_title || "未关联迭代"} ·{" "}
            {labels[detail.status] || detail.status}
          </p>
          <h4>任务目标</h4>
          <p className="admin-prewrap">{detail.goal}</p>
          {detail.constraints && (
            <>
              <h4>约束</h4>
              <p className="admin-prewrap">{detail.constraints}</p>
            </>
          )}
          {detail.result_summary && (
            <>
              <h4>结果</h4>
              <p className="admin-prewrap">{detail.result_summary}</p>
            </>
          )}
          <h4>状态记录</h4>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>状态变更</th>
                  <th>说明</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {detail.events
                  .slice((detailEventsPage - 1) * detailPageSize, detailEventsPage * detailPageSize)
                  .map((event: any) => (
                    <tr key={event.id}>
                      <td>
                        {labels[event.from_status] || event.from_status} →{" "}
                        {labels[event.to_status] || event.to_status}
                      </td>
                      <td>{event.reason || event.note || "—"}</td>
                      <td>{dateTime(event.created_at)}</td>
                    </tr>
                  ))}
                {!detail.events.length && (
                  <tr>
                    <td colSpan={3} className="admin-empty">
                      暂无状态记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {detail.events.length > 0 && (
            <PaginationControl
              total={detail.events.length}
              currentPage={detailEventsPage}
              pageSize={detailPageSize}
              pageSizeOptions={[10, 20, 50]}
              onPageChange={setDetailEventsPage}
              onPageSizeChange={(size) => {
                setDetailPageSize(size);
                setDetailEventsPage(1);
                setDetailUpdatesPage(1);
              }}
              ariaLabel="任务状态记录分页"
            />
          )}
          <h4>进度记录</h4>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>进度</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {detail.updates
                  .slice(
                    (detailUpdatesPage - 1) * detailPageSize,
                    detailUpdatesPage * detailPageSize,
                  )
                  .map((update: any) => (
                    <tr key={update.id}>
                      <td>{update.body || update.content || update.summary || update.kind}</td>
                      <td>{dateTime(update.created_at)}</td>
                    </tr>
                  ))}
                {!detail.updates.length && (
                  <tr>
                    <td colSpan={2} className="admin-empty">
                      暂无进度记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {detail.updates.length > 0 && (
            <PaginationControl
              total={detail.updates.length}
              currentPage={detailUpdatesPage}
              pageSize={detailPageSize}
              pageSizeOptions={[10, 20, 50]}
              onPageChange={setDetailUpdatesPage}
              onPageSizeChange={(size) => {
                setDetailPageSize(size);
                setDetailEventsPage(1);
                setDetailUpdatesPage(1);
              }}
              ariaLabel="任务进度记录分页"
            />
          )}
        </AdminDialog>
      )}
    </section>
  );
}
