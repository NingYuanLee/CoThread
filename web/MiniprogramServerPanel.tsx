/**
 * 小程序工作区的云函数页：函数列表、触发器（定时器）管理与函数部署记录。
 * 数据与回调由父组件打包成 props 传入。
 */
import { type Dispatch, type SetStateAction } from "react";
import {
  TablePagination,
  WorkspaceDialog,
  type CloudbaseEnvInfo,
  type CloudbaseFunction,
  type DatabaseEnvironment,
  type DeploymentRow,
  type MiniProgramTabId,
} from "./miniprogram-internals";
import { UiIcon } from "./ui-icon";

export type MiniprogramServerPanelProps = {
  tab: MiniProgramTabId;
  setTab: Dispatch<SetStateAction<MiniProgramTabId>>;
  writable: boolean;
  serverBusy: boolean;
  serverError: string;
  setServerError: Dispatch<SetStateAction<string>>;
  functionSearch: string;
  setFunctionSearch: Dispatch<SetStateAction<string>>;
  visibleFunctions: CloudbaseFunction[];
  functionPage: number;
  setFunctionPage: Dispatch<SetStateAction<number>>;
  functionPageSize: number;
  setFunctionPageSize: Dispatch<SetStateAction<number>>;
  functionHasNext: boolean;
  pagedFunctions: CloudbaseFunction[];
  cbEnvironments: CloudbaseEnvInfo[];
  functionEnvironment: DatabaseEnvironment;
  setFunctionEnvironment: Dispatch<SetStateAction<DatabaseEnvironment>>;
  loadServerFunctions: () => Promise<void>;
  serverFunctions: CloudbaseFunction[];
  timerFunctionName: string;
  setTimerFunctionName: Dispatch<SetStateAction<string>>;
  selectedTimerFunction: CloudbaseFunction | undefined;
  timerLimitReached: boolean;
  timerEditorOpen: boolean;
  setTimerEditorOpen: Dispatch<SetStateAction<boolean>>;
  timerEditingName: string | null;
  setTimerEditingName: Dispatch<SetStateAction<string | null>>;
  timerName: string;
  setTimerName: Dispatch<SetStateAction<string>>;
  timerSchedule: string;
  setTimerSchedule: Dispatch<SetStateAction<string>>;
  timerError: string;
  setTimerError: Dispatch<SetStateAction<string>>;
  timerToDelete: string | null;
  setTimerToDelete: Dispatch<SetStateAction<string | null>>;
  timerNameValid: boolean;
  timerNameDuplicate: boolean;
  timerScheduleValid: boolean;
  saveTimer: (functionName: string) => Promise<void>;
  disableTimer: (functionName: string, triggerName: string) => Promise<void>;
  serverDeployments: DeploymentRow[];
  loadDeployments: () => Promise<void>;
};

export function MiniprogramServerPanel({
  tab,
  writable,
  serverBusy,
  serverError,
  functionSearch,
  setFunctionSearch,
  visibleFunctions,
  functionPage,
  setFunctionPage,
  functionPageSize,
  setFunctionPageSize,
  functionHasNext,
  pagedFunctions,
  cbEnvironments,
  functionEnvironment,
  setFunctionEnvironment,
  loadServerFunctions,
  timerFunctionName,
  setTimerFunctionName,
  selectedTimerFunction,
  timerLimitReached,
  timerEditorOpen,
  setTimerEditorOpen,
  timerEditingName,
  setTimerEditingName,
  timerName,
  setTimerName,
  timerSchedule,
  setTimerSchedule,
  timerError,
  setTimerError,
  timerToDelete,
  setTimerToDelete,
  timerNameValid,
  timerNameDuplicate,
  timerScheduleValid,
  saveTimer,
  disableTimer,
  serverDeployments,
  loadDeployments,
}: MiniprogramServerPanelProps) {
  return (
    <>
      {tab === "server" ? (
        <section className="miniprogram-panel miniprogram-server-panel">
          <div
            className="miniprogram-admin-toolbar miniprogram-function-addressbar"
            role="toolbar"
            aria-label="CloudBase 云函数工具栏"
          >
            <button
              type="button"
              className="miniprogram-preview-icon-button"
              title="刷新 CloudBase 云函数"
              aria-label="刷新 CloudBase 云函数"
              disabled={serverBusy}
              onClick={() => void Promise.all([loadServerFunctions(), loadDeployments()])}
            >
              <UiIcon name="refresh" size={14} />
            </button>
            <label className="miniprogram-function-search">
              <UiIcon name="search" size={13} />
              <input
                type="search"
                value={functionSearch}
                placeholder="按函数名搜索"
                aria-label="按函数名搜索 CloudBase 云函数"
                onChange={(event) => setFunctionSearch(event.target.value)}
              />
            </label>
            <div
              className="miniprogram-database-environment"
              role="group"
              aria-label="CloudBase 云函数环境"
            >
              {(["development", "production"] as const).map((environment) => {
                const info = cbEnvironments.find((item) => item.kind === environment);
                const selected = functionEnvironment === environment;
                const label = environment === "production" ? "生产环境" : "开发环境";
                const unavailable = Boolean(cbEnvironments.length && !info?.configured);
                return (
                  <button
                    type="button"
                    key={environment}
                    className={selected ? "is-selected" : ""}
                    aria-pressed={selected}
                    title={
                      info?.inherited
                        ? `${label}（共用开发环境）`
                        : `${label}${info?.envId ? ` ${info.envId}` : "未配置"}`
                    }
                    disabled={serverBusy || unavailable}
                    onClick={() => {
                      if (selected) return;
                      setFunctionEnvironment(environment);
                      setFunctionPage(0);
                      setTimerFunctionName("");
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          {serverError ? <p className="miniprogram-config-error">{serverError}</p> : null}
          <div className="miniprogram-table-content miniprogram-server-content">
            <section className="miniprogram-server-functions" aria-label="CloudBase 云函数列表">
              {pagedFunctions.length ? (
                <div className="miniprogram-function-table-wrap">
                  <table className="miniprogram-function-table">
                    <thead>
                      <tr>
                        <th>函数名</th>
                        <th>描述</th>
                        <th title="函数运行环境，例如 Nodejs20.19、Python3.10">运行时</th>
                        <th>函数类型</th>
                        <th>处理器路径</th>
                        <th>状态</th>
                        <th>更新时间</th>
                        <th>定时任务</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedFunctions.map((item) => {
                        const publishedToProduction = serverDeployments.some(
                          (row) =>
                            row.environment === "production" &&
                            row.status === "succeeded" &&
                            row.version === item.name,
                        );
                        return (
                          <tr key={item.name}>
                            <td className="miniprogram-function-name">{item.name}</td>
                            <td className="miniprogram-function-description">
                              {item.description || "—"}
                            </td>
                            <td title={item.runtime || undefined}>{item.runtime || "—"}</td>
                            <td>{item.type || "—"}</td>
                            <td className="miniprogram-function-handler">{item.handler || "—"}</td>
                            <td>
                              <span
                                className={`miniprogram-status ${item.status === "Active" ? "ok" : "warning"}`}
                              >
                                {item.status === "Active" ? "运行中" : item.status}
                              </span>
                            </td>
                            <td>{item.modifiedAt || item.createdAt || "—"}</td>
                            <td>
                              {item.timers.length ? `${item.timers.length} 个` : "—"}
                              {item.timers.length ? (
                                <div className="miniprogram-function-timer-summary">
                                  {item.timers
                                    .map((timer) => `${timer.name} · ${timer.schedule}`)
                                    .join("；")}
                                </div>
                              ) : null}
                            </td>
                            <td>
                              <button
                                type="button"
                                disabled={!writable}
                                onClick={() => {
                                  setTimerFunctionName(
                                    timerFunctionName === item.name ? "" : item.name,
                                  );
                                  setTimerName("");
                                  setTimerSchedule("");
                                  setTimerError("");
                                }}
                              >
                                <UiIcon name="clock" size={13} />
                                管理定时触发器
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : serverBusy ? null : (
                <p className="muted miniprogram-note">
                  {functionSearch.trim()
                    ? "没有匹配的 CloudBase 云函数。"
                    : "当前环境没有 CloudBase 云函数。"}
                </p>
              )}
              {selectedTimerFunction ? (
                <WorkspaceDialog
                  title={`${timerFunctionName} · 定时触发器`}
                  onClose={() => setTimerFunctionName("")}
                  className="miniprogram-timer-dialog"
                >
                  <section
                    className="miniprogram-function-detail"
                    aria-label={`${timerFunctionName} 的定时触发器`}
                  >
                    <div className="miniprogram-function-detail-head">
                      <span className="miniprogram-function-timer-count">
                        {selectedTimerFunction.timers.length} / 10 个触发器
                      </span>
                    </div>
                    {selectedTimerFunction.timers.length ? (
                      <div className="miniprogram-function-timer-list">
                        {selectedTimerFunction.timers.map((timer) => (
                          <div className="miniprogram-function-timer-row" key={timer.name}>
                            <span className="miniprogram-function-timer-name">{timer.name}</span>
                            <code>{timer.schedule}</code>
                            <span className={timer.enabled ? "miniprogram-timer-active" : "muted"}>
                              {timer.enabled ? "已启用" : "已停用"}
                            </span>
                            <span className="miniprogram-function-timer-actions">
                              <button
                                type="button"
                                disabled={!writable || serverBusy}
                                onClick={() => {
                                  setTimerEditingName(timer.name);
                                  setTimerName(timer.name);
                                  setTimerSchedule(timer.schedule);
                                  setTimerError("");
                                  setTimerEditorOpen(true);
                                }}
                              >
                                修改
                              </button>
                              <button
                                type="button"
                                className="miniprogram-danger"
                                disabled={!writable || serverBusy}
                                aria-label={`删除定时触发器 ${timer.name}`}
                                onClick={() => setTimerToDelete(timer.name)}
                              >
                                删除
                              </button>
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="muted miniprogram-function-timer-empty">尚无定时触发器。</p>
                    )}
                    <div className="miniprogram-timer-create">
                      <button
                        type="button"
                        disabled={!writable || serverBusy || timerLimitReached}
                        onClick={() => {
                          setTimerEditingName(null);
                          setTimerName("");
                          setTimerSchedule("");
                          setTimerError("");
                          setTimerEditorOpen(true);
                        }}
                      >
                        新增定时触发器
                      </button>
                    </div>
                  </section>
                  {timerEditorOpen ? (
                    <WorkspaceDialog
                      title={timerEditingName ? "修改定时触发器" : "新增定时触发器"}
                      onClose={() => setTimerEditorOpen(false)}
                      className="miniprogram-timer-editor-dialog"
                    >
                      <div className="miniprogram-timer-form">
                        <label>
                          <span>名称</span>
                          <input
                            aria-label="定时触发器名称"
                            value={timerName}
                            maxLength={60}
                            placeholder="例如 dailyReport"
                            disabled={!writable || (!timerEditingName && timerLimitReached)}
                            onChange={(event) => {
                              setTimerName(event.target.value);
                              setTimerError("");
                            }}
                          />
                        </label>
                        <label>
                          <span>Cron 表达式</span>
                          <input
                            aria-label="Cron 表达式"
                            value={timerSchedule}
                            placeholder="0 0 9 * * * *"
                            disabled={!writable || (!timerEditingName && timerLimitReached)}
                            onChange={(event) => {
                              setTimerSchedule(event.target.value);
                              setTimerError("");
                            }}
                          />
                        </label>
                        <p className="muted miniprogram-timer-help">
                          {timerLimitReached && !timerEditingName
                            ? "已达到每个 CloudBase 云函数 10 个触发器的上限。"
                            : timerNameDuplicate && !timerEditingName
                              ? "该名称已用于当前 CloudBase 云函数。"
                              : timerName && !timerNameValid
                                ? "名称须以字母开头，只能包含字母、数字、- 和 _，最多 60 个字符。"
                                : timerSchedule && !timerScheduleValid
                                  ? "Cron 需要 7 个字段：秒 分 时 日 月 星期 年。"
                                  : "每个 CloudBase 云函数最多 10 个；Cron 为 7 个字段：秒 分 时 日 月 星期 年。"}
                        </p>
                        {timerError ? (
                          <p className="miniprogram-config-error">{timerError}</p>
                        ) : null}
                        <div className="miniprogram-config-actions">
                          <button type="button" onClick={() => setTimerEditorOpen(false)}>
                            取消
                          </button>
                          <button
                            type="button"
                            disabled={
                              !writable ||
                              serverBusy ||
                              (!timerEditingName && timerLimitReached) ||
                              !timerNameValid ||
                              !timerScheduleValid ||
                              (timerNameDuplicate && timerName.trim() !== timerEditingName)
                            }
                            onClick={() => void saveTimer(timerFunctionName)}
                          >
                            {timerEditingName ? "保存修改" : "创建"}
                          </button>
                        </div>
                      </div>
                    </WorkspaceDialog>
                  ) : null}
                </WorkspaceDialog>
              ) : null}
              {selectedTimerFunction && timerToDelete ? (
                <WorkspaceDialog title="删除定时触发器" onClose={() => setTimerToDelete(null)}>
                  <p>
                    删除后，{selectedTimerFunction.name} 将不再按「{timerToDelete}
                    」的规则定时执行。
                  </p>
                  <div className="miniprogram-config-actions">
                    <button type="button" onClick={() => setTimerToDelete(null)}>
                      取消
                    </button>
                    <button
                      type="button"
                      className="miniprogram-danger"
                      disabled={serverBusy}
                      onClick={() => {
                        const triggerName = timerToDelete;
                        setTimerToDelete(null);
                        void disableTimer(selectedTimerFunction.name, triggerName);
                      }}
                    >
                      删除触发器
                    </button>
                  </div>
                </WorkspaceDialog>
              ) : null}
              <TablePagination
                page={functionPage}
                pageSize={functionPageSize}
                total={visibleFunctions.length}
                hasNext={functionHasNext}
                onPageChange={setFunctionPage}
                onPageSizeChange={(pageSize) => {
                  setFunctionPageSize(pageSize);
                  setFunctionPage(0);
                }}
              />
            </section>
          </div>
        </section>
      ) : null}
    </>
  );
}
