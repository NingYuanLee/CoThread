export type DocumentChange = {
  id: string;
  action: string;
  source: string;
  actor_type?: string;
  actor_name?: string | null;
  artifact_title?: string | null;
  version_filename?: string | null;
  folder_name?: string | null;
  details?: Record<string, unknown>;
  created_at: string;
};

export function DocumentChangeLogList({
  changes,
  loading,
  error,
  actionLabels,
  sourceLabels,
}: {
  changes: DocumentChange[];
  loading: boolean;
  error: string;
  actionLabels: Record<string, string>;
  sourceLabels: Record<string, string>;
}) {
  return (
    <div className="document-change-log-list">
      <div className="document-change-log-list-head" aria-hidden="true">
        <span>操作</span>
        <span>文档 / 文件夹</span>
        <span>操作人 / 来源</span>
        <span>时间</span>
      </div>
      <div
        className={`document-change-log-rows${loading && changes.length && !error ? " is-refreshing" : ""}`}
        aria-busy={loading}
      >
        {error ? (
          <p className="error document-change-log-state" role="alert">
            {error}
          </p>
        ) : changes.length ? (
          changes.map((item) => (
            <article className="document-change-log-item" key={item.id}>
              <strong>{actionLabels[item.action] || item.action}</strong>
              <span className="document-change-log-target">
                {item.artifact_title ||
                  item.version_filename ||
                  item.folder_name ||
                  String(
                    item.details?.title ||
                      item.details?.filename ||
                      item.details?.affectedFolderName ||
                      "文档库",
                  )}
              </span>
              <span className="document-change-log-actor">
                {item.actor_name || (item.actor_type === "agent" ? "Agent" : "系统")} ·{" "}
                {sourceLabels[item.source] || item.source}
              </span>
              <time>{new Date(item.created_at).toLocaleString("zh-CN")}</time>
            </article>
          ))
        ) : (
          <p className="muted document-change-log-state">
            {loading ? "正在读取操作日志…" : "暂无文档操作记录。"}
          </p>
        )}
      </div>
    </div>
  );
}
