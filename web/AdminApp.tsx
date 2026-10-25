import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { api } from "./workspace-api";
import { SystemManagement } from "./SystemManagement";
import { AccountAuditList } from "./AccountAuditList";
import { AdminAccountMenu } from "./AdminAccountMenu";
import { AdminWorkManagement } from "./AdminWorkManagement";
import { AdminRoles } from "./AdminRoles";
import { ModelSettings } from "./ModelSettings";
import { OrgStructure } from "./OrgStructure";
import { OrgHome } from "./OrgHome";
import { LoginScreen } from "./LoginScreen";
import { Notifications } from "./Notifications";
import { ThemePicker } from "./ThemePicker";
import { UiIcon, type UiIconName } from "./ui-icon";
import { WorkspaceModals } from "./WorkspaceModals";
import { ADMIN_PERMISSION_TREE, MY_WORK_MENU } from "../shared/admin-permissions.js";
import { DEFAULT_UI_THEME } from "../shared/ui-theme.js";
import { applyUiTheme } from "./apply-ui-theme";
import type { LocalExecutorDevice } from "./LocalExecutorPanel";
import type { PersonalProfile } from "./ProfileFields";
import { showTip } from "./Tip";
import { useAccountSession } from "./use-account-session";
import { CoThreadLogo, PanelIcon } from "./workspace-chrome";
import { submitWorkspaceModal } from "./workspace-modal-submit";
import type { Modal, Project } from "./workspace-types";
import "./workspace.css";
import "./admin.css";

type Access = {
  user: { id: string; name: string };
  isSuperAdmin: boolean;
  permissions: string[];
  roles: { id: string; name: string }[];
};
const rolePages = ADMIN_PERMISSION_TREE.flatMap((menu) => menu.children || []);
const myPages = MY_WORK_MENU.children || [];
const pages = [...myPages, ...rolePages];
const menus = [MY_WORK_MENU, ...ADMIN_PERMISSION_TREE];
const workPages = [
  "iterations",
  "tasks",
  "my-iterations",
  "my-tasks",
  "account-changes",
  "account-logins",
];
const listPages = ["projects", "accounts", "plugins", "roles", "my-projects", "orgs"];
const readPage = () => window.location.pathname.split("/")[2] || "";

export function AdminApp() {
  const [access, setAccess] = useState<Access | null>(null);
  const [page, setPage] = useState(readPage);
  const [auditQuery, setAuditQuery] = useState(() => window.location.search);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [leftOpen, setLeftOpen] = useState(
    () => localStorage.getItem("admin-left-open") !== "false",
  );
  const [profileReady, setProfileReady] = useState(false);
  const [accountModal, setAccountModal] = useState<Modal>(null);
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [projectImage, setProjectImage] = useState<string | null>(null);
  const [health, setHealth] = useState<{ dshEnabled: boolean; mcpEndpoint?: string } | null>(null);
  const [localExecutors, setLocalExecutors] = useState<LocalExecutorDevice[]>([]);
  const [connectorsReady, setConnectorsReady] = useState(false);
  const seenAccount = useRef<string | null>(null);
  const {
    user,
    savedAccounts,
    acceptProfile,
    forgetSavedLogin,
    logoutCurrent,
    loginAnother,
    switchSavedAccount,
  } = useAccountSession();
  const loadAccess = useCallback(async () => {
    const next = await api("/admin/access");
    setAccess(next);
    return next as Access;
  }, []);
  useEffect(() => {
    void loadAccess().catch((cause) => {
      if ((cause as { status?: number }).status === 401) return;
      setError((cause as Error).message);
    });
    void api("/me")
      .then((profile: PersonalProfile) => {
        acceptProfile(profile);
        applyUiTheme(profile.ui_theme || DEFAULT_UI_THEME);
      })
      .catch((cause) => {
        if ((cause as { status?: number }).status !== 401) setError((cause as Error).message);
      })
      .finally(() => setProfileReady(true));
    const onPop = () => {
      setPage(readPage());
      setAuditQuery(window.location.search);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [acceptProfile, loadAccess]);
  useEffect(() => {
    if (!user) return;
    applyUiTheme(user.ui_theme || DEFAULT_UI_THEME);
    if (seenAccount.current && seenAccount.current !== user.id) {
      void loadAccess().catch((cause) => setError((cause as Error).message));
    }
    seenAccount.current = user.id;
  }, [loadAccess, user]);
  useEffect(() => {
    if (access && !page) {
      const first =
        rolePages.find((item) => access.permissions.includes(item.key)) ||
        myPages.find((item) => access.permissions.includes(item.key));
      if (first) {
        window.history.replaceState(null, "", `/admin/${first.key}`);
        setPage(first.key);
      }
    }
  }, [access, page]);
  const current = pages.find((item) => item.key === page);
  const menu = menus.find((item) => item.children?.some((child) => child.key === page));
  const allowed = !!current && !!access?.permissions.includes(page);
  const go = (key: string) => {
    window.history.pushState(null, "", `/admin/${key}`);
    setAuditQuery("");
    setPage(key);
  };
  const openAudit = (key: "account-changes" | "account-logins", userNumber: number) => {
    const search = `?userNumber=${userNumber}`;
    window.history.pushState(null, "", `/admin/${key}${search}`);
    setAuditQuery(search);
    setPage(key);
  };
  if (!user || !profileReady || !access || error)
    return profileReady && !user && !error ? (
      <LoginScreen
        onLogin={(profile) => {
          acceptProfile(profile);
          applyUiTheme(profile.ui_theme || DEFAULT_UI_THEME);
          void loadAccess().catch((cause) => setError((cause as Error).message));
        }}
      />
    ) : (
      <main className="admin-boot">
        <UiIcon name="shield" size={36} />
        <h1>管理空间</h1>
        <p role={error ? "alert" : "status"}>{error || "正在加载成员权限…"}</p>
        {error && <button onClick={() => window.location.reload()}>重新加载</button>}
        <a href="/">返回工作空间</a>
      </main>
    );
  const accountTitle = `${user.name} · ${access.isSuperAdmin ? "超级管理员" : access.roles.map((role) => role.name).join("、") || "成员"}`;
  const runAccount = async (task: () => Promise<void>) => {
    setAccountBusy(true);
    try {
      await task();
    } catch (cause) {
      showTip((cause as Error).message, "error");
    } finally {
      setAccountBusy(false);
    }
  };
  const refreshConnectors = async () => {
    const [devices, status] = await Promise.all([
      api("/local-executors"),
      api("/health").catch(() => null),
    ]);
    setLocalExecutors(devices);
    if (status) setHealth(status);
    setConnectorsReady(true);
  };
  const ignoreProjects: Dispatch<SetStateAction<Project[]>> = () => {};
  const ignoreProjectId: Dispatch<SetStateAction<string>> = () => {};
  return (
    <div className={`admin-shell ${leftOpen ? "" : "left-closed"}`}>
      <aside className="admin-sidebar">
        <div className="sidebar-brand">
          <CoThreadLogo className="sidebar-logo sidebar-brand-mark" title="共序 LOGO" />
          <span className="sidebar-brand-name">
            共序 <small>管理空间</small>
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
        <nav aria-label="管理空间菜单">
          {menus
            .filter(
              (item) =>
                access.permissions.includes(item.key) &&
                item.children?.some((child) => access.permissions.includes(child.key)),
            )
            .map((item) => (
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
              href="/about_us.html"
              target="_blank"
              rel="noopener noreferrer"
              title="关于我们"
              aria-label="关于我们"
            >
              <UiIcon name="info" size={20} />
            </a>
            <a
              className="sidebar-toggle workspace-help-link"
              href="/docs.html"
              target="_blank"
              rel="noopener noreferrer"
              title="使用手册"
              aria-label="使用手册"
            >
              <UiIcon name="book" size={20} />
            </a>
            <ThemePicker
              theme={user.ui_theme || DEFAULT_UI_THEME}
              api={api}
              onChange={acceptProfile}
            />
            <Notifications
              key={access.user.id}
              api={api}
              onOpen={(target) => {
                try {
                  const selection: { projectId?: string; threadId?: string } = {};
                  if (typeof target?.projectId === "string") selection.projectId = target.projectId;
                  if (typeof target?.threadId === "string" && target.threadId)
                    selection.threadId = target.threadId;
                  sessionStorage.setItem("cothread-selection", JSON.stringify(selection));
                } catch {
                  /* 选择写不进去时仍回到工作空间 */
                }
                window.location.assign("/");
              }}
            />
            <a
              className="sidebar-toggle workspace-help-link workspace-space-switch"
              href="/"
              aria-label="切换到工作空间"
              title="切换到工作空间"
            >
              <UiIcon name="transfer" size={14} />
              <span>工作空间</span>
            </a>
            <AdminAccountMenu
              user={user}
              title={accountTitle}
              busy={accountBusy}
              onOpen={(panel) => {
                if (panel === "profile") setProfileAvatar(user.avatar ?? null);
                setAccountModal(panel);
              }}
            />
          </div>
        </header>
        <main
          className={`admin-content ${workPages.includes(page) ? "admin-content-work" : ""} ${listPages.includes(page) ? "admin-content-list" : ""}`}
        >
          {allowed ? (
            <div
              className={`admin-content-card ${workPages.includes(page) ? "admin-content-work-card" : ""} ${listPages.includes(page) ? "admin-content-list-card" : ""}`}
              key={`${page}-${user.id}-${page.startsWith("account-") ? auditQuery : ""}`}
            >
              {["projects", "accounts", "plugins"].includes(page) && (
                <SystemManagement
                  section={page as "projects" | "accounts" | "plugins"}
                  api={api}
                  currentUserId={access.user.id}
                  permissions={access.permissions}
                  onOpenAudit={page === "accounts" ? openAudit : undefined}
                  onProjectsChanged={async () => {}}
                  onAccessChanged={async () => {
                    await loadAccess();
                  }}
                />
              )}
              {(page === "account-changes" || page === "account-logins") && (
                <AccountAuditList kind={page} permissions={access.permissions} />
              )}
              {(page === "iterations" || page === "tasks") && (
                <AdminWorkManagement kind={page} permissions={access.permissions} />
              )}
              {page === "my-orgs" && <OrgHome api={api} />}
              {page === "my-projects" && (
                <SystemManagement
                  section="projects"
                  api={api}
                  currentUserId={access.user.id}
                  permissions={[]}
                  listPath="/admin/my/projects"
                  notice="只显示你加入的项目，可查看详情、成员和记录。"
                  onProjectsChanged={async () => {}}
                  onAccessChanged={async () => {}}
                />
              )}
              {(page === "my-iterations" || page === "my-tasks") && (
                <AdminWorkManagement
                  kind={page === "my-iterations" ? "iterations" : "tasks"}
                  permissions={[]}
                  endpoint={page === "my-iterations" ? "/admin/my/iterations" : "/admin/my/tasks"}
                  notice={
                    page === "my-iterations"
                      ? "只显示你加入的项目中的迭代。"
                      : "只显示你加入的项目中，由你创建、指派给你、你承接或你确认的任务。"
                  }
                />
              )}
              {page === "roles" && (
                <AdminRoles
                  permissions={access.permissions}
                  onAccessChanged={async () => {
                    await loadAccess();
                  }}
                />
              )}
              {page === "model-settings" && (
                <ModelSettings api={api} permissions={access.permissions} />
              )}
              {page === "orgs" && <OrgStructure api={api} permissions={access.permissions} />}
            </div>
          ) : (
            <section className="admin-denied">
              <UiIcon name="lock" size={36} />
              <h2>
                {access.permissions.some((key) => pages.some((item) => item.key === key))
                  ? "没有此页面的访问权限"
                  : "尚未获得管理空间权限"}
              </h2>
              <p>请联系超级管理员为你的成员账号分配管理角色。</p>
              <a href="/">返回工作空间</a>
            </section>
          )}
        </main>
      </div>
      <WorkspaceModals
        modal={accountModal}
        setModal={setAccountModal}
        open={(value) => {
          if (value === "profile") setProfileAvatar(user.avatar ?? null);
          if (value === "mcp")
            void refreshConnectors().catch((cause) => showTip((cause as Error).message, "error"));
          setAccountModal(value);
        }}
        busy={accountBusy}
        submitModal={(event) =>
          submitWorkspaceModal(
            {
              modal: accountModal,
              run: runAccount,
              refresh: async () => {},
              profileAvatar,
              projectImage,
              threadId: "",
              acceptProfile,
              setProjects: ignoreProjects,
              setProjectId: ignoreProjectId,
              setModal: setAccountModal,
            },
            event,
          )
        }
        error=""
        projectId=""
        refreshConnectors={refreshConnectors}
        user={user}
        acceptProfile={acceptProfile}
        profileAvatar={profileAvatar}
        setProfileAvatar={setProfileAvatar}
        savedAccounts={savedAccounts}
        projectImage={projectImage}
        setProjectImage={setProjectImage}
        health={health}
        localExecutors={localExecutors}
        connectorsReady={connectorsReady}
        run={runAccount}
        switchSavedAccount={switchSavedAccount}
        logoutCurrent={logoutCurrent}
        forgetSavedLogin={forgetSavedLogin}
        loginAnother={loginAnother}
        settingsSpaceLabel="管理空间"
      />
    </div>
  );
}
