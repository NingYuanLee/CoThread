import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { fileDisplayName } from "../shared/document-name.js";
import {
  LIBRARY_ROOT_KINDS,
  LIBRARY_ROOT_LABELS,
  folderRootKind,
  libraryFolderPath,
} from "./document-library";
import { DialogClose, ModalBackdrop } from "./dialog-fx";
import { UiIcon } from "./ui-icon";

export type LibraryPickerFolder = {
  id: string;
  parent_id: string | null;
  name: string;
  folder_kind?: string | null;
};

export type LibraryPickerFile = {
  id: string;
  artifact_id: string;
  folder_id?: string | null;
  title: string;
  filename: string;
  deleted_at?: string | null;
};

export type LibraryPickerValue = {
  fileIds: string[];
  folderIds: string[];
};

export type LibraryPickerRootKind = (typeof LIBRARY_ROOT_KINDS)[number];

const collator = new Intl.Collator("zh-CN");

function TreeIcon({ kind }: { kind: "expand" | "collapse" | "file" }) {
  const paths = {
    expand: "m9 6 6 6-6 6",
    collapse: "m6 9 6 6 6-6",
    file: "M6 3h8l4 4v14H6Z M14 3v5h5",
  };
  return (
    <svg aria-hidden="true" className="tree-icon" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[kind]} />
    </svg>
  );
}

function ClosedFolderIcon() {
  return (
    <svg aria-hidden="true" className="tree-icon" viewBox="0 0 24 24" width={16} height={16}
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.4 19.6V6.9c0-.9.7-1.6 1.6-1.6h4c.4 0 .8.16 1.05.44L11.6 7.5h7.4c.9 0 1.6.7 1.6 1.6v10.5c0 .9-.7 1.6-1.6 1.6H5c-.9 0-1.6-.7-1.6-1.6Z" />
    </svg>
  );
}

function OpenFolderIcon() {
  return (
    <svg aria-hidden="true" className="tree-icon" viewBox="0 0 24 24" width={16} height={16}
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.2 9.2V7.1c0-.9.7-1.6 1.6-1.6h3.5c.4 0 .8.15 1.05.42L10.7 7.4h8.1c.9 0 1.6.7 1.6 1.6v1.1" />
      <path d="M3.15 10.7h17.7c.8 0 1.4.74 1.23 1.52l-1.58 7.05A1.7 1.7 0 0 1 18.85 20.8H5.15a1.7 1.7 0 0 1-1.65-1.53l-1.58-7.05A1.26 1.26 0 0 1 3.15 10.7Z" />
    </svg>
  );
}

function uniqueLatestFiles(files: LibraryPickerFile[]) {
  return files.filter((file, index, all) =>
    !file.deleted_at
    && all.findIndex((item) => item.artifact_id === file.artifact_id) === index);
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids.filter((id) => typeof id === "string" && id))];
}

function folderDescendantIds(rootId: string, folders: LibraryPickerFolder[]) {
  const children = new Map<string, string[]>();
  for (const folder of folders) {
    if (!folder.parent_id) continue;
    const list = children.get(folder.parent_id) || [];
    list.push(folder.id);
    children.set(folder.parent_id, list);
  }
  const ids = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const current = stack.pop()!;
    for (const child of children.get(current) || []) {
      if (ids.has(child)) continue;
      ids.add(child);
      stack.push(child);
    }
  }
  return ids;
}

function isFolderInside(folderId: string | null | undefined, ancestorId: string, folders: LibraryPickerFolder[]) {
  if (!folderId) return false;
  let current = folders.find((folder) => folder.id === folderId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    if (current.id === ancestorId) return true;
    seen.add(current.id);
    current = current.parent_id ? folders.find((folder) => folder.id === current?.parent_id) : undefined;
  }
  return false;
}

function coveredFolderIds(folderIds: string[], folders: LibraryPickerFolder[]) {
  const covered = new Set<string>();
  for (const id of folderIds) {
    for (const descendant of folderDescendantIds(id, folders)) covered.add(descendant);
  }
  return covered;
}

export function calibrateLibraryPickerValue(
  value: LibraryPickerValue,
  folders: LibraryPickerFolder[],
  files: LibraryPickerFile[],
): LibraryPickerValue {
  const selectedFolders = uniqueIds(value.folderIds);
  const folderIds = selectedFolders.filter((id) =>
    !selectedFolders.some((other) => other !== id && isFolderInside(id, other, folders)));
  const covered = coveredFolderIds(folderIds, folders);
  const fileById = new Map(uniqueLatestFiles(files).map((file) => [file.id, file]));
  const fileIds = uniqueIds(value.fileIds).filter((id) => {
    const file = fileById.get(id);
    return !file?.folder_id || !covered.has(file.folder_id);
  });
  return { fileIds, folderIds };
}

export function libraryPickerSelectionItems(
  value: LibraryPickerValue,
  folders: LibraryPickerFolder[],
  files: LibraryPickerFile[],
) {
  const calibrated = calibrateLibraryPickerValue(value, folders, files);
  const fileById = new Map(uniqueLatestFiles(files).map((file) => [file.id, file]));
  return [
    ...calibrated.folderIds.map((id) => {
      const folder = folders.find((item) => item.id === id);
      return {
        id,
        kind: "folder" as const,
        label: folder ? libraryFolderPath(id, folders) || folder.name : id,
      };
    }),
    ...calibrated.fileIds.map((id) => {
      const file = fileById.get(id);
      return {
        id,
        kind: "file" as const,
        label: file ? fileDisplayName(file) : id,
      };
    }),
  ];
}

type LibraryPickerProps = {
  folders: LibraryPickerFolder[];
  files: LibraryPickerFile[];
  value: LibraryPickerValue;
  onChange: (next: LibraryPickerValue) => void;
  rootKinds?: LibraryPickerRootKind[];
  allowFiles?: boolean;
  allowFolders?: boolean;
  multiple?: boolean;
  maxFiles?: number;
  maxFolders?: number;
  selectableRoot?: boolean;
  searchPlaceholder?: string;
  emptyLabel?: string;
  showChips?: boolean;
};

export function LibraryPicker({
  folders,
  files,
  value,
  onChange,
  rootKinds = ["project_official"],
  allowFiles = true,
  allowFolders = true,
  multiple = true,
  maxFiles = 30,
  maxFolders = 30,
  selectableRoot = true,
  searchPlaceholder = "搜索文件或文件夹",
  emptyLabel = "暂无可选的项目文档",
  showChips = true,
}: LibraryPickerProps) {
  const groupName = useId();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const initialized = useRef(false);
  const kindSet = useMemo(() => new Set(rootKinds), [rootKinds]);
  const scopedFolders = useMemo(
    () => folders.filter((folder) => {
      const kind = folderRootKind(folder.id, folders);
      return kind != null && kindSet.has(kind as LibraryPickerRootKind);
    }),
    [folders, kindSet],
  );
  const scopedFiles = useMemo(
    () => uniqueLatestFiles(files).filter((file) => {
      const kind = folderRootKind(file.folder_id, folders);
      return kind != null && kindSet.has(kind as LibraryPickerRootKind);
    }),
    [files, folders, kindSet],
  );
  const roots = useMemo(
    () => scopedFolders
      .filter((folder) => !folder.parent_id && kindSet.has(folder.folder_kind as LibraryPickerRootKind))
      .sort((a, b) => rootKinds.indexOf(a.folder_kind as LibraryPickerRootKind)
        - rootKinds.indexOf(b.folder_kind as LibraryPickerRootKind)),
    [scopedFolders, kindSet, rootKinds],
  );

  useEffect(() => {
    if (initialized.current || !scopedFolders.length) return;
    initialized.current = true;
    setCollapsed(new Set(scopedFolders.filter((folder) => folder.parent_id).map((folder) => folder.id)));
  }, [scopedFolders]);

  const needle = query.trim().toLowerCase();
  const folderById = useMemo(() => new Map(scopedFolders.map((folder) => [folder.id, folder])), [scopedFolders]);

  const visible = useMemo(() => {
    if (!needle) {
      return {
        folders: new Set(scopedFolders.map((folder) => folder.id)),
        files: new Set(scopedFiles.map((file) => file.id)),
        expand: new Set(roots.map((root) => root.id)),
      };
    }
    const matchedFolders = new Set<string>();
    const matchedFiles = new Set<string>();
    const expand = new Set<string>();
    const addAncestors = (folderId: string | null | undefined) => {
      let current = folderId ? folderById.get(folderId) : undefined;
      while (current) {
        expand.add(current.id);
        matchedFolders.add(current.id);
        current = current.parent_id ? folderById.get(current.parent_id) : undefined;
      }
    };
    for (const folder of scopedFolders) {
      const label = LIBRARY_ROOT_LABELS[folder.folder_kind as LibraryPickerRootKind] || folder.name;
      if (`${folder.name} ${label}`.toLowerCase().includes(needle)) {
        matchedFolders.add(folder.id);
        addAncestors(folder.parent_id);
        expand.add(folder.id);
      }
    }
    for (const file of scopedFiles) {
      if (fileDisplayName(file).toLowerCase().includes(needle)) {
        matchedFiles.add(file.id);
        addAncestors(file.folder_id);
      }
    }
    return { folders: matchedFolders, files: matchedFiles, expand };
  }, [needle, scopedFolders, scopedFiles, roots, folderById]);

  const isCollapsed = (id: string) => (needle ? !visible.expand.has(id) : collapsed.has(id));
  const toggleCollapsed = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const covered = useMemo(
    () => coveredFolderIds(value.folderIds, scopedFolders),
    [value.folderIds, scopedFolders],
  );
  const fileCovered = (file: LibraryPickerFile) => !!file.folder_id && covered.has(file.folder_id);
  const folderCovered = (folderId: string) => covered.has(folderId) && !value.folderIds.includes(folderId);

  const emit = (fileIds: string[], folderIds: string[]) => {
    onChange(calibrateLibraryPickerValue({ fileIds, folderIds }, scopedFolders, scopedFiles));
  };

  const toggleFile = (id: string) => {
    if (!allowFiles) return;
    const file = scopedFiles.find((item) => item.id === id);
    if (file && fileCovered(file) && !value.fileIds.includes(id)) return;
    if (multiple) {
      if (value.fileIds.includes(id)) {
        emit(value.fileIds.filter((item) => item !== id), value.folderIds);
        return;
      }
      if (value.fileIds.length >= maxFiles) return;
      emit([...value.fileIds, id], value.folderIds);
      return;
    }
    emit(value.fileIds[0] === id ? [] : [id], []);
  };

  const toggleFolder = (id: string) => {
    if (!allowFolders) return;
    if (folderCovered(id)) return;
    if (multiple) {
      if (value.folderIds.includes(id)) {
        emit(value.fileIds, value.folderIds.filter((item) => item !== id));
        return;
      }
      if (value.folderIds.length >= maxFolders) return;
      emit(value.fileIds, [...value.folderIds, id]);
      return;
    }
    emit([], value.folderIds[0] === id ? [] : [id]);
  };

  const fileLimitReached = multiple && value.fileIds.length >= maxFiles;
  const folderLimitReached = multiple && value.folderIds.length >= maxFolders;
  const inputType = multiple ? "checkbox" : "radio";
  const maxTotal = (allowFiles ? maxFiles : 0) + (allowFolders ? maxFolders : 0);

  const childrenOf = (parentId: string) => scopedFolders
    .filter((folder) => folder.parent_id === parentId && visible.folders.has(folder.id))
    .sort((a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id));
  const filesOf = (parentId: string) => scopedFiles
    .filter((file) => (file.folder_id || null) === parentId && visible.files.has(file.id))
    .sort((a, b) => collator.compare(fileDisplayName(a), fileDisplayName(b)) || a.id.localeCompare(b.id));

  const checkControl = (opts: {
    selected: boolean;
    disabled: boolean;
    onToggle: () => void;
  }) => (
    <label className="library-picker-check">
      <input
        type={inputType}
        name={multiple ? undefined : groupName}
        checked={opts.selected}
        disabled={opts.disabled}
        onChange={opts.onToggle}
      />
      <span />
    </label>
  );

  const renderBranch = (parentId: string, depth: number): ReactNode => (
    <>
      {childrenOf(parentId).map((folder) => {
        const implied = folderCovered(folder.id);
        const selectable = allowFolders && !implied;
        const selected = value.folderIds.includes(folder.id) || implied;
        const expanded = !isCollapsed(folder.id);
        return (
          <div key={folder.id} role="treeitem" aria-expanded={expanded} aria-selected={selectable ? selected : undefined}>
            <div className={`tree-folder library-picker-row${selected ? " selected" : ""}`}>
              <span className="tree-depth" style={{ width: depth * 14 }} aria-hidden="true" />
              <button
                type="button"
                className={`tree-toggle tree-folder-toggle${expanded ? " expanded" : ""}`}
                aria-label={`${expanded ? "折叠" : "展开"} ${folder.name}`}
                onClick={() => toggleCollapsed(folder.id)}
              >
                <span className="folder-toggle-icon icon-idle">{expanded ? <OpenFolderIcon /> : <ClosedFolderIcon />}</span>
                <span className="folder-toggle-icon icon-hover"><TreeIcon kind={expanded ? "collapse" : "expand"} /></span>
              </button>
              {allowFolders
                ? checkControl({
                  selected,
                  disabled: implied || (!value.folderIds.includes(folder.id) && folderLimitReached),
                  onToggle: () => toggleFolder(folder.id),
                })
                : <span className="library-picker-check-spacer" aria-hidden="true" />}
              <button type="button" className="tree-name" onClick={() => (selectable ? toggleFolder(folder.id) : toggleCollapsed(folder.id))}>
                <span>{folder.name}</span>
              </button>
            </div>
            {expanded ? <div role="group">{renderBranch(folder.id, depth + 1)}</div> : null}
          </div>
        );
      })}
      {filesOf(parentId).map((file) => {
        const implied = fileCovered(file);
        const selected = value.fileIds.includes(file.id) || implied;
        const name = fileDisplayName(file);
        return (
          <div
            key={file.id}
            className={`tree-file library-picker-row${selected ? " selected" : ""}`}
            role="treeitem"
            aria-selected={allowFiles ? selected : undefined}
          >
            <span className="tree-depth" style={{ width: depth * 14 }} aria-hidden="true" />
            <span className="library-picker-file-icon" aria-hidden="true"><TreeIcon kind="file" /></span>
            {allowFiles
              ? checkControl({
                selected,
                disabled: implied || (!selected && fileLimitReached),
                onToggle: () => toggleFile(file.id),
              })
              : <span className="library-picker-check-spacer" aria-hidden="true" />}
            <button type="button" className="tree-name" disabled={!allowFiles || implied} onClick={() => toggleFile(file.id)}>
              <span>{name}</span>
            </button>
          </div>
        );
      })}
    </>
  );

  const renderRoot = (root: LibraryPickerFolder) => {
    const selectable = allowFolders && selectableRoot;
    const selected = value.folderIds.includes(root.id);
    const expanded = !isCollapsed(root.id);
    const name = LIBRARY_ROOT_LABELS[root.folder_kind as LibraryPickerRootKind] || root.name;
    if (needle && !visible.folders.has(root.id)) return null;
    return (
      <div key={root.id} role="treeitem" aria-expanded={expanded} aria-selected={selectable ? selected : undefined}>
        <div className={`tree-folder tree-library-root library-picker-row${selected ? " selected" : ""}`}>
          <button
            type="button"
            className={`tree-toggle tree-folder-toggle${expanded ? " expanded" : ""}`}
            aria-label={`${expanded ? "折叠" : "展开"} ${name}`}
            onClick={() => toggleCollapsed(root.id)}
          >
            <span className="folder-toggle-icon icon-idle">{expanded ? <OpenFolderIcon /> : <ClosedFolderIcon />}</span>
            <span className="folder-toggle-icon icon-hover"><TreeIcon kind={expanded ? "collapse" : "expand"} /></span>
          </button>
          {selectable
            ? checkControl({ selected, disabled: !selected && folderLimitReached, onToggle: () => toggleFolder(root.id) })
            : <span className="library-picker-check-spacer" aria-hidden="true" />}
          <button type="button" className="tree-name" onClick={() => (selectable ? toggleFolder(root.id) : toggleCollapsed(root.id))}>
            <span>{name}</span>
          </button>
        </div>
        {expanded ? <div role="group">{renderBranch(root.id, 1)}</div> : null}
      </div>
    );
  };

  const selectedChips = libraryPickerSelectionItems(value, folders, files);
  const tree = roots.map(renderRoot).filter(Boolean);

  return (
    <div className="library-picker">
      <div className="library-picker-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
        />
        {selectedChips.length ? (
          <small>已选 {selectedChips.length}{multiple ? ` / ${maxTotal}` : ""}</small>
        ) : null}
      </div>
      {showChips && selectedChips.length ? (
        <div className="library-picker-chips" aria-label="已选文档">
          {selectedChips.map((item) => (
            <span className={`ref library-picker-chip is-${item.kind}`} key={`${item.kind}-${item.id}`}>
              {item.kind === "folder" ? "文件夹 · " : ""}{item.label}
              <button
                type="button"
                className="ref-remove"
                aria-label={`取消选择 ${item.label}`}
                onClick={() => (item.kind === "folder" ? toggleFolder(item.id) : toggleFile(item.id))}
              >×</button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="library-picker-tree" role="tree" aria-multiselectable={multiple}>
        {tree.length ? tree : <p className="library-picker-empty">{emptyLabel}</p>}
      </div>
    </div>
  );
}

export function LibraryPickerDialog({
  title = "选择项目文档",
  description,
  confirmLabel = "确定",
  value,
  onConfirm,
  onClose,
  ...pickerProps
}: Omit<LibraryPickerProps, "onChange"> & {
  title?: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: (next: LibraryPickerValue) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  return createPortal(
    <ModalBackdrop className="library-picker-backdrop" onClose={onClose}>
      {(close) => (
        <section
          className="library-picker-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="library-picker-dialog-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header>
            <div>
              <h2 id="library-picker-dialog-title">{title}</h2>
              {description ? <p>{description}</p> : null}
            </div>
            <DialogClose onClick={close} label="关闭文档选择" />
          </header>
          <div className="library-picker-dialog-body">
            <LibraryPicker {...pickerProps} value={draft} onChange={setDraft} />
          </div>
          <div className="library-picker-dialog-actions">
            <button type="button" onClick={close}>取消</button>
            <button type="button" className="primary" onClick={() => { onConfirm(draft); close(); }}>{confirmLabel}</button>
          </div>
        </section>
      )}
    </ModalBackdrop>,
    document.body,
  );
}

export function LibraryPickerField({
  label,
  buttonLabel,
  dialogTitle,
  dialogDescription,
  value,
  onChange,
  folders,
  files,
  ...pickerProps
}: Omit<LibraryPickerProps, "showChips"> & {
  label?: string;
  buttonLabel?: string;
  dialogTitle?: string;
  dialogDescription?: string;
}) {
  const [open, setOpen] = useState(false);
  const chips = libraryPickerSelectionItems(value, folders, files);
  const defaultButton = pickerProps.allowFolders === false
    ? "选择文件"
    : pickerProps.allowFiles === false
      ? "选择文件夹"
      : "选择文件或文件夹";
  return (
    <div className="library-picker-field">
      {label ? <span>{label}</span> : null}
      <button type="button" className="library-picker-open" onClick={() => setOpen(true)}>
        <UiIcon name="folder" size={13} />
        {buttonLabel || defaultButton}
      </button>
      {chips.length ? (
        <div className="library-picker-chips" aria-label="已选文档">
          {chips.map((item) => (
            <span className={`ref library-picker-chip is-${item.kind}`} key={`${item.kind}-${item.id}`}>
              {item.kind === "folder" ? "文件夹 · " : ""}{item.label}
              <button
                type="button"
                className="ref-remove"
                aria-label={`取消选择 ${item.label}`}
                onClick={() => onChange(calibrateLibraryPickerValue({
                  fileIds: item.kind === "file" ? value.fileIds.filter((id) => id !== item.id) : value.fileIds,
                  folderIds: item.kind === "folder" ? value.folderIds.filter((id) => id !== item.id) : value.folderIds,
                }, folders, files))}
              >×</button>
            </span>
          ))}
        </div>
      ) : null}
      {open ? (
        <LibraryPickerDialog
          {...pickerProps}
          folders={folders}
          files={files}
          title={dialogTitle || (label ? `选择${label}` : "选择项目文档")}
          description={dialogDescription}
          value={value}
          onConfirm={onChange}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
