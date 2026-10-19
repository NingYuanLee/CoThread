/**
 * 小程序工作区的 Dimina 预览页：预览服务、设备框、刷新菜单与微信预览/上传记录。
 * 数据与回调由父组件打包成 props 传入。
 */
import { type Dispatch, type RefObject, type SetStateAction } from "react";
import {
  DeploymentRecordList,
  PendingPanel,
  PreviewCanvas,
  WorkspaceDialog,
  formatBuildTime,
  type DeploymentRow,
  type MiniProgramTabId,
  type PreviewMeta,
} from "./miniprogram-internals";
import { UiIcon } from "./ui-icon";

export type MiniprogramPreviewPanelProps = {
  tab: MiniProgramTabId;
  setTab: Dispatch<SetStateAction<MiniProgramTabId>>;
  writable: boolean;
  projectId: string;
  enabled: boolean;
  meta: PreviewMeta | null;
  setMeta: Dispatch<SetStateAction<PreviewMeta | null>>;
  previewRoute: string;
  buildError: string;
  setBuildError: Dispatch<SetStateAction<string>>;
  building: boolean;
  setBuilding: Dispatch<SetStateAction<boolean>>;
  reloadKey: number;
  setReloadKey: Dispatch<SetStateAction<number>>;
  refreshMenuOpen: boolean;
  setRefreshMenuOpen: Dispatch<SetStateAction<boolean>>;
  refreshMenuRef: RefObject<HTMLDivElement | null>;
  rebuild: (force: boolean) => Promise<void>;
  openAction: "wechat" | "records" | null;
  setOpenAction: Dispatch<SetStateAction<"wechat" | "records" | null>>;
  wechatBusy: "preview" | "upload" | null;
  setWechatBusy: Dispatch<SetStateAction<"preview" | "upload" | null>>;
  wechatError: string;
  setWechatError: Dispatch<SetStateAction<string>>;
  wechatNotice: string;
  setWechatNotice: Dispatch<SetStateAction<string>>;
  qrDataUrl: string;
  setQrDataUrl: Dispatch<SetStateAction<string>>;
  uploadVersion: string;
  setUploadVersion: Dispatch<SetStateAction<string>>;
  uploadDesc: string;
  setUploadDesc: Dispatch<SetStateAction<string>>;
  generateWechatPreview: () => Promise<void>;
  uploadWechatVersion: () => Promise<void>;
  wechatDeployments: DeploymentRow[];
  openDeploymentId: string;
  setOpenDeploymentId: Dispatch<SetStateAction<string>>;
  deploymentLog: string;
  setDeploymentLog: Dispatch<SetStateAction<string>>;
  openDeployment: (id: string) => Promise<void>;
};

export function MiniprogramPreviewPanel({
  tab,
  writable,
  projectId,
  enabled,
  meta,
  previewRoute,
  buildError,
  building,
  reloadKey,
  setReloadKey,
  refreshMenuOpen,
  setRefreshMenuOpen,
  refreshMenuRef,
  rebuild,
  openAction,
  setOpenAction,
  wechatBusy,
  wechatError,
  wechatNotice,
  qrDataUrl,
  uploadVersion,
  setUploadVersion,
  uploadDesc,
  setUploadDesc,
  generateWechatPreview,
  uploadWechatVersion,
  wechatDeployments,
  openDeploymentId,
  deploymentLog,
  openDeployment,
}: MiniprogramPreviewPanelProps) {
  return (
    <>
      {tab === "preview" ? (
        <section className="miniprogram-panel miniprogram-preview-panel">
          <div className="miniprogram-preview-toolbar" role="toolbar" aria-label="小程序预览工具栏">
            <div className="miniprogram-preview-refresh" ref={refreshMenuRef}>
              <button
                type="button"
                className="miniprogram-preview-icon-button"
                aria-label="刷新与编译"
                aria-haspopup="menu"
                aria-expanded={refreshMenuOpen}
                title="刷新与编译"
                disabled={building}
                onClick={() => setRefreshMenuOpen((value) => !value)}
              >
                <UiIcon name="refresh" size={14} />
              </button>
              {refreshMenuOpen ? (
                <div className="miniprogram-preview-refresh-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!enabled || building}
                    onClick={() => {
                      setRefreshMenuOpen(false);
                      void rebuild(false);
                    }}
                  >
                    <UiIcon name="play" size={13} />
                    {building ? "编译中…" : meta?.runnable ? "重新编译" : "编译并预览"}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={building}
                    onClick={() => {
                      setRefreshMenuOpen(false);
                      setReloadKey((value) => value + 1);
                    }}
                  >
                    <UiIcon name="refresh" size={13} />
                    重新加载
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={building || !meta?.runnable}
                    onClick={() => {
                      setRefreshMenuOpen(false);
                      void rebuild(true);
                    }}
                  >
                    <UiIcon name="restore" size={13} />
                    强制重新编译
                  </button>
                </div>
              ) : null}
            </div>
            <div className="miniprogram-preview-route" title={previewRoute}>
              <UiIcon name="code" size={13} />
              <span className="miniprogram-preview-route-path">{previewRoute}</span>
              <span
                className="miniprogram-preview-build-time"
                title={meta?.build?.finishedAt || undefined}
              >
                上次编译：{formatBuildTime(meta?.build?.finishedAt)}
              </span>
            </div>
            <div className="miniprogram-preview-primary-actions">
              <button
                type="button"
                className="miniprogram-preview-icon-button"
                aria-label="微信发布"
                title="微信发布"
                onClick={() => setOpenAction("wechat")}
              >
                <UiIcon name="upload" size={14} />
              </button>
              <button
                type="button"
                className="miniprogram-preview-icon-button"
                aria-label="记录"
                title="记录"
                onClick={() => setOpenAction("records")}
              >
                <UiIcon name="history" size={14} />
              </button>
            </div>
          </div>
          <div className="miniprogram-preview-scroll">
            {buildError ? <p className="miniprogram-config-error">{buildError}</p> : null}
            {meta?.build?.errorCode ? (
              <p className="miniprogram-config-error">上次编译失败（{meta.build.errorCode}）</p>
            ) : null}
            {!enabled ? (
              <PendingPanel
                icon="smartphone"
                title="工作区尚未开放"
                detail="在「项目管理 → 小程序与云开发」完成配置并通过连接测试后，这里会自动开放。"
              />
            ) : meta?.runnable && meta.appId ? (
              <PreviewCanvas
                key={`${meta.build?.id}-${meta.runtime.moduleUrl}-${reloadKey}`}
                meta={meta}
                projectId={projectId}
              />
            ) : (
              <PendingPanel
                icon="smartphone"
                title={meta?.build ? "源码已变更，需要重新编译" : "还没有可运行的编译产物"}
                detail="点击「编译并预览」把「小程序源文件」编译为 Dimina 资源包，随后在此运行。源码仍可在文档树中直接预览。"
              />
            )}
          </div>
          {openAction === "wechat" ? (
            <WorkspaceDialog title="微信发布" onClose={() => setOpenAction(null)}>
              <div className="miniprogram-config-actions">
                <button
                  type="button"
                  disabled={!enabled || wechatBusy !== null}
                  onClick={() => void generateWechatPreview()}
                >
                  {wechatBusy === "preview"
                    ? "生成中…"
                    : qrDataUrl
                      ? "重新生成预览二维码"
                      : "生成开发版预览二维码"}
                </button>
              </div>
              {wechatError ? <p className="miniprogram-config-error">{wechatError}</p> : null}
              {wechatNotice ? <p className="muted miniprogram-note">{wechatNotice}</p> : null}
              {qrDataUrl ? (
                <div className="miniprogram-qr">
                  <img src={qrDataUrl} alt="微信开发版预览二维码" />
                  <span className="muted">
                    用微信扫码打开开发版；二维码由微信官方 CI 生成，会过期。
                  </span>
                </div>
              ) : (
                <p className="muted miniprogram-note">
                  还没有二维码。生成后用微信扫码打开开发版；二维码由微信官方 CI 生成，会过期。
                </p>
              )}

              <h5>上传体验版</h5>
              {writable ? (
                <>
                  <div className="miniprogram-field">
                    <span>上传版本号</span>
                    <input
                      type="text"
                      value={uploadVersion}
                      placeholder="1.0.0"
                      autoComplete="off"
                      onChange={(event) => setUploadVersion(event.target.value)}
                    />
                  </div>
                  <div className="miniprogram-field">
                    <span>版本说明</span>
                    <input
                      type="text"
                      value={uploadDesc}
                      placeholder="本次更新内容"
                      autoComplete="off"
                      onChange={(event) => setUploadDesc(event.target.value)}
                    />
                  </div>
                  <div className="miniprogram-config-actions">
                    <button
                      type="button"
                      disabled={wechatBusy !== null || !uploadVersion}
                      onClick={() => void uploadWechatVersion()}
                    >
                      {wechatBusy === "upload" ? "上传中…" : "上传体验版"}
                    </button>
                  </div>
                  <p className="muted miniprogram-note">
                    上传后生成微信体验版，不代表已提交审核；提审与正式发布仍需在微信后台完成。微信还要求调用方
                    IP 在白名单内。
                  </p>
                </>
              ) : (
                <p className="muted miniprogram-note">当前账号对该项目只读，无法上传版本。</p>
              )}
            </WorkspaceDialog>
          ) : null}

          {openAction === "records" ? (
            <WorkspaceDialog title="微信小程序发布记录" onClose={() => setOpenAction(null)}>
              <DeploymentRecordList
                rows={wechatDeployments}
                openDeploymentId={openDeploymentId}
                deploymentLog={deploymentLog}
                emptyText="还没有微信小程序发布记录。"
                onOpen={(id) => void openDeployment(id)}
              />
            </WorkspaceDialog>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
