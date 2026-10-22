import { DialogFilters } from "./DialogFilters";
import { TextField } from "./TextField";
import { SelectField } from "./SelectField";
import { RefreshButton } from "./IconButton";
import { ContextMenu } from "./ContextMenu";
import { FloatingPortal } from "./FloatingPortal";
/**
 * 小程序工作区的 Dimina 预览页：预览服务、设备框、刷新菜单与微信预览/上传记录。
 * 数据与回调由父组件打包成 props 传入。
 */
import {
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  DEPLOY_TARGET_LABELS,
  PendingPanel,
  PreviewCanvas,
  TABLE_PAGE_SIZE,
  TablePagination,
  WorkspaceDialog,
  formatBuildTime,
  formatRecordTime,
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

function recordStatusTone(status: string): string {
  if (status === "succeeded") return "ok";
  if (status === "failed") return "failed";
  if (status === "running" || status === "queued") return "warning";
  return "muted";
}

export function MiniprogramPreviewPanel({
  tab,
  writable,
  projectId,
  enabled,
  meta,
  previewRoute,
  buildError,
  setBuildError,
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
  setOpenDeploymentId,
  deploymentLog,
  setDeploymentLog,
  openDeployment,
}: MiniprogramPreviewPanelProps) {
  const [refreshMenuBox, setRefreshMenuBox] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!refreshMenuOpen) return;
    const place = () => {
      const anchor = refreshMenuRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = 164;
      let left = rect.left;
      if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - width);
      setRefreshMenuBox({ left, top: rect.bottom + 5 });
    };
    place();
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [refreshMenuOpen, refreshMenuRef]);
  const [recordPage, setRecordPage] = useState(0);
  const [recordPageSize, setRecordPageSize] = useState(TABLE_PAGE_SIZE);
  const [recordStatus, setRecordStatus] = useState("");
  const [recordType, setRecordType] = useState("");
  const [recordOperator, setRecordOperator] = useState("");
  const [recordFrom, setRecordFrom] = useState("");
  const [recordTo, setRecordTo] = useState("");
  const [appliedRecordFilter, setAppliedRecordFilter] = useState({
    status: "",
    type: "",
    operator: "",
    from: "",
    to: "",
  });
  const recordOperators = Array.from(
    new Set(wechatDeployments.map((row) => row.operatorName || "").filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "zh-CN"));
  const filteredRecords = wechatDeployments.filter((row) => {
    if (appliedRecordFilter.status === "succeeded" && row.status !== "succeeded") return false;
    if (appliedRecordFilter.status === "failed" && row.status !== "failed") return false;
    if (
      appliedRecordFilter.status === "running" &&
      row.status !== "running" &&
      row.status !== "queued"
    )
      return false;
    if (appliedRecordFilter.type && row.target !== appliedRecordFilter.type) return false;
    if (appliedRecordFilter.operator && (row.operatorName || "") !== appliedRecordFilter.operator)
      return false;
    const raw = String(row.publishedAt || row.createdAt || "").trim();
    const normalized = raw
      ? /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)
        ? raw
        : raw.replace(" ", "T") + "Z"
      : "";
    const at = normalized ? new Date(normalized).getTime() : Number.NaN;
    if (
      appliedRecordFilter.from &&
      (Number.isNaN(at) || at < new Date(appliedRecordFilter.from).getTime())
    )
      return false;
    if (
      appliedRecordFilter.to &&
      (Number.isNaN(at) || at > new Date(appliedRecordFilter.to).getTime())
    )
      return false;
    return true;
  });
  const recordStart = recordPage * recordPageSize;
  const recordRows = filteredRecords.slice(recordStart, recordStart + recordPageSize);
  const recordHasNext = recordStart + recordPageSize < filteredRecords.length;
  return (
    <>
      {tab === "preview" ? (
        <section className="miniprogram-panel miniprogram-preview-panel">
          <div className="miniprogram-preview-toolbar" role="toolbar" aria-label="小程序预览工具栏">
            <div className="miniprogram-preview-refresh" ref={refreshMenuRef}>
              <RefreshButton
                type="button"
                className="miniprogram-preview-icon-button"
                aria-label="刷新与编译"
                aria-haspopup="menu"
                aria-expanded={refreshMenuOpen}
                title="刷新与编译"
                disabled={building}
                onClick={() => setRefreshMenuOpen((value) => !value)}
                label="刷新与编译"
              />
              {refreshMenuOpen ? (
                <FloatingPortal>
                  <ContextMenu
                    onDismiss={() => setRefreshMenuOpen(false)}
                    className={`miniprogram-preview-refresh-menu${refreshMenuBox ? "" : " is-positioning"}`}
                    role="menu"
                    style={{
                      position: "fixed",
                      left: refreshMenuBox?.left ?? 0,
                      top: refreshMenuBox?.top ?? 0,
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      disabled={building}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setRefreshMenuOpen(false);
                        if (!enabled) {
                          setBuildError("请先在「项目管理 → 小程序」保存微信 AppID，再编译预览。");
                          return;
                        }
                        void rebuild(false);
                      }}
                    >
                      <UiIcon name="play" size={13} />
                      {building ? "编译中…" : "重新编译"}
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
                      disabled={building}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setRefreshMenuOpen(false);
                        if (!enabled) {
                          setBuildError("请先在「项目管理 → 小程序」保存微信 AppID，再编译预览。");
                          return;
                        }
                        void rebuild(true);
                      }}
                    >
                      <UiIcon name="restore" size={13} />
                      强制重新编译
                    </button>
                  </ContextMenu>
                </FloatingPortal>
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
            <WorkspaceDialog
              bodyInset
              title="微信发布"
              onClose={() => setOpenAction(null)}
              footer={
                <>
                  <button
                    type="button"
                    disabled={wechatBusy !== null || !uploadVersion}
                    onClick={() => void uploadWechatVersion()}
                  >
                    {wechatBusy === "upload" ? "上传中…" : "上传体验版"}
                  </button>
                </>
              }
            >
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
                  <TextField
                    label="上传版本号"
                    value={uploadVersion}
                    placeholder="1.0.0"
                    autoComplete="off"
                    onChange={(event) => setUploadVersion(event.target.value)}
                  />
                  <TextField
                    label="版本说明"
                    value={uploadDesc}
                    placeholder="本次更新内容"
                    autoComplete="off"
                    onChange={(event) => setUploadDesc(event.target.value)}
                  />

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
            <WorkspaceDialog
              className="miniprogram-records-dialog dialog-list"
              title="编译与发布记录"
              onClose={() => setOpenAction(null)}
              footerPagination
              footer={
                <TablePagination
                  page={recordPage}
                  pageSize={recordPageSize}
                  total={filteredRecords.length}
                  hasNext={recordHasNext}
                  onPageChange={setRecordPage}
                  onPageSizeChange={(pageSize) => {
                    setRecordPageSize(pageSize);
                    setRecordPage(0);
                  }}
                />
              }
              filters={
                <DialogFilters
                  label="编译与发布记录筛选"
                  onQuery={() => {
                    setAppliedRecordFilter({
                      status: recordStatus,
                      type: recordType,
                      operator: recordOperator,
                      from: recordFrom,
                      to: recordTo,
                    });
                    setRecordPage(0);
                  }}
                  onReset={() => {
                    setRecordStatus("");
                    setRecordType("");
                    setRecordOperator("");
                    setRecordFrom("");
                    setRecordTo("");
                    setAppliedRecordFilter({
                      status: "",
                      type: "",
                      operator: "",
                      from: "",
                      to: "",
                    });
                    setRecordPage(0);
                  }}
                >
                  <div className="dialog-filter-item">
                    <span>状态</span>
                    <SelectField
                      clearable
                      aria-label="状态"
                      value={recordStatus}
                      onChange={(value) => setRecordStatus(value)}
                      placeholder="全部状态"
                      options={[
                        { value: "", label: "全部状态" },
                        { value: "succeeded", label: "成功" },
                        { value: "failed", label: "失败" },
                        { value: "running", label: "进行中" },
                      ]}
                    />
                  </div>
                  <div className="dialog-filter-item">
                    <span>类型</span>
                    <SelectField
                      clearable
                      aria-label="类型"
                      value={recordType}
                      onChange={(value) => setRecordType(value)}
                      placeholder="全部类型"
                      options={[
                        { value: "", label: "全部类型" },
                        { value: "app_preview", label: "Dimina 编译" },
                        { value: "wechat_preview", label: "开发版预览" },
                        { value: "wechat_upload", label: "体验版上传" },
                      ]}
                    />
                  </div>
                  <div className="dialog-filter-item">
                    <span>操作人</span>
                    <SelectField
                      clearable
                      aria-label="操作人"
                      value={recordOperator}
                      onChange={(value) => setRecordOperator(value)}
                      placeholder="全部操作人"
                      options={[
                        { value: "", label: "全部操作人" },
                        ...recordOperators.map((name) => ({ value: name, label: name })),
                      ]}
                    />
                  </div>
                  <div className="dialog-filter-item">
                    <span>开始</span>
                    <TextField
                      aria-label="开始时间"
                      type="datetime-local"
                      value={recordFrom}
                      onChange={(event) => setRecordFrom(event.target.value)}
                    />
                  </div>
                  <div className="dialog-filter-item">
                    <span>结束</span>
                    <TextField
                      aria-label="结束时间"
                      type="datetime-local"
                      value={recordTo}
                      onChange={(event) => setRecordTo(event.target.value)}
                    />
                  </div>
                </DialogFilters>
              }
            >
              <div className="miniprogram-table-content miniprogram-deploy-content">
                <div className="miniprogram-production-table-wrap">
                  <table className="miniprogram-production-table miniprogram-records-table">
                    <thead>
                      <tr>
                        <th>状态</th>
                        <th>类型</th>
                        <th>版本</th>
                        <th>时间</th>
                        <th>操作人</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {recordRows.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <span className={`miniprogram-status ${recordStatusTone(row.status)}`}>
                              {row.status === "succeeded"
                                ? "成功"
                                : row.status === "failed"
                                  ? "失败"
                                  : row.status === "running" || row.status === "queued"
                                    ? "进行中"
                                    : row.status}
                            </span>
                          </td>
                          <td>{DEPLOY_TARGET_LABELS[row.target] || row.target}</td>
                          <td>{row.version || "—"}</td>
                          <td>{formatRecordTime(row.publishedAt || row.createdAt) || "—"}</td>
                          <td>{row.operatorName || "—"}</td>
                          <td>
                            <button type="button" onClick={() => void openDeployment(row.id)}>
                              日志
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!filteredRecords.length ? (
                        <tr>
                          <td className="miniprogram-production-empty" colSpan={6}>
                            {wechatDeployments.length
                              ? "没有符合筛选条件的记录。"
                              : "还没有编译或发布记录。"}
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
              {openDeploymentId ? (
                <WorkspaceDialog
                  className="miniprogram-log-dialog"
                  title={
                    (DEPLOY_TARGET_LABELS[
                      wechatDeployments.find((row) => row.id === openDeploymentId)?.target || ""
                    ] || "记录") + "日志"
                  }
                  onClose={() => {
                    setOpenDeploymentId("");
                    setDeploymentLog("");
                  }}
                >
                  <pre className="miniprogram-doc-result miniprogram-log-dialog-body">
                    {deploymentLog}
                  </pre>
                </WorkspaceDialog>
              ) : null}
            </WorkspaceDialog>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
