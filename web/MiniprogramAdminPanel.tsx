/**
 * 小程序工作区的 Admin 预览页：本地预览服务、设备框与生产地址。
 */
import { type Dispatch, type RefObject, type SetStateAction } from "react";
import { MiniProgramDeviceShell } from "./MiniProgramDeviceShell";
import {
  PendingPanel,
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
  adminPendingTitle: string;
  adminPendingDetail: string;
  adminServiceTitle: string;
  adminServiceDescription: string;
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
  startAdminServer: (serverId?: string) => Promise<void>;
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
  adminPendingTitle,
  adminPendingDetail,
  adminServiceTitle,
  adminServiceDescription,
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
  return (
    <>
      {tab === "admin" ? (
        <section className="miniprogram-panel miniprogram-admin-panel">
          <div className="miniprogram-admin-toolbar" role="toolbar" aria-label="Admin预览工具栏">
            <button
              type="button"
              className="miniprogram-preview-icon-button"
              aria-label={adminPreviewRunning ? "重新加载 Admin预览" : "开启 Admin预览服务"}
              title={adminPreviewRunning ? "重新加载" : "开启 Admin预览服务"}
              onClick={() => {
                if (adminPreviewRunning) {
                  setAdminFrameKey((value) => value + 1);
                  return;
                }
                setAdminDialogOpen(true);
              }}
            >
              <UiIcon name={adminPreviewRunning ? "refresh" : "play"} size={14} />
            </button>
            <div
              className="miniprogram-admin-address"
              title={activeAdminServer?.proxyBase || "Admin预览服务未连接"}
            >
              <UiIcon name="globe" size={13} />
              <span>{activeAdminServer?.proxyBase || "Admin预览服务未连接"}</span>
            </div>
            <div className="miniprogram-admin-device-controls" role="group" aria-label="预览设备">
              <button
                type="button"
                className={`miniprogram-preview-icon-button${adminDeviceMode === "desktop" ? " is-active" : ""}`}
                aria-label="电脑模式"
                aria-pressed={adminDeviceMode === "desktop"}
                title="电脑模式"
                disabled={!adminPreviewRunning}
                onClick={() => setAdminDeviceMode("desktop")}
              >
                <UiIcon name="monitor" size={14} />
              </button>
              <button
                type="button"
                className={`miniprogram-preview-icon-button${adminDeviceMode === "mobile" ? " is-active" : ""}`}
                aria-label="手机模式"
                aria-pressed={adminDeviceMode === "mobile"}
                title="手机模式"
                disabled={!adminPreviewRunning}
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
              disabled={!adminPreviewRunning}
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
            <div className="miniprogram-admin-preview">
              <PendingPanel icon="monitor" title={adminPendingTitle} detail={adminPendingDetail} />
            </div>
          )}

          {adminDialogOpen ? (
            <WorkspaceDialog title="Admin预览服务" onClose={() => setAdminDialogOpen(false)}>
              <section className="miniprogram-admin-service-section">
                <div className="miniprogram-admin-service-summary">
                  <span className="miniprogram-admin-service-icon" aria-hidden="true">
                    <UiIcon name={adminPreviewRunning ? "online" : "server"} size={16} />
                  </span>
                  <div className="miniprogram-admin-service-summary-copy">
                    <div className="miniprogram-admin-service-head">
                      <div>
                        <span className="miniprogram-admin-service-environment">开发版</span>
                        <h5>{adminServiceTitle}</h5>
                      </div>
                      <span className={`miniprogram-status ${adminStatusTone}`}>
                        {adminStatusLabel}
                      </span>
                    </div>
                    <p className="muted miniprogram-note">{adminServiceDescription}</p>
                  </div>
                </div>
                {adminError ? <p className="miniprogram-config-error">{adminError}</p> : null}
                {activeAdminServer ? (
                  <div className="miniprogram-admin-service-details">
                    <div className="miniprogram-admin-service-address">
                      <span>预览地址</span>
                      <code>{activeAdminServer.proxyBase}</code>
                    </div>
                    <dl className="miniprogram-admin-service-meta">
                      <div>
                        <dt>端口</dt>
                        <dd>{activeAdminServer.port || "—"}</dd>
                      </div>
                      <div>
                        <dt>最近活动</dt>
                        <dd>{activeAdminServer.lastActivityAt || "—"}</dd>
                      </div>
                    </dl>
                  </div>
                ) : (
                  <div className="miniprogram-admin-service-empty">
                    <strong>当前没有已登记的服务</strong>
                    <span>开启后会在这里显示预览地址和运行信息。</span>
                  </div>
                )}
                <div className="miniprogram-admin-service-actions">
                  <div className="miniprogram-config-actions miniprogram-admin-service-primary-actions">
                    <button
                      type="button"
                      className="primary"
                      disabled={adminBusy || !writable}
                      onClick={() => void startAdminServer(activeAdminServer?.id)}
                    >
                      <UiIcon
                        name={activeAdminServer?.status === "running" ? "refresh" : "play"}
                        size={13}
                      />
                      {adminBusy
                        ? "处理中…"
                        : activeAdminServer?.status === "running" ||
                            activeAdminServer?.status === "failed"
                          ? "重启服务"
                          : "开启服务"}
                    </button>
                    <button
                      type="button"
                      disabled={adminBusy}
                      onClick={() => void loadAdminServers()}
                    >
                      <UiIcon name="refresh" size={13} />
                      {adminBusy ? "刷新中…" : "刷新状态"}
                    </button>
                  </div>
                  {activeAdminServer?.status === "running" ? (
                    <div className="miniprogram-admin-service-danger-zone">
                      <div>
                        <strong>停止开发服务</strong>
                        <span>停止后当前 Admin预览将不可访问。</span>
                      </div>
                      <button
                        type="button"
                        className="miniprogram-danger"
                        disabled={adminBusy || !writable}
                        onClick={() => void stopAdminServer(activeAdminServer.id)}
                      >
                        <UiIcon name="stop" size={13} />
                        停止服务
                      </button>
                    </div>
                  ) : null}
                </div>
              </section>

              {writable ? null : <p className="muted miniprogram-note">当前账号对该项目只读。</p>}
            </WorkspaceDialog>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
