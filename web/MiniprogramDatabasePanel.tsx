/**
 * 小程序工作区的云数据库页：环境、集合、筛选与分页查询。
 */
import { type Dispatch, type SetStateAction } from "react";
import {
  DatabaseFilterBuilder,
  databaseFilterCount,
  type DatabaseFilterSpec,
} from "./DatabaseFilterBuilder";
import {
  TablePagination,
  WorkspaceDialog,
  databaseCell,
  type CloudbaseEnvInfo,
  type DatabaseEnvironment,
  type MiniProgramTabId,
} from "./miniprogram-internals";
import { UiIcon } from "./ui-icon";

export type MiniprogramDatabasePanelProps = {
  tab: MiniProgramTabId;
  setTab: Dispatch<SetStateAction<MiniProgramTabId>>;
  dbEnvironment: DatabaseEnvironment;
  setDbEnvironment: Dispatch<SetStateAction<DatabaseEnvironment>>;
  switchDatabaseEnvironment: (environment: DatabaseEnvironment) => void;
  browseBusy: "collections" | "files" | null;
  setBrowseBusy: Dispatch<SetStateAction<"collections" | "files" | null>>;
  loadCollections: () => Promise<void>;
  collections: string[];
  setCollections: Dispatch<SetStateAction<string[]>>;
  cbEnvironments: CloudbaseEnvInfo[];
  dbCollection: string;
  setDbCollection: Dispatch<SetStateAction<string>>;
  openDocumentCollection: (name: string) => void;
  dbFilter: DatabaseFilterSpec | null;
  setDbFilter: Dispatch<SetStateAction<DatabaseFilterSpec | null>>;
  dbFilterOpen: boolean;
  setDbFilterOpen: Dispatch<SetStateAction<boolean>>;
  browseError: string;
  setBrowseError: Dispatch<SetStateAction<string>>;
  dbError: string;
  setDbError: Dispatch<SetStateAction<string>>;
  dbDocs: Array<Record<string, unknown>>;
  documentColumns: string[];
  dbPage: number;
  setDbPage: Dispatch<SetStateAction<number>>;
  dbLimit: number;
  setDbLimit: Dispatch<SetStateAction<number>>;
  dbTotal: number | null;
  dbHasNext: boolean;
  setDbHasNext: Dispatch<SetStateAction<boolean>>;
  runDbQuery: (
    collectionName?: string,
    filter?: DatabaseFilterSpec | null,
    page?: number,
    limit?: number,
  ) => Promise<void>;
};

export function MiniprogramDatabasePanel({
  tab,
  dbEnvironment,
  switchDatabaseEnvironment,
  browseBusy,
  loadCollections,
  collections,
  cbEnvironments,
  dbCollection,
  openDocumentCollection,
  dbFilter,
  setDbFilter,
  dbFilterOpen,
  setDbFilterOpen,
  browseError,
  dbError,
  dbDocs,
  documentColumns,
  dbPage,
  setDbPage,
  dbLimit,
  setDbLimit,
  dbTotal,
  dbHasNext,
  runDbQuery,
}: MiniprogramDatabasePanelProps) {
  return (
    <>
      {tab === "database" ? (
        <section className="miniprogram-panel miniprogram-database-panel">
          <div
            className="miniprogram-admin-toolbar miniprogram-database-toolbar"
            role="toolbar"
            aria-label="云数据库工具栏"
          >
            <button
              type="button"
              className="miniprogram-preview-icon-button"
              title={`刷新${dbEnvironment === "production" ? "生产" : "开发"}环境集合`}
              aria-label={`刷新${dbEnvironment === "production" ? "生产" : "开发"}环境集合`}
              disabled={browseBusy !== null}
              onClick={() => void loadCollections()}
            >
              <UiIcon name="refresh" size={14} />
            </button>
            <div className="miniprogram-admin-address miniprogram-database-address">
              <UiIcon name="layers" size={13} />
              <select
                aria-label="集合"
                value={dbCollection}
                disabled={browseBusy === "collections" || !collections.length}
                onChange={(event) => openDocumentCollection(event.target.value)}
              >
                {collections.length ? null : <option value="">暂无集合</option>}
                {collections.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="miniprogram-database-environment" role="group" aria-label="数据库环境">
              {(["development", "production"] as const).map((environment) => {
                const info = cbEnvironments.find((item) => item.kind === environment);
                const selected = dbEnvironment === environment;
                const label = environment === "production" ? "生产环境" : "开发环境";
                const unavailable = Boolean(cbEnvironments.length && !info?.configured);
                const title = info?.inherited
                  ? `${label}（共用开发环境 ${info.envId || ""}）`
                  : info?.envId
                    ? `${label} ${info.envId}`
                    : `${label}未配置`;
                return (
                  <button
                    type="button"
                    key={environment}
                    className={selected ? "is-selected" : ""}
                    aria-pressed={selected}
                    title={title}
                    disabled={browseBusy !== null || unavailable}
                    onClick={() => switchDatabaseEnvironment(environment)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className={`miniprogram-preview-icon-button ${databaseFilterCount(dbFilter) ? "is-active" : ""}`}
              title={
                databaseFilterCount(dbFilter) ? `筛选 · ${databaseFilterCount(dbFilter)}` : "筛选"
              }
              aria-label={
                databaseFilterCount(dbFilter) ? `筛选 · ${databaseFilterCount(dbFilter)}` : "筛选"
              }
              disabled={!dbCollection}
              onClick={() => setDbFilterOpen(true)}
            >
              <UiIcon name="filter" size={14} />
            </button>
          </div>
          <div className="miniprogram-database-content">
            {browseError ? <p className="miniprogram-config-error">{browseError}</p> : null}
            {dbError ? <p className="miniprogram-config-error">{dbError}</p> : null}
            <div className="miniprogram-database-table-wrap">
              <table className="miniprogram-database-table">
                <thead>
                  <tr>
                    {documentColumns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dbDocs.map((document, index) => (
                    <tr key={String(document._id || index)}>
                      {documentColumns.map((column) => (
                        <td key={column}>{databaseCell(document[column])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={dbPage}
              pageSize={dbLimit}
              total={dbTotal}
              hasNext={dbHasNext}
              onPageChange={(page) => void runDbQuery(dbCollection, dbFilter, page)}
              onPageSizeChange={(pageSize) => {
                setDbLimit(pageSize);
                setDbPage(0);
                void runDbQuery(dbCollection, dbFilter, 0, pageSize);
              }}
            />
          </div>
          {dbFilterOpen ? (
            <WorkspaceDialog
              title="筛选"
              className="miniprogram-filter-dialog"
              onClose={() => setDbFilterOpen(false)}
            >
              <DatabaseFilterBuilder
                value={dbFilter}
                fieldOptions={documentColumns}
                onCancel={() => setDbFilterOpen(false)}
                onApply={(filter) => {
                  setDbFilter(filter);
                  setDbFilterOpen(false);
                  setDbPage(0);
                  void runDbQuery(dbCollection, filter, 0);
                }}
              />
            </WorkspaceDialog>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
