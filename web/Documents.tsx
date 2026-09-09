import { readJsonResponse } from "../shared/json-response.js";
import { apiFetch } from "./api-fetch";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileIcon, FolderIcon } from "@react-symbols/icons/utils";
import { Document, Notebook } from "@react-symbols/icons/files";
const officeIcons = {
  doc: Document,
  docx: Document,
  odt: Document,
  rtf: Document,
  ppt: Notebook,
  pptx: Notebook,
  odp: Notebook,
};

function TreeIcon({ kind }: { kind: string }) {
  const paths: Record<string, string> = {
    folder: "M3 6h6l2 2h10v11H3Z",
    file: "M6 3h8l4 4v14H6Z M14 3v5h5",
    chevron: "m9 5 6 7-6 7",
    newFolder: "M3 6h6l2 2h10v11H3Z M12 11v5 M9.5 13.5h5",
    newFile: "M6 3h8l4 4v14H6Z M9 14h6 M12 11v6",
    upload: "M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6",
    trash: "M4 6h16 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7",
    back: "m9 5-6 7 6 7 M3 12h18",
    rename: "m14 4 6 6 M4 20l4-1L21 6a2 2 0 0 0-3-3L5 16Z",
  };
  return (
    <svg
      aria-hidden="true"
      className="tree-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[kind] || paths.file} />
    </svg>
  );
}

export type LibraryVersion = {
  id: string;
  artifact_id: string;
  folder_id?: string | null;
  deleted_at?: string | null;
  updated_at?: string;
  title: string;
  version: number;
  filename: string;
  review: string | null;
  byte_size: number;
  author: string;
  thread_id: string;
};
function fileLabel(version: LibraryVersion) {
  const dot = version.filename.lastIndexOf(".");
  const suffix = dot > 0 && dot < version.filename.length - 1
    ? version.filename.slice(dot)
    : "";
  return suffix && !version.title.toLowerCase().endsWith(suffix.toLowerCase())
    ? `${version.title}${suffix}`
    : version.title;
}
export function Documents({
  embedded = false,
  onNewVersion,
  onOpen,
  onReview,
  projectId,
  threadId,
  writable,
  folders,
  onRefresh,
  versions,
  selected,
  onSelect,
  onClose,
  onReference,
  onUpload,
}: {
  embedded?: boolean;
  onOpen?: (versionId: string) => void;
  onNewVersion?: (artifactId: string) => void;
  onReview?: (versionId: string, decision: string) => Promise<void>;
  projectId: string;
  threadId?: string;
  writable: boolean;
  folders: {
    id: string;
    parent_id: string | null;
    name: string;
    updated_at?: string;
    system_key?: string | null;
  }[];
  onRefresh: () => Promise<void>;
  versions: LibraryVersion[];
  selected: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onReference?: (id: string) => void;
  onUpload?: () => void;
}) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [trash, setTrash] = useState(false);
  const draggedFile = useRef<LibraryVersion | null>(null);
  const moveLock = useRef(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const clearDrag = () => {
    draggedFile.current = null;
    setDraggingId(null);
    setDropTarget(null);
  };
  const canDrop = (target: string | null) =>
    writable &&
    !folders.find((f) => f.id === target)?.system_key &&
    !trash &&
    !pending &&
    !moveLock.current &&
    draggedFile.current &&
    (draggedFile.current.folder_id || null) !== target;
  const dropProps = (target: string | null) => ({
    onDragOver: (event: React.DragEvent<HTMLElement>) => {
      if (!canDrop(target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setDropTarget(target || "root");
    },
    onDragLeave: (event: React.DragEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null))
        setDropTarget(null);
    },
    onDrop: (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const file = draggedFile.current;
      if (!file || !canDrop(target)) {
        clearDrag();
        return;
      }
      clearDrag();
      moveLock.current = true;
      void act(async () => {
        await change(
          `/projects/${projectId}/artifacts/${file.artifact_id}`,
          { folderId: target },
          "PATCH",
        );
        setFolderId(target);
        onSelect(file.id);
        setFilter("");
        if (target)
          setCollapsed((previous) => {
            const next = new Set(previous);
            next.delete(target);
            return next;
          });
      }).finally(() => {
        moveLock.current = false;
      });
    },
  });
  const [sort, setSort] = useState<"type" | "modified">("type");
  const collator = new Intl.Collator("zh-CN", {
    numeric: true,
    sensitivity: "base",
  });
  const modified = (a: { updated_at?: string }, b: { updated_at?: string }) =>
    (b.updated_at || "").localeCompare(a.updated_at || "");
  const extension = (filename: string) =>
    filename.includes(".")
      ? filename.split(".").pop()?.toLowerCase() || ""
      : "";

  const [pending, setPending] = useState(false);
  const [operation, setOperation] = useState<
    "folder" | "document" | "rename-folder" | "rename-document" | null
  >(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [actionError, setActionError] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const change = async (path: string, data: unknown, method = "POST") => {
    const res = await apiFetch(`/api${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await readJsonResponse(res, `/api${path}`);
    return result;
  };
  const act = async (fn: () => Promise<void>) => {
    setPending(true);
    setActionError("");
    try {
      await fn();
      await onRefresh();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setPending(false);
    }
  };
  const editArtifact = (data: unknown) =>
    act(async () => {
      if (!version) return;
      await change(
        `/projects/${projectId}/artifacts/${version.artifact_id}`,
        data,
        "PATCH",
      );
    });
  const begin = (kind: typeof operation, value = "") => {
    setOperation(kind);
    setName(value);
    setContent("");
    setActionError("");
  };
  const save = () =>
    act(async () => {
      if (operation === "folder") {
        const created = await change(`/projects/${projectId}/folders`, {
          name,
          parentId: folderId,
        });
        setCollapsed(new Set());
        setFolderId(created.id);
      }
      if (operation === "rename-folder")
        await change(
          `/projects/${projectId}/folders/${folderId}`,
          { name },
          "PATCH",
        );
      if (operation === "rename-document" && version)
        await change(
          `/projects/${projectId}/artifacts/${version.artifact_id}`,
          { name },
          "PATCH",
        );
      if (operation === "document") {
        const filename = /\.(md|txt)$/i.test(name) ? name : name + ".md";
        const bytes = new TextEncoder().encode(content);
        if (bytes.length > 5 * 1024 * 1024) throw new Error("单文件上限 5 MiB");
        const result = await change(`/threads/${threadId}/versions`, {
          title: name,
          filename,
          mime: "text/markdown",
          contentBase64: encode(bytes),
          folderId,
        });
        onSelect(result.id);
      }
      setOperation(null);
    });
  const encode = (bytes: Uint8Array) => {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  };
  const upload = (file: File) =>
    act(async () => {
      if (file.size > 5 * 1024 * 1024) throw new Error("单文件上限 5 MiB");
      const result = await change(`/threads/${threadId}/versions`, {
        title: file.name,
        filename: file.name,
        mime: file.type || "application/octet-stream",
        contentBase64: encode(new Uint8Array(await file.arrayBuffer())),
        folderId,
      });
      onSelect(result.id);
    });
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<{
    text?: string;
    url?: string;
    kind: string;
    mime: string;
  } | null>(null);
  const [error, setError] = useState("");
  const version = versions.find((v) => v.id === selected);
  const artifacts = versions
    .filter(
      (v, i, list) =>
        list.findIndex((x) => x.artifact_id === v.artifact_id) === i,
    )
    .filter((v) => Boolean(v.deleted_at) === trash)
    .sort(
      (a, b) =>
        (sort === "modified"
          ? modified(a, b)
          : collator.compare(extension(a.filename), extension(b.filename))) ||
        collator.compare(fileLabel(a), fileLabel(b)) ||
        a.artifact_id.localeCompare(b.artifact_id),
    )
    .filter((v) =>
      `${v.title} ${v.filename}`.toLowerCase().includes(filter.toLowerCase()),
    );
  useEffect(() => {
    setView(null);
    setError("");
    if (!selected || embedded) return;
    let alive = true;
    let objectUrl = "";
    apiFetch(`/api/versions/${selected}`)
      .then(async (res) => {
        const result = await readJsonResponse(res, `/api/versions/${selected}`);
        return result;
      })
      .then((v) => {
        if (!alive) return;
        const bytes = Uint8Array.from(atob(v.contentBase64), (c) =>
          c.charCodeAt(0),
        );
        const name = v.filename.toLowerCase();
        const imageMime: Record<string, string> = {
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          gif: "image/gif",
          webp: "image/webp",
        };
        const extension = name.split(".").pop();
        if (imageMime[extension]) {
          objectUrl = URL.createObjectURL(
            new Blob([bytes], { type: imageMime[extension] }),
          );
          setView({
            kind: "image",
            url: objectUrl,
            mime: imageMime[extension],
          });
        } else if (name.endsWith(".pdf")) {
          objectUrl = URL.createObjectURL(
            new Blob([bytes], { type: "application/pdf" }),
          );
          setView({ kind: "pdf", url: objectUrl, mime: "application/pdf" });
        } else if (
          v.mime.startsWith("text/") ||
          /\.(md|txt|csv|json|py|js|ts|tsx|jsx|html|css|sql|xml|yaml|yml|sh|log)$/.test(
            name,
          )
        )
          setView({
            kind: name.endsWith(".md") ? "markdown" : "text",
            text: new TextDecoder().decode(bytes).slice(0, 200000),
            mime: v.mime,
          });
        else setView({ kind: "download", mime: v.mime });
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selected, embedded]);
  const folderPath = (id: string): string => {
    const folder = folders.find((f) => f.id === id);
    return folder
      ? (folder.parent_id ? folderPath(folder.parent_id) + " / " : "") +
          folder.name
      : "";
  };
  const fileRow = (v: LibraryVersion, depth: number) => (
    <div
      className={`tree-file ${version?.artifact_id === v.artifact_id ? "selected" : ""} ${draggingId === v.artifact_id ? "dragging" : ""}`}
      draggable={writable && !trash && !pending}
      onDragStart={(event) => {
        if (!writable || trash || pending || moveLock.current) {
          event.preventDefault();
          return;
        }
        draggedFile.current = v;
        setDraggingId(v.artifact_id);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(
          "application/x-cothread-document",
          v.artifact_id,
        );
      }}
      onDragEnd={clearDrag}
      key={v.artifact_id}
      style={{ paddingLeft: depth * 14 }}
      role="treeitem"
      aria-selected={version?.artifact_id === v.artifact_id}
    >
      <button
        className="tree-name"
        onClick={() => {
          onSelect(v.id);
          if (embedded) onOpen?.(v.id);
          setFolderId(v.folder_id || null);
          setOperation(null);
        }}
        title={`${v.title} · ${v.filename} · v${v.version}`}
      >
        <span className="tree-file-indent" />
        <FileIcon
          fileName={v.filename}
          editFileExtensionData={officeIcons}
          autoAssign
          className="tree-icon file-type-icon"
          aria-hidden="true"
          width={16}
          height={16}
        />
        <span>{fileLabel(v)}</span>
      </button>
      {onReference && !trash && (
        <button
          className="tree-quick"
          title="/ 引用文档"
          aria-label={`引用 ${v.title}`}
          onClick={() => onReference(v.id)}
        >
          /
        </button>
      )}
    </div>
  );
  const tree = (parent: string | null, depth = 0): React.ReactNode => (
    <>
      {folders
        .filter((f) => f.parent_id === parent)
        .sort(
          (a, b) =>
            (sort === "modified" ? modified(a, b) : 0) ||
            collator.compare(a.name, b.name) ||
            a.id.localeCompare(b.id),
        )
        .map((f) => (
          <div key={f.id} role="treeitem" aria-expanded={!collapsed.has(f.id)}>
            <div
              className={`tree-folder ${folderId === f.id ? "selected" : ""} ${dropTarget === f.id ? "drop-target" : ""}`}
              {...dropProps(f.id)}
              style={{ paddingLeft: depth * 14 }}
            >
              <button
                className={`tree-toggle ${collapsed.has(f.id) ? "" : "expanded"}`}
                aria-label={`${collapsed.has(f.id) ? "展开" : "折叠"} ${f.name}`}
                onClick={() =>
                  setCollapsed((previous) => {
                    const next = new Set(previous);
                    next.has(f.id) ? next.delete(f.id) : next.add(f.id);
                    return next;
                  })
                }
              >
                <TreeIcon kind="chevron" />
              </button>
              <button
                className="tree-name"
                onClick={() => {
                  setFolderId(f.id);
                  setOperation(null);
                }}
              >
                <FolderIcon
                  folderName={f.name}
                  className="tree-icon file-type-icon"
                  aria-hidden="true"
                  width={16}
                  height={16}
                />
                <span>{f.name}</span>
              </button>
              {writable && !f.system_key && folderId === f.id && (
                <span className="tree-folder-actions">
                  <button
                    title="重命名文件夹"
                    aria-label={`重命名文件夹 ${f.name}`}
                    disabled={
                      pending ||
                      !!folders.find((f) => f.id === folderId)?.system_key
                    }
                    onClick={() => begin("rename-folder", f.name)}
                  >
                    <TreeIcon kind="rename" />
                  </button>
                  <button
                    title="删除空文件夹"
                    aria-label={`删除空文件夹 ${f.name}`}
                    disabled={
                      pending ||
                      !!folders.find((f) => f.id === folderId)?.system_key
                    }
                    onClick={() =>
                      act(async () => {
                        await change(
                          `/projects/${projectId}/folders/${f.id}`,
                          {},
                          "DELETE",
                        );
                        setFolderId(null);
                        setOperation(null);
                      })
                    }
                  >
                    <TreeIcon kind="trash" />
                  </button>
                </span>
              )}
            </div>
            {!collapsed.has(f.id) && (
              <div role="group">{tree(f.id, depth + 1)}</div>
            )}
          </div>
        ))}
      {artifacts
        .filter((v) => (v.folder_id || null) === parent)
        .map((v) => fileRow(v, depth))}
    </>
  );
  return (
    <div className={embedded ? "library-embedded" : "modal-backdrop"}>
      <section
        className="library"
        role={embedded ? undefined : "dialog"}
        aria-modal={embedded ? undefined : true}
        aria-label="项目文档库"
      >
        <header>
          <div>
            <h2>项目文档库</h2>
            <p>已保存到项目的文件 · 独立于沙箱保留</p>
          </div>
          <button onClick={onClose} aria-label="关闭文档库">
            ×
          </button>
        </header>
        <div className="library-body">
          <aside className="file-explorer">
            <div className="explorer-heading">
              <strong>{trash ? "回收站" : "文件"}</strong>
              <div className="tree-actions">
                {writable && !trash && (
                  <>
                    <button
                      title="新建文件夹"
                      aria-label="新建文件夹"
                      disabled={
                        pending ||
                        !!folders.find((f) => f.id === folderId)?.system_key
                      }
                      onClick={() => begin("folder")}
                    >
                      <TreeIcon kind="newFolder" />
                    </button>
                    <button
                      disabled={
                        pending ||
                        !threadId ||
                        !!folders.find((f) => f.id === folderId)?.system_key
                      }
                      title="新建文档"
                      aria-label="新建文档"
                      onClick={() => begin("document")}
                    >
                      <TreeIcon kind="newFile" />
                    </button>
                    <button
                      disabled={
                        pending ||
                        !threadId ||
                        !!folders.find((f) => f.id === folderId)?.system_key
                      }
                      title="上传文件"
                      aria-label="上传文件"
                      onClick={() => uploadRef.current?.click()}
                    >
                      <TreeIcon kind="upload" />
                    </button>
                    <input
                      ref={uploadRef}
                      type="file"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void upload(file);
                        e.target.value = "";
                      }}
                    />
                  </>
                )}
                <button
                  title={trash ? "返回文件树" : "回收站"}
                  aria-label={trash ? "返回文件树" : "回收站"}
                  aria-pressed={trash}
                  onClick={() => {
                    setTrash(!trash);
                    onSelect("");
                    setOperation(null);
                  }}
                >
                  <TreeIcon kind={trash ? "back" : "trash"} />
                </button>
              </div>
            </div>
            <input
              aria-label="搜索文档"
              placeholder="搜索文档…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <select
              className="tree-sort"
              aria-label="文件树排序"
              value={sort}
              onChange={(e) => setSort(e.target.value as "type" | "modified")}
            >
              <option value="type">文件夹优先 · 类型 / 名称</option>
              <option value="modified">文件夹优先 · 最近修改</option>
            </select>
            {!threadId && writable && (
              <small className="muted">
                选择进行中的迭代后可新建或上传文档。
              </small>
            )}
            {!trash && (
              <button
                className={`tree-root ${folderId === null ? "selected" : ""} ${dropTarget === "root" ? "drop-target" : ""}`}
                {...dropProps(null)}
                onClick={() => {
                  setFolderId(null);
                  setOperation(null);
                }}
              >
                {draggingId ? "项目文件 · 拖到此处移出文件夹" : "项目文件"}
              </button>
            )}
            <div role="tree" aria-label="项目文件树">
              {trash || filter
                ? artifacts.map((v) => fileRow(v, 0))
                : tree(null)}
            </div>
            {!artifacts.length && !folders.length && (
              <p className="muted">尚无文档，可以新建或上传。</p>
            )}
            {actionError && (
              <div className="error" role="alert">
                {actionError}
              </div>
            )}
          </aside>
          <main className={operation ? "library-operation" : ""}>
            {operation && (
              <form
                className="library-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <h3>
                  {
                    {
                      folder: "新建文件夹",
                      document: "新建文档",
                      "rename-folder": "重命名文件夹",
                      "rename-document": "重命名文档",
                    }[operation]
                  }
                </h3>
                <label>
                  名称
                  <input
                    autoFocus
                    required
                    maxLength={160}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                {operation === "document" && (
                  <label>
                    内容（支持 Markdown）
                    <textarea
                      rows={12}
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                    />
                  </label>
                )}
                <div>
                  <button type="submit" className="primary" disabled={pending}>
                    {pending ? "保存中…" : "保存"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setOperation(null)}
                  >
                    取消
                  </button>
                </div>
              </form>
            )}
            {!operation &&
              (version ? (
                <>
                  <div className="document-toolbar">
                    <div>
                      <h3>{version.title}</h3>
                      <small>
                        {version.author} ·{" "}
                        {Math.max(1, Math.round(version.byte_size / 1024))} KB ·{" "}
                        {version.filename}
                      </small>
                    </div>
                    <select
                      aria-label="文档历史版本"
                      value={selected}
                      onChange={(e) => onSelect(e.target.value)}
                    >
                      {versions
                        .filter((v) => v.artifact_id === version.artifact_id)
                        .sort((a, b) => b.version - a.version)
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            v{v.version}
                            {v.review === "approved"
                              ? " · 已审核"
                              : " · 待确认"}
                          </option>
                        ))}
                    </select>
                    <a
                      className="download-button"
                      href={`/api/versions/${selected}/download`}
                    >
                      下载原文件
                    </a>
                    {onReference && (
                      <button onClick={() => onReference(selected)}>
                        / 引用到讨论
                      </button>
                    )}
                    {writable && (
                      <>
                        <button
                          disabled={pending || !!version.deleted_at}
                          onClick={() =>
                            begin("rename-document", version.title)
                          }
                        >
                          重命名
                        </button>
                        <button
                          disabled={pending}
                          onClick={() =>
                            editArtifact({ deleted: !version.deleted_at })
                          }
                        >
                          {version.deleted_at ? "恢复文档" : "删除"}
                        </button>
                        {!version.deleted_at && (
                          <select
                            aria-label="移动文档到文件夹"
                            disabled={pending}
                            value={version.folder_id || ""}
                            onChange={(e) =>
                              editArtifact({ folderId: e.target.value || null })
                            }
                          >
                            <option value="">项目根目录</option>
                            {folders
                              .filter(
                                (f) =>
                                  !f.system_key || f.id === version.folder_id,
                              )
                              .map((f) => (
                                <option key={f.id} value={f.id}>
                                  {folderPath(f.id)}
                                </option>
                              ))}
                          </select>
                        )}
                      </>
                    )}
                  </div>
                  {!version.deleted_at && (
                    <div className="library-review-actions">
                      {onNewVersion && (
                        <button
                          onClick={() => onNewVersion(version.artifact_id)}
                        >
                          提交新版本
                        </button>
                      )}
                      <span>
                        {version.review === "approved"
                          ? "已审核"
                          : version.review === "changes_requested"
                            ? "需要修改"
                            : "待人工审核"}
                      </span>
                      {onReview && version.thread_id === threadId && (
                        <>
                          <button
                            disabled={pending}
                            onClick={() =>
                              act(() => onReview(selected, "approved"))
                            }
                          >
                            确认通过
                          </button>
                          <button
                            disabled={pending}
                            onClick={() =>
                              act(() => onReview(selected, "changes_requested"))
                            }
                          >
                            要求修改
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {version.deleted_at && (
                    <p className="muted">
                      已移入回收站，历史引用仍可查看。恢复后可继续使用。
                    </p>
                  )}
                  {error && <div className="error">{error}</div>}
                  {!view && !error && <p className="muted">正在读取文档…</p>}
                  <div className="document-preview">
                    {view?.kind === "markdown" && (
                      <Markdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          img: () => <span>（外部图片请在原文件中查看）</span>,
                        }}
                      >
                        {view.text}
                      </Markdown>
                    )}
                    {view?.kind === "text" && <pre>{view.text}</pre>}
                    {view?.kind === "image" && (
                      <img src={view.url} alt={version.filename} />
                    )}{" "}
                    {view?.kind === "pdf" && (
                      <iframe title={version.filename} src={view.url} />
                    )}{" "}
                    {view?.kind === "download" && (
                      <p>
                        文件已安全保存在项目中。此格式暂不支持在线预览，请下载原文件查看。
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <div className="library-empty">
                  选择一份文档，查看内容和历史版本。
                </div>
              ))}
          </main>
        </div>
      </section>
    </div>
  );
}
