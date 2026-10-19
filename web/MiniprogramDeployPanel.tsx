/**
 * 小程序工作区的生产发布页：发布申请、审核流转与部署记录。
 * 数据与回调由父组件打包成 props 传入。
 */
import { type Dispatch, type SetStateAction } from "react";
import {
  TablePagination,
  WorkspaceDialog,
  releaseStatusTone,
  type CloudbaseFunction,
  type MiniProgramTabId,
  type ReleaseApplication,
} from "./miniprogram-internals";
import { UiIcon } from "./ui-icon";

export type MiniprogramDeployPanelProps = {
  tab: MiniProgramTabId;
  setTab: Dispatch<SetStateAction<MiniProgramTabId>>;
  writable: boolean;
  owner: boolean;
  currentUserId: string;
  releaseBusy: string;
  releaseError: string;
  setReleaseError: Dispatch<SetStateAction<string>>;
  releaseNotice: string;
  setReleaseNotice: Dispatch<SetStateAction<string>>;
  releaseSearch: string;
  setReleaseSearch: Dispatch<SetStateAction<string>>;
  releaseApplications: ReleaseApplication[];
  visibleReleaseApplications: ReleaseApplication[];
  pagedReleaseApplications: ReleaseApplication[];
  releasePage: number;
  setReleasePage: Dispatch<SetStateAction<number>>;
  releasePageSize: number;
  setReleasePageSize: Dispatch<SetStateAction<number>>;
  releaseHasNext: boolean;
  releaseDetailId: string;
  setReleaseDetailId: Dispatch<SetStateAction<string>>;
  selectedReleaseApplication: ReleaseApplication | undefined;
  releaseCreateOpen: boolean;
  setReleaseCreateOpen: Dispatch<SetStateAction<boolean>>;
  releaseSelection: string[];
  setReleaseSelection: Dispatch<SetStateAction<string[]>>;
  releaseFunctions: CloudbaseFunction[];
  setReleaseFunctions: Dispatch<SetStateAction<CloudbaseFunction[]>>;
  releaseNote: string;
  setReleaseNote: Dispatch<SetStateAction<string>>;
  rejectingId: string;
  setRejectingId: Dispatch<SetStateAction<string>>;
  rejectReason: string;
  setRejectReason: Dispatch<SetStateAction<string>>;
  adminProductionPath: string;
  setAdminProductionPath: Dispatch<SetStateAction<string>>;
  adminProductionAddress: string;
  loadReleaseApplications: () => Promise<void>;
  loadReleaseFunctions: () => Promise<void>;
  loadDeployments: () => Promise<void>;
  submitReleaseApplication: () => Promise<void>;
  decideReleaseApplication: (
    application: ReleaseApplication,
    action: "approve" | "reject",
  ) => Promise<void>;
  cancelReleaseApplication: (application: ReleaseApplication) => Promise<void>;
};

export function MiniprogramDeployPanel({
  tab,
  writable,
  owner,
  currentUserId,
  releaseBusy,
  releaseError,
  setReleaseError,
  releaseNotice,
  setReleaseNotice,
  releaseSearch,
  setReleaseSearch,
  visibleReleaseApplications,
  pagedReleaseApplications,
  releasePage,
  setReleasePage,
  releasePageSize,
  setReleasePageSize,
  releaseHasNext,
  setReleaseDetailId,
  selectedReleaseApplication,
  releaseCreateOpen,
  setReleaseCreateOpen,
  releaseSelection,
  setReleaseSelection,
  releaseFunctions,
  releaseNote,
  setReleaseNote,
  rejectingId,
  setRejectingId,
  rejectReason,
  setRejectReason,
  adminProductionPath,
  setAdminProductionPath,
  adminProductionAddress,
  loadReleaseApplications,
  loadReleaseFunctions,
  loadDeployments,
  submitReleaseApplication,
  decideReleaseApplication,
  cancelReleaseApplication,
}: MiniprogramDeployPanelProps) {
  return (
    <>
      {tab === "deploy" ? (
        <>
          <section className="miniprogram-panel miniprogram-deploy-panel">
            <div
              className="miniprogram-admin-toolbar miniprogram-production-addressbar"
              role="toolbar"
              aria-label="生产发布工具栏"
            >
              <button
                type="button"
                className="miniprogram-preview-icon-button"
                aria-label="刷新生产发布记录"
                title="刷新生产发布记录"
                disabled={releaseBusy !== ""}
                onClick={() =>
                  void Promise.all([
                    loadReleaseApplications(),
                    loadReleaseFunctions(),
                    loadDeployments(),
                  ])
                }
              >
                <UiIcon name="refresh" size={14} />
              </button>
              <label className="miniprogram-function-search">
                <UiIcon name="search" size={13} />
                <input
                  type="search"
                  value={releaseSearch}
                  placeholder="按发布内容搜索"
                  aria-label="按发布内容搜索"
                  onChange={(event) => setReleaseSearch(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="miniprogram-toolbar-button"
                disabled={!writable || releaseBusy !== ""}
                onClick={() => {
                  setReleaseError("");
                  setReleaseNotice("");
                  setReleaseSelection([]);
                  setReleaseNote("");
                  setReleaseCreateOpen(true);
                }}
              >
                <UiIcon name="plus" size={13} />
                新建生产发布
              </button>
            </div>

            <div className="miniprogram-table-content miniprogram-deploy-content">
              <div className="miniprogram-production-table-wrap">
                <table className="miniprogram-production-table">
                  <thead>
                    <tr>
                      <th>状态</th>
                      <th>发布内容</th>
                      <th>发布者</th>
                      <th>提交时间</th>
                      <th>更新时间</th>
                      <th aria-label="操作" />
                    </tr>
                  </thead>
                  <tbody>
                    {pagedReleaseApplications.map((application) => (
                      <tr key={application.id}>
                        <td>
                          <span
                            className={`miniprogram-status ${releaseStatusTone(application.status)}`}
                          >
                            {application.statusLabel}
                          </span>
                        </td>
                        <td>
                          <strong className="miniprogram-production-targets">
                            {application.items
                              .map((item) => item.resourceName || item.targetLabel)
                              .join("、")}
                          </strong>
                          {application.releaseNote ? (
                            <small>{application.releaseNote}</small>
                          ) : null}
                        </td>
                        <td title={application.requestedBy}>
                          {application.requestedBy === currentUserId
                            ? "我"
                            : application.requestedByKind === "session"
                              ? `成员 ${application.requestedBy.slice(0, 8)}`
                              : `小祥 ${application.requestedBy.slice(0, 8)}`}
                        </td>
                        <td>{application.createdAt || "—"}</td>
                        <td>{application.updatedAt || "—"}</td>
                        <td>
                          <button
                            type="button"
                            className="miniprogram-production-detail"
                            onClick={() => {
                              setReleaseError("");
                              setReleaseNotice("");
                              setRejectingId("");
                              setRejectReason("");
                              setReleaseDetailId(application.id);
                            }}
                          >
                            <UiIcon name="detail" size={13} />
                            详情
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!visibleReleaseApplications.length ? (
                      <tr>
                        <td className="miniprogram-production-empty" colSpan={6}>
                          {releaseSearch.trim()
                            ? "没有匹配的生产发布记录。"
                            : "还没有生产发布记录。"}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <TablePagination
                page={releasePage}
                pageSize={releasePageSize}
                total={visibleReleaseApplications.length}
                hasNext={releaseHasNext}
                onPageChange={setReleasePage}
                onPageSizeChange={(pageSize) => {
                  setReleasePageSize(pageSize);
                  setReleasePage(0);
                }}
              />
            </div>
          </section>

          {releaseCreateOpen ? (
            <WorkspaceDialog title="新建生产发布" onClose={() => setReleaseCreateOpen(false)}>
              <p className="muted miniprogram-note">
                选择本次要发布到生产环境的内容，提交后由项目主审批。
              </p>
              <div className="miniprogram-release-targets">
                <label className="miniprogram-release-target">
                  <input
                    type="checkbox"
                    checked={releaseSelection.includes("admin:cloudbase_static")}
                    onChange={(event) =>
                      setReleaseSelection((current) =>
                        event.target.checked
                          ? [...current, "admin:cloudbase_static"]
                          : current.filter((value) => value !== "admin:cloudbase_static"),
                      )
                    }
                  />
                  <span>
                    <strong>Admin 生产版</strong>
                    <small>静态网站托管 · Admin 根目录</small>
                  </span>
                </label>
                {releaseFunctions.map((item) => {
                  const key = `function:${item.name}`;
                  return (
                    <label className="miniprogram-release-target" key={key}>
                      <input
                        type="checkbox"
                        checked={releaseSelection.includes(key)}
                        onChange={(event) =>
                          setReleaseSelection((current) =>
                            event.target.checked
                              ? [...current, key]
                              : current.filter((value) => value !== key),
                          )
                        }
                      />
                      <span>
                        <strong>{item.name}</strong>
                        <small>云函数 · {item.runtime || item.status}</small>
                      </span>
                    </label>
                  );
                })}
              </div>
              {releaseSelection.includes("admin:cloudbase_static") ? (
                <section className="miniprogram-production-admin-config">
                  <dl className="miniprogram-meta">
                    <div>
                      <dt>发布方式</dt>
                      <dd>静态网站托管</dd>
                    </div>
                    <div>
                      <dt>发布环境</dt>
                      <dd>生产环境</dd>
                    </div>
                    <div>
                      <dt>产物来源</dt>
                      <dd>Admin 根目录</dd>
                    </div>
                  </dl>
                  <label className="miniprogram-field miniprogram-admin-hosting-path">
                    <span>托管路径</span>
                    <input
                      type="text"
                      value={adminProductionPath}
                      placeholder="/admin/"
                      disabled={releaseBusy !== ""}
                      autoComplete="off"
                      onChange={(event) => setAdminProductionPath(event.target.value)}
                    />
                  </label>
                  {adminProductionAddress ? (
                    <a
                      className="miniprogram-admin-production-url"
                      href={adminProductionAddress}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <UiIcon name="globe" size={13} />
                      <span>{adminProductionAddress}</span>
                    </a>
                  ) : null}
                </section>
              ) : null}
              <label className="miniprogram-field miniprogram-field-column miniprogram-production-note">
                <span>发布说明</span>
                <textarea
                  rows={4}
                  value={releaseNote}
                  placeholder="本次生产发布内容（可选）"
                  onChange={(event) => setReleaseNote(event.target.value)}
                />
              </label>
              {releaseError ? <p className="miniprogram-config-error">{releaseError}</p> : null}
              <div className="miniprogram-dialog-actions">
                <button
                  type="button"
                  disabled={releaseBusy !== ""}
                  onClick={() => setReleaseCreateOpen(false)}
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={!writable || !releaseSelection.length || releaseBusy !== ""}
                  onClick={() => void submitReleaseApplication()}
                >
                  <UiIcon name="upload" size={13} />
                  {releaseBusy === "submit" ? "提交中…" : "提交审批"}
                </button>
              </div>
            </WorkspaceDialog>
          ) : null}

          {selectedReleaseApplication ? (
            <WorkspaceDialog title="生产发布详情" onClose={() => setReleaseDetailId("")}>
              <div className="miniprogram-production-detail-head">
                <span
                  className={`miniprogram-status ${releaseStatusTone(selectedReleaseApplication.status)}`}
                >
                  {selectedReleaseApplication.statusLabel}
                </span>
                <code>{selectedReleaseApplication.id}</code>
              </div>
              {selectedReleaseApplication.sourceChanged &&
              selectedReleaseApplication.status === "pending" ? (
                <p className="miniprogram-approval-alert">源码已变化，不能通过，请重新提交。</p>
              ) : null}
              <dl className="miniprogram-production-detail-meta">
                <div>
                  <dt>发布者</dt>
                  <dd>
                    {selectedReleaseApplication.requestedBy === currentUserId
                      ? "我"
                      : selectedReleaseApplication.requestedBy}
                  </dd>
                </div>
                <div>
                  <dt>提交时间</dt>
                  <dd>{selectedReleaseApplication.createdAt || "—"}</dd>
                </div>
                <div>
                  <dt>审批人</dt>
                  <dd>{selectedReleaseApplication.decidedBy || "—"}</dd>
                </div>
                <div>
                  <dt>审批时间</dt>
                  <dd>{selectedReleaseApplication.decidedAt || "—"}</dd>
                </div>
                <div>
                  <dt>发布说明</dt>
                  <dd>{selectedReleaseApplication.releaseNote || "—"}</dd>
                </div>
                <div>
                  <dt>审批说明</dt>
                  <dd>{selectedReleaseApplication.decisionNote || "—"}</dd>
                </div>
              </dl>
              <section className="miniprogram-production-detail-items">
                <h5>发布内容</h5>
                <ul className="miniprogram-release-application-items">
                  {selectedReleaseApplication.items.map((item) => (
                    <li key={item.id}>
                      <div>
                        <strong>{item.resourceName || item.targetLabel}</strong>
                        <small>
                          {item.environment === "production" ? "生产环境" : item.environment}
                          {item.deploymentId ? ` · 部署记录 ${item.deploymentId}` : ""}
                        </small>
                      </div>
                      <span className={`miniprogram-status ${releaseStatusTone(item.status)}`}>
                        {item.statusLabel}
                      </span>
                      {item.lastError ? <p>{item.lastError}</p> : null}
                    </li>
                  ))}
                </ul>
              </section>
              {releaseError ? <p className="miniprogram-config-error">{releaseError}</p> : null}
              {releaseNotice ? <p className="muted miniprogram-note">{releaseNotice}</p> : null}
              {selectedReleaseApplication.status === "pending" ? (
                <div className="miniprogram-production-detail-actions">
                  {owner ? (
                    <>
                      <button
                        type="button"
                        className="miniprogram-approve"
                        disabled={releaseBusy !== "" || selectedReleaseApplication.sourceChanged}
                        onClick={() =>
                          void decideReleaseApplication(selectedReleaseApplication, "approve")
                        }
                      >
                        <UiIcon name="check" size={13} />
                        {releaseBusy === `approve:${selectedReleaseApplication.id}`
                          ? "发布中…"
                          : "通过并发布"}
                      </button>
                      <button
                        type="button"
                        className="miniprogram-danger"
                        disabled={releaseBusy !== ""}
                        onClick={() => {
                          setRejectingId(selectedReleaseApplication.id);
                          setRejectReason("");
                        }}
                      >
                        <UiIcon name="reject" size={13} />
                        拒绝
                      </button>
                    </>
                  ) : null}
                  {selectedReleaseApplication.requestedBy === currentUserId ? (
                    <button
                      type="button"
                      className="miniprogram-danger"
                      disabled={releaseBusy !== ""}
                      onClick={() => void cancelReleaseApplication(selectedReleaseApplication)}
                    >
                      <UiIcon name="abandon" size={13} />
                      {releaseBusy === `cancel:${selectedReleaseApplication.id}`
                        ? "放弃中…"
                        : "放弃发布"}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {selectedReleaseApplication.status === "pending" &&
              rejectingId === selectedReleaseApplication.id ? (
                <div className="miniprogram-approval-reject">
                  <label className="miniprogram-field">
                    <span>拒绝理由</span>
                    <input
                      value={rejectReason}
                      placeholder="必填，会记录到本次发布"
                      onChange={(event) => setRejectReason(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="miniprogram-danger"
                    disabled={releaseBusy !== "" || !rejectReason.trim()}
                    onClick={() =>
                      void decideReleaseApplication(selectedReleaseApplication, "reject")
                    }
                  >
                    确认拒绝
                  </button>
                </div>
              ) : null}
            </WorkspaceDialog>
          ) : null}
        </>
      ) : null}
    </>
  );
}
