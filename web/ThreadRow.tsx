/**
 * 侧栏里的一行迭代：标题、未读标记、活跃时间与迭代操作菜单。
 * 数据与回调由 WorkspaceApp 打包成 props 传入；t 逐行传入。
 */
import { type Dispatch, type SetStateAction } from "react";
import { RelativeActivityText } from "./LiveClock";
import { ThreadIterationMenu } from "./thread-menus";
import type { PersonalProfile } from "./ProfileFields";
import { localDate } from "./workspace-format";

/** 侧栏行只读取这些字段，因此对上层更宽的迭代对象保持结构兼容。 */
export type ThreadRowModel = {
  id: string;
  title: string;
  status: string;
  creator: string;
  created_by?: string;
  last_active_at: string;
  unread_count?: number;
  unread_mention?: boolean;
};

export type ThreadRowProps = {
  t: ThreadRowModel;
  threadId: string;
  user: PersonalProfile;
  writable: boolean;
  projectLeader: boolean;
  busy: boolean;
  copiedThreadId: string;
  threadRowMenuId: string | null;
  setThreadId: Dispatch<SetStateAction<string>>;
  setThreadListPane: Dispatch<SetStateAction<"active" | "archived" | "create">>;
  setThreadRowMenuId: Dispatch<SetStateAction<string | null>>;
  setThreadDeleteConfirm: Dispatch<SetStateAction<{ id: string; title: string } | null>>;
  setArchiveDialog: Dispatch<SetStateAction<{ id: string; title: string } | null>>;
  archiveActiveThread: (target: { id: string; title: string }) => void;
  copyConversationInfo: (target?: { id: string; title: string }) => Promise<void>;
  restoreArchivedThread: (target: { id: string }) => void;
};

export function ThreadRow({
  t,
  threadId,
  user,
  writable,
  projectLeader,
  busy,
  copiedThreadId,
  threadRowMenuId,
  setThreadId,
  setThreadListPane,
  setThreadRowMenuId,
  setThreadDeleteConfirm,
  setArchiveDialog,
  archiveActiveThread,
  copyConversationInfo,
  restoreArchivedThread,
}: ThreadRowProps) {
  const selected = threadId === t.id;
  const showArchive = t.status === "active" && (t.created_by === user.id || projectLeader);
  const showArchivedActions = t.status === "archived" && writable;
  const showReviewArchive = t.status === "archiving";
  const menuOpen = threadRowMenuId === t.id;
  return (
    <div key={t.id} className={`thread-row ${selected ? "selected" : ""}`}>
      <button
        type="button"
        className="thread-link"
        onClick={() => {
          setThreadId(t.id);
          setThreadListPane(t.status === "archived" ? "archived" : "active");
        }}
      >
        <span className="thread-card-body">
          <strong>{t.title}</strong>
          <span className="thread-card-meta">
            <span title="迭代创建人">{t.creator}</span>
            {t.status === "archiving" && <span className="thread-archiving-badge">归档中</span>}
            {(t.unread_mention || (t.unread_count || 0) > 0) && (
              <span className={"thread-unread" + (t.unread_mention ? " is-mention" : "")}>
                {t.unread_mention ? "@" : ""}
                {t.unread_count || ""}
              </span>
            )}
            <time
              dateTime={t.last_active_at?.replace(" ", "T") + "Z"}
              title={localDate(t.last_active_at)}
            >
              <RelativeActivityText value={t.last_active_at} />
            </time>
          </span>
        </span>
      </button>
      <ThreadIterationMenu
        open={menuOpen}
        onOpenChange={(next) => setThreadRowMenuId(next ? t.id : null)}
        showArchive={showArchive}
        showArchivedActions={showArchivedActions}
        showReviewArchive={showReviewArchive}
        busy={busy}
        copyLabel={copiedThreadId === t.id ? "已复制" : "复制会话"}
        onArchive={() => archiveActiveThread(t)}
        onCopy={() => copyConversationInfo(t)}
        onRestore={() => restoreArchivedThread(t)}
        onDelete={() => setThreadDeleteConfirm({ id: t.id, title: t.title })}
        onReviewArchive={() => setArchiveDialog({ id: t.id, title: t.title })}
      />
    </div>
  );
}
