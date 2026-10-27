import { DialogFooter } from "./DialogFooter";
import { DialogHeader } from "./DialogHeader";
/**
 * 工作台弹窗：创建项目、在沙箱中执行，以及个人设置各分区。
 * 数据与回调由父组件打包成 props 传入；只在这个弹窗里用到的懒加载组件也放在这里。
 */
/**
 * 工作台弹窗：创建项目、在沙箱中执行，以及个人设置各分区。
 * 数据与回调由父组件打包成 props 传入；只在这个弹窗里用到的懒加载组件也放在这里。
 */
import { lazy, Suspense, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { ModalBackdrop } from "./dialog-fx";
import { TextField } from "./TextField";
import { TextAreaField } from "./TextAreaField";
import { type SavedAccount } from "./saved-accounts";
import { UiIcon, type UiIconName } from "./ui-icon";
import { api } from "./workspace-api";
import type { Modal } from "./workspace-types";
import type { LocalExecutorDevice } from "./LocalExecutorPanel";
import type { PersonalProfile } from "./ProfileFields";

const EmailBinding = lazy(() =>
  import("./EmailBinding").then((module) => ({ default: module.EmailBinding })),
);
const McpSettings = lazy(() =>
  import("./McpSettings").then((module) => ({ default: module.McpSettings })),
);
const EnvironmentVariables = lazy(() =>
  import("./EnvironmentVariables").then((module) => ({ default: module.EnvironmentVariables })),
);
const PasswordField = lazy(() =>
  import("./PasswordField").then((module) => ({ default: module.PasswordField })),
);
const ProfileFields = lazy(() =>
  import("./ProfileFields").then((module) => ({ default: module.ProfileFields })),
);
const ProjectImageField = lazy(() =>
  import("./ProjectSettings").then((module) => ({ default: module.ProjectImageField })),
);
const AccountSwitchList = lazy(() =>
  import("./AccountSwitchList").then((module) => ({ default: module.AccountSwitchList })),
);

export type WorkspaceModalsProps = {
  modal: Modal;
  setModal: Dispatch<SetStateAction<Modal>>;
  open: (value: Modal) => void;
  busy: boolean;
  submitModal: (event: FormEvent<HTMLFormElement>) => void;
  error: string;
  projectId: string;
  refreshConnectors: () => Promise<void>;
  /** 父组件在渲染弹窗前已用 early return 排除了未登录状态。 */
  user: PersonalProfile;
  acceptProfile: (profile: PersonalProfile | null) => void;
  profileAvatar: string | null;
  setProfileAvatar: Dispatch<SetStateAction<string | null>>;
  savedAccounts: SavedAccount[];
  projectImage: string | null;
  setProjectImage: Dispatch<SetStateAction<string | null>>;
  health: { dshEnabled: boolean; mcpEndpoint?: string } | null;
  localExecutors: LocalExecutorDevice[];
  connectorsReady: boolean;
  run: (task: () => Promise<void>) => Promise<void>;
  switchSavedAccount: (account: SavedAccount) => Promise<void>;
  logoutCurrent: () => Promise<void>;
  forgetSavedLogin: (userId: string) => Promise<void>;
  loginAnother: () => Promise<void>;
  /** 个人设置标题旁的空间名。工作空间默认，管理空间传入自己的名称。 */
  settingsSpaceLabel?: string;
};

export function WorkspaceModals({
  modal,
  setModal,
  open,
  error,
  projectId,
  refreshConnectors,
  busy,
  submitModal,
  user,
  acceptProfile,
  profileAvatar,
  setProfileAvatar,
  savedAccounts,
  projectImage,
  setProjectImage,
  health,
  localExecutors,
  connectorsReady,
  run,
  switchSavedAccount,
  logoutCurrent,
  forgetSavedLogin,
  loginAnother,
  settingsSpaceLabel = "工作空间",
}: WorkspaceModalsProps) {
  return (
    <>
      {modal && (
        <ModalBackdrop onClose={() => setModal(null)} enabled={!busy}>
          {(close) => (
            <section
              className={`modal ${["profile", "settings", "password", "email", "mcp", "env"].includes(modal) ? "workspace-settings space-dialog" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-title"
            >
              <DialogHeader
                title={
                  <>
                    {
                      {
                        project: "创建项目",
                        profile: "个人设置",
                        settings: "个人设置",
                        password: "个人设置",
                        email: "个人设置",
                        mcp: "个人设置",
                        env: "个人设置",
                        run: "在沙箱中执行",
                      }[modal]
                    }
                  </>
                }
                titleId="modal-title"
                subtitle={
                  <>
                    {["profile", "settings", "password", "email", "mcp", "env"].includes(modal) && (
                      <span>{settingsSpaceLabel}</span>
                    )}
                  </>
                }
                onClose={close}
                disabled={busy}
                closeLabel="关闭"
              />
              <div
                className={
                  ["profile", "settings", "password", "email", "mcp", "env"].includes(modal)
                    ? "settings-layout space-dialog-body"
                    : "dialog-plain-body"
                }
              >
                {["profile", "settings", "password", "email", "mcp", "env"].includes(modal) && (
                  <nav className="settings-nav space-dialog-nav" aria-label="个人设置">
                    {(
                      [
                        ["profile", "个人资料", "human"],
                        ["password", "修改密码", "lock"],
                        ["mcp", "MCP 配置", "key"],
                        ["env", "环境变量", "key"],
                        ["settings", "退出/切换", "logout"],
                      ] as const
                    ).map(([value, label, icon]) => (
                      <button
                        key={value}
                        type="button"
                        aria-current={modal === value ? "page" : undefined}
                        disabled={busy}
                        onClick={() => open(value as Modal)}
                      >
                        <span className="ui-icon-text">
                          <UiIcon name={icon as UiIconName} size={14} />
                          {label}
                        </span>
                      </button>
                    ))}
                  </nav>
                )}
                <form
                  key={modal}
                  className={
                    ["profile", "settings", "password", "email", "mcp", "env"].includes(modal)
                      ? "space-dialog-content"
                      : undefined
                  }
                  onSubmit={submitModal}
                >
                  <div className="dialog-form-scroll">
                    {["profile", "settings", "password", "email", "mcp", "env"].includes(modal) && (
                      <div className="settings-content-heading">
                        <p>
                          {modal === "settings"
                            ? "这台浏览器可以记住多个账号。切换只点右侧按钮；退出并清除账号会清掉这台设备上的登录信息。"
                            : modal === "mcp"
                              ? "跨 Windows、macOS 和 Linux 使用共序 MCP，并管理本账号的本地执行器。"
                              : modal === "env"
                                ? "这里只能填写共序已经定义的个人环境变量，不能新增或删除字段。值只属于当前登录账号，模型不能直接读取。"
                                : "管理你的通用账号"}
                        </p>
                      </div>
                    )}
                    {modal === "profile" && (
                      <Suspense fallback={<p className="muted">正在加载个人资料…</p>}>
                        <ProfileFields
                          user={user}
                          avatar={profileAvatar}
                          busy={busy}
                          api={api}
                          onProfile={(profile) => {
                            acceptProfile(profile);
                          }}
                          onUpload={(file) =>
                            void run(async () => {
                              const { prepareAvatar } = await import("./ProfileFields");
                              setProfileAvatar(await prepareAvatar(file));
                            })
                          }
                          onRemove={() => setProfileAvatar(null)}
                        />
                      </Suspense>
                    )}
                    {modal === "settings" && (
                      <div className="settings-logout-panel">
                        <Suspense fallback={<p className="muted">正在加载账号…</p>}>
                          <AccountSwitchList
                            accounts={savedAccounts}
                            currentId={user.id}
                            busy={busy}
                            onSwitch={(account) => void run(() => switchSavedAccount(account))}
                            onLogout={() => void run(logoutCurrent)}
                            onClear={(account) => void run(() => forgetSavedLogin(account.id))}
                          />
                        </Suspense>
                        <button
                          type="button"
                          className="account-login-another"
                          disabled={busy}
                          onClick={() => void run(loginAnother)}
                        >
                          <UiIcon name="login" size={13} />
                          登录其他账号
                        </button>
                      </div>
                    )}
                    {modal === "project" && (
                      <>
                        <Suspense fallback={<p className="muted">正在加载项目图片…</p>}>
                          <ProjectImageField
                            image={projectImage}
                            busy={busy}
                            onChange={setProjectImage}
                          />
                        </Suspense>
                        <TextField
                          label="项目名称"
                          name="name"
                          maxLength={120}
                          autoFocus
                          required
                          placeholder="例如：共序产品研发"
                        />
                        <TextAreaField
                          label="项目简介"
                          name="description"
                          maxLength={4000}
                          placeholder="这个项目要达成什么目标？"
                        />
                      </>
                    )}
                    {modal === "password" && (
                      <>
                        <div className="settings-identity">
                          <strong>{user.name}</strong>
                          <small>
                            用户名：{user.username}
                            {user.email ? ` · ${user.email}` : " · 未绑定邮箱"}
                          </small>
                        </div>
                        <TextField
                          label="当前密码"
                          name="currentPassword"
                          type="password"
                          required
                          autoComplete="current-password"
                        />
                        <Suspense fallback={<p className="muted">正在加载密码设置…</p>}>
                          <PasswordField label="新设密码" autoComplete="new-password" required />
                        </Suspense>
                        <p className="muted">修改后，其他登录会话和 AI 令牌会失效。</p>
                      </>
                    )}
                    {modal === "email" && (
                      <Suspense fallback={<p className="muted">正在加载…</p>}>
                        <EmailBinding
                          email={user.email}
                          api={api}
                          onBound={(profile) => {
                            acceptProfile(profile);
                          }}
                        />
                      </Suspense>
                    )}
                    {modal === "env" && (
                      <Suspense fallback={<p className="muted">正在加载环境变量…</p>}>
                        <EnvironmentVariables
                          api={api}
                          basePath="/me/environment-variables"
                          empty="当前没有可填写的个人环境变量。"
                        />
                      </Suspense>
                    )}
                    {modal === "mcp" && (
                      <Suspense fallback={<p className="muted">正在加载…</p>}>
                        <McpSettings
                          api={api}
                          endpoint={health?.mcpEndpoint || "/mcp"}
                          localExecutors={localExecutors}
                          connectorsReady={connectorsReady}
                          projectId={projectId}
                          onConnectorsChanged={refreshConnectors}
                        />
                      </Suspense>
                    )}
                    {modal === "run" && (
                      <>
                        <p>
                          使用临时沙箱执行。当前讨论和最近 40
                          个文档版本会复制到沙箱，需要保留的成果请保存到文档库。
                        </p>
                        <TextAreaField
                          label="命令"
                          name="command"
                          required
                          maxLength={8000}
                          defaultValue="pwd && ls -la"
                        />
                        <p className="muted">
                          context.json 保存讨论，manifest.json
                          保存文档目录。运行结果将保留在当前迭代。
                        </p>
                      </>
                    )}
                  </div>
                  {(modal === "profile" ||
                    modal === "password" ||
                    modal === "project" ||
                    modal === "run") && (
                    <DialogFooter>
                      {!["profile", "password"].includes(modal) && (
                        <button type="button" disabled={busy} onClick={close}>
                          <UiIcon name="close" size={13} />
                          关闭
                        </button>
                      )}
                      <button className="primary" disabled={busy}>
                        <UiIcon name={busy ? "running" : "save"} size={13} />
                        {busy ? "正在处理…" : modal === "profile" ? "保存资料" : "确认"}
                      </button>
                    </DialogFooter>
                  )}
                </form>
              </div>
            </section>
          )}
        </ModalBackdrop>
      )}
    </>
  );
}
