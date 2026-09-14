import { readJsonResponse } from "../shared/json-response.js";
import { apiFetch } from "./api-fetch";
import { useEffect, useState } from "react";
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
    sortType: "M4 6h10 M4 12h7 M4 18h4 M17 5v14 M14 16l3 3 3-3",
    sortModified: "M12 8v5l3 2 M21 12a9 9 0 1 1-2.6-6.35 M21 4v6h-6",
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
  folder_thread_id?: string | null;
  folder_kind?: string | null;
  deleted_at?: string | null;
  artifact_deleted_at?: string | null;
  version_deleted_at?: string | null;
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
  onOpen,
  onReview,
  projectId,
  threadId,
  writable,
  iterationWritable = false,
  folders,
  onRefresh,
  versions,
  selected,
  onSelect,
  onClose,
  onReference,
  organizationJobs = [],
  canOrganizeProject = false,
}: {
  embedded?: boolean;
  onOpen?: (versionId: string) => void;
  onReview?: (versionId: string, decision: string) => Promise<void>;
  projectId: string;
  threadId?: string;
  writable: boolean;
  iterationWritable?: boolean;
  folders: {
    id: string;
    parent_id: string | null;
    name: string;
    updated_at?: string;
    system_key?: string | null;
    thread_id?: string | null;
    folder_kind?: string | null;
  }[];
  onRefresh: () => Promise<void>;
  versions: LibraryVersion[];
  selected: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onReference?: (id: string) => void;
  organizationJobs?: { thread_id?: string | null; scope: "iteration" | "project"; status: string; error?: string | null }[];
  canOrganizeProject?: boolean;
}) {
  const [scope, setScope] = useState<"iteration" | "project">(threadId ? "iteration" : "project");
  const scopeRoot = folders.find((folder) => scope === "iteration"
    ? folder.thread_id === threadId && folder.folder_kind === "iteration_root"
    : folder.folder_kind === "project_official");
  const defaultFolder = folders.find((folder) => scope === "iteration"
    ? folder.thread_id === threadId && folder.folder_kind === "iteration_outputs"
    : folder.folder_kind === "project_official");
  const scopedFolders = folders.filter((folder) => scope === "iteration"
    ? folder.thread_id === threadId
    : !folder.thread_id);
  const scopedVersions = versions.filter((item) => scope === "iteration"
    ? item.folder_thread_id === threadId
    : !item.folder_thread_id);
  const organization = organizationJobs.find((job) => job.scope === scope
    && (scope === "project" || job.thread_id === threadId));
  const organizing = organization && ["queued", "running"].includes(organization.status);
  const scopeWritable = (scope === "iteration" ? iterationWritable : writable) && !organizing;
  const [folderId, setFolderId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [trash, setTrash] = useState(false);
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
  const [actionError, setActionError] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");
  const change = async (path: string, data: unknown, method = "POST") => {
    const payload = data && typeof data === "object" && !Array.isArray(data)
      ? { ...(data as Record<string, unknown>), ...(threadId ? { threadId } : {}) }
      : data;
    const res = await apiFetch(`/api${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<{
    text?: string;
    url?: string;
    kind: string;
    mime: string;
  } | null>(null);
  const [error, setError] = useState("");
  const version = scopedVersions.find((v) => v.id === selected);
  const artifacts = scopedVersions
    .filter((v) => Boolean(v.deleted_at) === trash)
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
  useEffect(() => {
    setFolderId(defaultFolder?.id || scopeRoot?.id || null);
    onSelect("");
    setRenaming(false);
    setTrash(false);
  }, [scope, threadId]);
  const fileRow = (v: LibraryVersion, depth: number) => (
    <div
      className={`tree-file ${version?.artifact_id === v.artifact_id ? "selected" : ""}`}
      key={v.artifact_id}
      style={{ paddingLeft: depth * 14 }}
      role="treeitem"
      aria-selected={version?.artifact_id === v.artifact_id}
    >
      <button
        className="tree-name"
        disabled={!!organizing}
        onClick={() => {
          onSelect(v.id);
          if (embedded) onOpen?.(v.id);
          setFolderId(v.folder_id || null);
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
      {scopedFolders
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
              className={`tree-folder ${folderId === f.id ? "selected" : ""}`}
              style={{ paddingLeft: depth * 14 }}
            >
              <button
                className={`tree-toggle ${collapsed.has(f.id) ? "" : "expanded"}`}
                disabled={!!organizing}
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
                disabled={!!organizing}
                onClick={() => {
                  setFolderId(f.id);
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
            <p>{scope === "iteration" ? "当前迭代隔离文件 · 缓存与产物分开保存" : "项目正式文件 · 所有迭代均可引用和操作"}</p>
          </div>
          <button onClick={onClose} aria-label="关闭文档库">
            ×
          </button>
        </header>
        <div className="library-scope-tabs" role="tablist" aria-label="文档范围">
          {threadId && <button role="tab" aria-selected={scope === "iteration"} className={scope === "iteration" ? "active" : ""} onClick={() => setScope("iteration")}>本迭代</button>}
          <button role="tab" aria-selected={scope === "project"} className={scope === "project" ? "active" : ""} onClick={() => setScope("project")}>项目正式文件</button>
          <button
            className="organize-documents"
            disabled={!scopeWritable || (scope === "project" && !canOrganizeProject)}
            title={scope === "project" && !canOrganizeProject ? "全部迭代归档后可整理项目正式文件" : "由一级小祥在后台整理当前范围"}
            onClick={() => void act(async () => {
              await change(scope === "iteration" ? `/threads/${threadId}/documents/organize` : `/projects/${projectId}/documents/organize`, {});
              onSelect("");
            })}
          >
            {organizing ? "整理中…" : "整理文档"}
          </button>
        </div>
        <div className="library-body">
          <aside className="file-explorer">
            <div className="explorer-heading">
              <div className="tree-actions">
                <button
                  title={trash ? "返回文件树" : "回收站"}
                  aria-label={trash ? "返回文件树" : "回收站"}
                  aria-pressed={trash}
                  onClick={() => {
                    setTrash(!trash);
                    onSelect("");
                  }}
                >
                  <TreeIcon kind={trash ? "back" : "trash"} />
                </button>
              </div>
            </div>
            <div className="tree-filter-bar">
              <input
                aria-label="搜索文档"
                placeholder="搜索文档…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <button
                type="button"
                className="tree-sort"
                title={
                  sort === "type"
                    ? "当前：类型 / 名称；切换为最近修改"
                    : "当前：最近修改；切换为类型 / 名称"
                }
                aria-label={
                  sort === "type"
                    ? "当前按类型和名称排序，切换为最近修改"
                    : "当前按最近修改排序，切换为类型和名称"
                }
                onClick={() => setSort(sort === "type" ? "modified" : "type")}
              >
                <TreeIcon
                  kind={sort === "type" ? "sortType" : "sortModified"}
                />
              </button>
            </div>
            <div role="tree" aria-label={scope === "iteration" ? "迭代文件树" : "项目正式文件树"}>
              {organizing ? <p className="muted">一级小祥正在后台整理，当前范围暂时禁用。</p> : trash || filter
                ? artifacts.map((v) => fileRow(v, 0))
                : tree(scopeRoot?.id || null)}
            </div>
            {!artifacts.length && !scopedFolders.length && (
              <p className="muted">当前范围尚无文档。</p>
            )}
            {organization?.status === "failed" && <div className="error" role="alert">{organization.error || "文档整理未完成，可以重试。"}</div>}
            {actionError && (
              <div className="error" role="alert">
                {actionError}
              </div>
            )}
          </aside>
          <main className={renaming ? "library-operation" : ""}>
            {renaming && version && (
              <form className="library-form" onSubmit={(event) => {
                event.preventDefault();
                void act(async () => {
                  await change(`/projects/${projectId}/artifacts/${version.artifact_id}`, { name: renameName }, "PATCH");
                  setRenaming(false);
                });
              }}>
                <h3>重命名文档</h3>
                <label>名称<input autoFocus required maxLength={160} value={renameName} onChange={(event) => setRenameName(event.target.value)} /></label>
                <div><button type="submit" className="primary" disabled={pending}>{pending ? "保存中…" : "保存"}</button><button type="button" disabled={pending} onClick={() => setRenaming(false)}>取消</button></div>
              </form>
            )}
            {!renaming && (version ? (
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
                            v{v.version}{v.deleted_at ? " · 已删除" : ""}
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
                    {scopeWritable && (
                      <>
                        <button disabled={pending || !!version.deleted_at} onClick={() => { setRenameName(version.title); setRenaming(true); }}>重命名</button>
                        <button
                          disabled={pending}
                          onClick={() => act(async () => { await change(`/projects/${projectId}/artifacts/${version.artifact_id}`, { deleted: !version.artifact_deleted_at }, "PATCH"); })}
                        >
                          {version.artifact_deleted_at ? "恢复整份文档" : "删除整份文档（全部版本）"}
                        </button>
                        {!version.artifact_deleted_at && <button disabled={pending} onClick={() => act(async () => {
                          await change(`/projects/${projectId}/versions/${version.id}`, {deleted:!version.version_deleted_at}, "PATCH");
                        })}>{version.version_deleted_at ? "恢复当前版本" : `删除当前版本（v${version.version}）`}</button>}
                      </>
                    )}
                  </div>
                  {!version.deleted_at && (
                  <div className="library-review-actions">
                      {scope === "iteration" && threadId && !version.deleted_at && (
                        <button disabled={pending || !scopeWritable} onClick={() => act(async () => {
                          await change(`/threads/${threadId}/versions/${version.id}/save-to-project`, {});
                        })}>另存至项目正式文件</button>
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
