import { useEffect, useRef, useState } from "react";
import { DialogClose, animateDialogClose, onDialogBackdropClick, onDialogCancel } from "./dialog-fx";
import { UiIcon } from "./ui-icon";
import { ProjectActionIcon } from "./workspace-chrome";
import type { Project } from "./workspace-types";

export function ProjectPicker({
  projects,
  busy,
  error,
  onClose,
  onImport,
  onCreate,
}: {
  projects: Project[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onImport: (id: string) => void;
  onCreate: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    searchInput.current?.focus();
  }, []);
  const results = projects.filter(
    (p) =>
      !p.tab_visible &&
      `${p.name} ${p.description}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <dialog
      ref={dialog}
      className="project-picker"
      aria-labelledby="project-picker-title"
      onCancel={onDialogCancel(onClose)}
      onClick={onDialogBackdropClick(onClose, () => !busy)}
    >
      <div className="modal-header">
        <h2 id="project-picker-title">添加项目</h2>
        <DialogClose disabled={busy} onClick={() => animateDialogClose(dialog.current, onClose)} label="关闭项目列表" />
      </div>
      <input
        ref={searchInput}
        autoFocus
        type="search"
        aria-label="搜索项目"
        placeholder="搜索项目名称或简介"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <p className="project-picker-hint">选择项目导入到你的页签区。</p>
      <div className="project-picker-list">
        {results.map((p) => (
          <article className="project-picker-card" key={p.id}>
            <div>
              <strong>{p.name}</strong>
              <p>{p.description || "暂无项目简介"}</p>
            </div>
            <button
              disabled={busy}
              title={`导入 ${p.name}`}
              aria-label={`导入 ${p.name}`}
              onClick={() => onImport(p.id)}
            >
              <ProjectActionIcon action="import" />
            </button>
          </article>
        ))}
        {!results.length && (
          <p className="project-picker-empty">
            {search.trim() ? "没有找到匹配的项目" : "暂无可导入的项目"}
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="project-picker-footer">
        <button className="project-picker-create" disabled={busy} onClick={onCreate}>
          <UiIcon name="plus" size={14} />
          新建我的项目
        </button>
      </div>
    </dialog>
  );
}
