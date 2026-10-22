import { DialogFilters } from "./DialogFilters";
import { DialogFooter } from "./DialogFooter";
import { DialogBody } from "./DialogBody";
import { DialogHeader } from "./DialogHeader";
import { useEffect, useRef, useState } from "react";
import { Dialog, animateDialogClose } from "./dialog-fx";
import { UiIcon } from "./ui-icon";
import { ProjectActionIcon } from "./workspace-chrome";
import type { Project } from "./workspace-types";
import { ProjectMark } from "./ProjectMark";

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
  const [keyword, setKeyword] = useState("");
  useEffect(() => {
    searchInput.current?.focus();
  }, []);
  const results = projects.filter(
    (p) =>
      !p.tab_visible &&
      `${p.name} ${p.description}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <Dialog
      onRequestClose={onClose}
      enabled={!busy}
      ref={dialog}
      className="project-picker dialog-list"
      aria-labelledby="project-picker-title"
    >
      <DialogHeader
        title={<>添加项目</>}
        titleId="project-picker-title"
        onClose={() => animateDialogClose(dialog.current, onClose)}
        disabled={busy}
        closeLabel="关闭项目列表"
      />
      <DialogFilters
        label="项目列表筛选"
        keyword={{
          value: keyword,
          onChange: setKeyword,
          placeholder: "搜索项目名称或简介",
          inputRef: searchInput,
          autoFocus: true,
        }}
        onQuery={() => setSearch(keyword.trim())}
        onReset={() => {
          setKeyword("");
          setSearch("");
        }}
        disabled={busy}
      />
      <DialogBody>
        <p className="project-picker-hint">选择项目导入到你的页签区。</p>
        <div className="project-picker-list">
          {results.map((p) => (
            <article className="project-picker-card" key={p.id}>
              <div>
                <strong>
                  <ProjectMark name={p.name} image={p.image} size={28} />
                  <span>{p.name}</span>
                </strong>
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
      </DialogBody>
      <DialogFooter>
        <button
          type="button"
          className="project-picker-create"
          disabled={busy}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            animateDialogClose(dialog.current, onCreate);
          }}
        >
          <UiIcon name="plus" size={14} />
          新建我的项目
        </button>
      </DialogFooter>
    </Dialog>
  );
}
