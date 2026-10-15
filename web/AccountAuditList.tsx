import { useEffect, useState } from "react";
import { api } from "./workspace-api";
import { UiIcon } from "./ui-icon";
import { PaginationControl } from "./PaginationControl";
import { actionNames, changeSummary } from "./change-log";

type Kind = "account-changes" | "account-logins";
type ChangeItem = {
  id: string;
  user_number: number;
  user_name: string;
  username: string;
  action: string;
  details: unknown;
  actor: string;
  created_at: string;
};
type LoginItem = {
  id: string;
  user_number: number | null;
  user_name: string | null;
  username: string | null;
  identifier: string;
  ip: string;
  country: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  success: boolean;
  failure_reason: string | null;
  created_at: string;
};
type AuditList = {
  items: ChangeItem[] | LoginItem[];
  total: number;
  page: number;
  pageSize: number;
  canViewAll: boolean;
};

const dateTime = (value: string) =>
  new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z").toLocaleString("zh-CN");
const initialUserNumber = () =>
  (new URLSearchParams(window.location.search).get("userNumber") || "").replace(/\D/g, "").slice(0, 10);

export function AccountAuditList({
  kind,
  permissions,
}: {
  kind: Kind;
  permissions: string[];
}) {
  const changes = kind === "account-changes";
  const [userNumber, setUserNumber] = useState(initialUserNumber);
  const [query, setQuery] = useState(initialUserNumber);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [data, setData] = useState<AuditList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const restricted = data ? !data.canViewAll : !permissions.includes(`${kind}.view-all`);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (query) params.set("userNumber", query);
    setLoading(true);
    setError("");
    api(`/admin/${kind}?${params}`, undefined, undefined, controller.signal)
      .then(setData)
      .catch((reason) => {
        if (!controller.signal.aborted) setError((reason as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, query, page, pageSize]);
  const apply = (value: string) => {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("userNumber", value);
    else url.searchParams.delete("userNumber");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    setPage(1);
    setQuery(value);
  };
  const items = data?.items || [];
  return (
    <section className="admin-work">
      {restricted && (
        <p className="admin-list-note">仅显示当前登录账号的记录。查看其他成员需要「查看全部」权限。</p>
      )}
      <form
        className="admin-filters"
        onSubmit={(event) => {
          event.preventDefault();
          apply(userNumber);
        }}
      >
        <label className="admin-search">
          <UiIcon name="search" size={14} />
          <input
            aria-label="用户 ID"
            inputMode="numeric"
            placeholder="用户 ID"
            value={userNumber}
            onChange={(event) => setUserNumber(event.target.value.replace(/\D/g, "").slice(0, 10))}
          />
        </label>
        <button type="submit">查询</button>
        <button
          type="button"
          onClick={() => {
            setUserNumber("");
            apply("");
          }}
        >
          重置
        </button>
      </form>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="admin-table-wrap" aria-busy={loading}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>用户 ID</th>
              <th>成员</th>
              {changes ? (
                <>
                  <th>操作</th>
                  <th>操作人</th>
                </>
              ) : (
                <>
                  <th>结果</th>
                  <th>IP / 归属地</th>
                </>
              )}
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {!loading &&
              items.map((item) => {
                const login = item as LoginItem;
                const change = item as ChangeItem;
                const summary = changes ? changeSummary(change) : "";
                return (
                  <tr key={item.id}>
                    <td>{item.user_number ?? "—"}</td>
                    <td>
                      <span className="admin-nowrap">{item.user_name || login.identifier || "未匹配账号"}</span>
                      <small>{item.username || (item.user_name ? "" : "未匹配账号")}</small>
                    </td>
                    {changes ? (
                      <>
                        <td>
                          {actionNames[change.action] || change.action}
                          {summary && <small>{summary}</small>}
                        </td>
                        <td>{change.actor}</td>
                      </>
                    ) : (
                      <>
                        <td>
                          {login.success ? "成功" : "失败"}
                          {login.failure_reason && <small>{login.failure_reason}</small>}
                        </td>
                        <td>
                          {login.ip}
                          <small>
                            {[login.country, login.province, login.city, login.district]
                              .filter(Boolean)
                              .join(" - ") || "归属地未知"}
                          </small>
                        </td>
                      </>
                    )}
                    <td>{dateTime(item.created_at)}</td>
                  </tr>
                );
              })}
            {(loading || !items.length) && (
              <tr>
                <td colSpan={5} className="admin-empty" role={loading ? "status" : undefined}>
                  {loading
                    ? "正在加载…"
                    : query
                      ? `没有符合用户 ID ${query} 的${changes ? "变更记录" : "登录记录"}`
                      : `暂无${changes ? "变更记录" : "登录记录"}`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="admin-pagination">
        <PaginationControl
          total={data?.total ?? 0}
          currentPage={page}
          pageSize={data?.pageSize ?? pageSize}
          pageSizeOptions={[10, 20, 30, 50, 100]}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          disabled={loading}
          ariaLabel={changes ? "变更记录分页" : "登录记录分页"}
        />
      </div>
    </section>
  );
}
