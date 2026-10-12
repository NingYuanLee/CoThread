import { useCallback, useEffect, useState } from "react";
import { api } from "./workspace-api";
import { SystemManagement } from "./SystemManagement";
import { AdminWorkManagement } from "./AdminWorkManagement";
import { AdminRoles } from "./AdminRoles";
import { UiIcon, type UiIconName } from "./ui-icon";
import { ADMIN_PERMISSION_TREE } from "../shared/admin-permissions.js";
import { applyUiTheme } from "./apply-ui-theme";
import { CoThreadLogo, PanelIcon } from "./workspace-chrome";
import "./admin.css";

type Access = {
  user: { id: string; name: string };
  isSuperAdmin: boolean;
  permissions: string[];
  roles: { id: string; name: string }[];
};
const pages = ADMIN_PERMISSION_TREE.flatMap((menu) => menu.children || []);
const readPage = () => window.location.pathname.split("/")[2] || "";

export function AdminApp() {
  const [access, setAccess] = useState<Access | null>(null);
  const [page, setPage] = useState(readPage);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [leftOpen, setLeftOpen] = useState(
    () => localStorage.getItem("admin-left-open") !== "false",
  );
  const [refresh, setRefresh] = useState(0);
  const loadAccess = useCallback(async () => {
    const next = await api("/admin/access");
    setAccess(next);
    return next as Access;
  }, []);
  useEffect(() => {
    void loadAccess().catch((e) => setError(e.message));
    void api("/me")
      .then((user) => applyUiTheme(user.ui_theme))
      .catch(() => {});
    const onPop = () => setPage(readPage());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [loadAccess]);
  useEffect(() => {
    if (access && !page) {
      const first = pages.find((item) => access.permissions.includes(item.key));
      if (first) {
        window.history.replaceState(null, "", `/admin/${first.key}`);
        setPage(first.key);
      }
    }
  }, [access, page]);
  const current = pages.find((item) => item.key === page);
  const menu = ADMIN_PERMISSION_TREE.find((item) =>
    item.children?.some((child) => child.key === page),
  );
  const allowed = !!current && !!access?.permissions.includes(page);
  const go = (key: string) => {
    window.history.pushState(null, "", `/admin/${key}`);
    setPage(key);
  };
  if (error || !access)
    return (
      <main className="admin-boot">
        <UiIcon name="shield" size={36} />
        <h1>共序管理平台</h1>
        <p role={error ? "alert" : "status"}>{error || "正在加载成员权限…"}</p>
        {error && <button onClick={() => window.location.reload()}>重新加载</button>}
        <a href="/">返回工作空间</a>
      </main>
    );
  return (
    <div className={`admin-shell ${leftOpen ? "" : "left-closed"}`}>
      <aside className="admin-sidebar">
        <div className="sidebar-brand">
          <CoThreadLogo className="sidebar-logo sidebar-brand-mark" title="共序 LOGO" />
          <span className="sidebar-brand-name">
            共序 <small>CoThread</small>
          </span>
          <button
            className={`sidebar-toggle ${leftOpen ? "sidebar-collapse-toggle" : "sidebar-brand-toggle"}`}
            aria-label={leftOpen ? "收起左侧栏" : "展开左侧栏"}
            title={leftOpen ? "收起左侧栏" : "展开左侧栏"}
            aria-expanded={leftOpen}
            onClick={() => {
              localStorage.setItem("admin-left-open", String(!leftOpen));
              setLeftOpen(!leftOpen);
            }}
          >
            <CoThreadLogo className="sidebar-logo sidebar-rail-logo" />
            <span className={leftOpen ? "sidebar-collapse-control" : "sidebar-brand-control"}>
              <PanelIcon side="left" />
            </span>
          </button>
        </div>
        <nav aria-label="管理平台菜单">
          {ADMIN_PERMISSION_TREE.filter(
            (item) =>
              access.permissions.includes(item.key) &&
              item.children?.some((child) => access.permissions.includes(child.key)),
          ).map((item) => (
            <div className="admin-nav-group" key={item.key}>
              <button
                className="admin-nav-heading"
                aria-expanded={!collapsed.includes(item.key)}
                onClick={() =>
                  setCollapsed(
                    collapsed.includes(item.key)
                      ? collapsed.filter((key) => key !== item.key)
                      : [...collapsed, item.key],
                  )
                }
              >
                <UiIcon name={item.icon as UiIconName} size={17} />
                <span>{item.label}</span>
                <UiIcon
                  name={collapsed.includes(item.key) ? "chevronUp" : "chevronDown"}
                  size={12}
                />
              </button>
              {(!leftOpen || !collapsed.includes(item.key)) &&
                item.children
                  ?.filter((child) => access.permissions.includes(child.key))
                  .map((child) => (
                    <a
                      key={child.key}
                      href={`/admin/${child.key}`}
                      aria-current={page === child.key ? "page" : undefined}
                      title={child.label}
                      aria-label={child.label}
                      onClick={(event) => {
                        event.preventDefault();
                        go(child.key);
                      }}
                    >
                      <UiIcon name={child.icon as UiIconName} size={16} />
                      <span>{child.label}</span>
                    </a>
                  ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="admin-main">
        <header className="workspace-topbar admin-topbar">
          <div className="admin-breadcrumb">
            {menu?.label || "访问权限"}{" "}
            {current && (
              <>
                <span>/</span>
                <strong>{current.label}</strong>
              </>
            )}
          </div>
          <div className="admin-topbar-actions">
            <a
              className="sidebar-toggle workspace-help-link"
              href="/"
              aria-label="返回工作空间"
              title="返回工作空间"
            >
              <UiIcon name="layout" size={18} />
            </a>
            <button
              className="sidebar-toggle"
              aria-label="刷新权限与列表"
              title="刷新权限与列表"
              onClick={() => {
                void loadAccess()
                  .then(() => setRefresh((value) => value + 1))
                  .catch((e) => setError(e.message));
              }}
            >
              <UiIcon name="refresh" size={18} />
            </button>
            <span
              className="sidebar-toggle admin-account-icon"
              aria-label={access.user.name}
              title={`${access.user.name} · ${access.isSuperAdmin ? "超级管理员" : access.roles.map((role) => role.name).join("、") || "成员"}`}
            >
              <UiIcon name="members" size={18} />
            </span>
          </div>
        </header>
        <main className={`admin-content ${["iterations", "tasks"].includes(page) ? "admin-content-work" : ""} ${["projects", "accounts", "plugins", "roles"].includes(page) ? "admin-content-list" : ""}`}>
          {allowed ? (
            <div className={`admin-content-card ${["iterations", "tasks"].includes(page) ? "admin-content-work-card" : ""} ${["projects", "accounts", "plugins", "roles"].includes(page) ? "admin-content-list-card" : ""}`} key={`${page}-${refresh}`}>
              {["projects", "accounts", "plugins"].includes(page) && (
                <SystemManagement
                  section={page as "projects" | "accounts" | "plugins"}
                  api={api}
                  currentUserId={access.user.id}
                  permissions={access.permissions}
                  onProjectsChanged={async () => {}}
                  onAccessChanged={async () => {
                    await loadAccess();
                  }}
                />
              )}
              {(page === "iterations" || page === "tasks") && (
                <AdminWorkManagement kind={page} permissions={access.permissions} />
              )}
              {page === "roles" && (
                <AdminRoles
                  permissions={access.permissions}
                  onAccessChanged={async () => {
                    await loadAccess();
                  }}
                />
              )}
            </div>
          ) : (
            <section className="admin-denied">
              <UiIcon name="lock" size={36} />
              <h2>
                {access.permissions.some((key) => pages.some((item) => item.key === key))
                  ? "没有此页面的访问权限"
                  : "尚未获得管理平台权限"}
              </h2>
              <p>请联系超级管理员为你的成员账号分配管理角色。</p>
              <a href="/">返回工作空间</a>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
