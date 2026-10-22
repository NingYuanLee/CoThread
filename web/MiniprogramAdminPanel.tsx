import { RefreshButton } from "./IconButton";
/**
 * 小程序工作区的 Admin 预览页：本地预览服务、设备框与生产地址。
 */
import { type Dispatch, type RefObject, type SetStateAction } from "react";
import { MiniProgramDeviceShell } from "./MiniProgramDeviceShell";
import {
  CloudBaseTag,
  WorkspaceDialog,
  type AdminDeviceMode,
  type AdminServer,
  type MiniProgramTabId,
} from "./miniprogram-internals";
import { UiIcon } from "./ui-icon";

export type MiniprogramAdminPanelProps = {
  tab: MiniProgramTabId;
  setTab: Dispatch<SetStateAction<MiniProgramTabId>>;
  writable: boolean;
  adminPreviewRunning: boolean;
  activeAdminServer: AdminServer | undefined;
  adminStatusLabel: string;
  adminStatusTone: string;
  adminFrameRef: RefObject<HTMLIFrameElement | null>;
  adminFrameKey: number;
  setAdminFrameKey: Dispatch<SetStateAction<number>>;
  adminDialogOpen: boolean;
  setAdminDialogOpen: Dispatch<SetStateAction<boolean>>;
  adminDeviceMode: AdminDeviceMode;
  setAdminDeviceMode: Dispatch<SetStateAction<AdminDeviceMode>>;
  adminDeviceId: string;
  setAdminDeviceId: Dispatch<SetStateAction<string>>;
  adminZoomMode: string;
  setAdminZoomMode: Dispatch<SetStateAction<string>>;
  adminError: string;
  setAdminError: Dispatch<SetStateAction<string>>;
  adminBusy: boolean;
  setAdminBusy: Dispatch<SetStateAction<boolean>>;
  startAdminServer: (serverId?: string, force?: boolean) => Promise<void>;
  stopAdminServer: (serverId: string) => Promise<void>;
  loadAdminServers: () => Promise<void>;
};

export function MiniprogramAdminPanel({
  tab,
  writable,
  adminPreviewRunning,
  activeAdminServer,
  adminStatusLabel,
  adminStatusTone,
  adminFrameRef,
  adminFrameKey,
  setAdminFrameKey,
  adminDialogOpen,
  setAdminDialogOpen,
  adminDeviceMode,
  setAdminDeviceMode,
  adminDeviceId,
  setAdminDeviceId,
  adminZoomMode,
  setAdminZoomMode,
  adminError,
  adminBusy,
  startAdminServer,
  stopAdminServer,
  loadAdminServers,
}: MiniprogramAdminPanelProps) {
  const adminStarting = activeAdminServer?.status === "starting";
  const adminStartDisabled = adminBusy || !writable || adminStarting;
  const adminStartCopy = !writable
    ? { title: "无法开启预览", detail: "当前账号对该项目只读" }
    : adminBusy
      ? { title: "正在处理…", detail: "请稍候，状态更新后会自动显示" }
      : !activeAdminServer
        ? { title: "开启 Admin 预览", detail: "在当前页签启动本地预览服务" }
        : adminStarting
          ? { title: "预览服务启动中", detail: "就绪后会自动显示管理后台" }
          : activeAdminServer.status === "failed"
            ? {
                title: "重新启动预览",
                detail: adminError || activeAdminServer.error || "查看错误后再次启动",
              }
            : { title: "重新开启预览", detail: "继续预览 Admin 根目录" };
  return (
    <>
      {tab === "admin" ? (
        <section className="miniprogram-panel miniprogram-admin-panel">
          {adminPreviewRunning ? (
            <div className="miniprogram-admin-toolbar" role="toolbar" aria-label="Admin预览工具栏">
              <RefreshButton
                type="button"
                className="miniprogram-preview-icon-button"
                aria-label="重新加载 Admin预览"
                title="重新加载"
                onClick={() => setAdminFrameKey((value) => value + 1)}
                label="重新加载 Admin预览"
              />
              <div className="miniprogram-admin-address" title={activeAdminServer?.proxyBase}>
                <UiIcon name="globe" size={13} />
                <span>{activeAdminServer?.proxyBase}</span>
              </div>
              <CloudBaseTag title="Admin 预览里的云调用绑定 CloudBase 开发环境" />
              <div className="miniprogram-admin-device-controls" role="group" aria-label="预览设备">
                <button
                  type="button"
                  className={
                    "miniprogram-preview-icon-button" +
                    (adminDeviceMode === "desktop" ? " is-active" : "")
                  }
                  aria-label="电脑模式"
                  aria-pressed={adminDeviceMode === "desktop"}
                  title="电脑模式"
                  onClick={() => setAdminDeviceMode("desktop")}
                >
                  <UiIcon name="monitor" size={14} />
                </button>
                <button
                  type="button"
                  className={
                    "miniprogram-preview-icon-button" +
                    (adminDeviceMode === "mobile" ? " is-active" : "")
                  }
                  aria-label="手机模式"
                  aria-pressed={adminDeviceMode === "mobile"}
                  title="手机模式"
                  onClick={() => setAdminDeviceMode("mobile")}
                >
                  <UiIcon name="smartphone" size={14} />
                </button>
              </div>
              <button
                type="button"
                className="miniprogram-preview-icon-button"
                aria-label="在电脑浏览器中打开"
                title="在电脑浏览器中打开"
                onClick={() => {
                  if (!activeAdminServer?.proxyBase) return;
                  window.open(activeAdminServer.proxyBase, "_blank", "noopener,noreferrer");
                }}
              >
                <UiIcon name="share" size={14} />
              </button>
              <button
                type="button"
                className="miniprogram-preview-icon-button"
                aria-label="Admin预览服务"
                title={`Admin预览服务 · ${adminStatusLabel}`}
                onClick={() => setAdminDialogOpen(true)}
              >
                <UiIcon name="server" size={14} />
              </button>
            </div>
          ) : null}

          {activeAdminServer?.status === "running" ? (
            adminDeviceMode === "mobile" ? (
              // 手机模式只套机模外壳，不给 iframe 加 sandbox：
              // 同源 cookie、CloudBase 鉴权与 HMR WebSocket 都必须保持可用。
              <MiniProgramDeviceShell
                deviceId={adminDeviceId}
                onDeviceIdChange={setAdminDeviceId}
                zoomMode={adminZoomMode}
                onZoomModeChange={setAdminZoomMode}
                deviceAriaLabel="后台预览机型"
                zoomAriaLabel="后台预览缩放"
              >
                <iframe
                  ref={adminFrameRef}
                  key={adminFrameKey}
                  className="miniprogram-admin-frame"
                  title="PC 管理后台预览"
                  src={activeAdminServer.proxyBase}
                />
              </MiniProgramDeviceShell>
            ) : (
              <div className="miniprogram-admin-preview">
                <iframe
                  ref={adminFrameRef}
                  key={adminFrameKey}
                  className="miniprogram-admin-frame"
                  title="PC 管理后台预览"
                  src={activeAdminServer.proxyBase}
                />
              </div>
            )
          ) : (
            <div className="miniprogram-admin-preview is-idle">
              <div className="miniprogram-admin-start">
                <UiIcon name="monitor" size={48} className="miniprogram-admin-start-mark" />
                <button
                  type="button"
                  className="miniprogram-admin-start-card"
                  disabled={adminStartDisabled}
                  title={adminStartCopy.detail}
                  onClick={() => void startAdminServer(activeAdminServer?.id)}
                >
                  <UiIcon name={adminBusy ? "refresh" : "play"} size={16} />
                  <span className="miniprogram-admin-start-card-copy">
                    <strong>{adminStartCopy.title}</strong>
                    <small>{adminStartCopy.detail}</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="miniprogram-admin-start-card"
                  title="端口、地址和运行信息"
                  onClick={() => setAdminDialogOpen(true)}
                >
                  <UiIcon name="server" size={16} />
                  <span className="miniprogram-admin-start-card-copy">
                    <strong>查看服务状态</strong>
                    <small>端口、地址和运行信息</small>
                  </span>
                </button>
              </div>
            </div>
          )}

          {adminDialogOpen ? (
            <WorkspaceDialog
              className="miniprogram-admin-service-dialog"
              title="Admin预览服务"
              subtitle="开发版"
              bodyInset
              onClose={() => setAdminDialogOpen(false)}
              actions={
                <RefreshButton
                  pending={adminBusy}
                  type="button"
                  disabled={adminBusy}
                  onClick={() => void loadAdminServers()}
                  label="刷新服务状态"
                />
              }
              footer={
                <>
                  {activeAdminServer?.status === "running" ? (
                    <button
                      type="button"
                      className="miniprogram-danger"
                      disabled={adminBusy || !writable}
                      onClick={() => void stopAdminServer(activeAdminServer.id)}
                    >
                      停止
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="primary"
                    disabled={adminBusy || !writable}
                    onClick={() =>
                      void startAdminServer(
                        activeAdminServer?.id,
                        activeAdminServer?.status === "running",
                      )
                    }
                  >
                    {adminBusy
                      ? "处理中…"
                      : activeAdminServer?.status === "running" ||
                          activeAdminServer?.status === "failed"
                        ? "重启"
                        : "开启"}
                  </button>
                </>
              }
            >
              {adminError ? <p className="miniprogram-config-error">{adminError}</p> : null}
              {activeAdminServer ? (
                <dl className="miniprogram-admin-service-meta">
                  <div>
                    <dt>状态</dt>
                    <dd>
                      <span className={`miniprogram-status ${adminStatusTone}`}>
                        {adminStatusLabel}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>地址</dt>
                    <dd>
                      <code>{activeAdminServer.proxyBase}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>端口</dt>
                    <dd>{activeAdminServer.port || "—"}</dd>
                  </div>
                  <div>
                    <dt>活动</dt>
                    <dd>{activeAdminServer.lastActivityAt || "—"}</dd>
                  </div>
                </dl>
              ) : (
                <p className="muted miniprogram-note">尚未开启。</p>
              )}
              {writable ? null : <p className="muted miniprogram-note">只读，不能开关服务。</p>}
            </WorkspaceDialog>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
