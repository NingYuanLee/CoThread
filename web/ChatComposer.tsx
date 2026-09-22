import { readJsonResponse } from "../shared/json-response.js";
import { apiFetch } from "./api-fetch";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { folderDisplayName, folderRootKind, libraryFolderPath } from "./document-library";
import { AGENT_L2_MEMBER, AGENT_MEMBER } from "../shared/agent-member.js";
import { fileDisplayName, isImageFile } from "../shared/document-name.js";
import { FileIcon } from "@react-symbols/icons/utils";
import {
  Document,
  Markdown as MarkdownFile,
  Notebook,
  Python,
  Text,
} from "@react-symbols/icons/files";
import { UiIcon } from "./ui-icon";
import { ImagePreviewDialog, type ImagePreviewSource } from "./ImagePreview";
import { FILE_MAX_BYTES } from "../shared/upload-limits.js";
import { uploadFileWithIntegrity } from "./file-upload";

type FileVersion = {
  id: string;
  artifact_id: string;
  filename: string;
  title: string;
  deleted_at?: string | null;
  folder_id?: string | null;
  version?: number;
};
type FolderRef = {
  id: string;
  parent_id: string | null;
  name: string;
  folder_kind?: string | null;
};
type Upload = {
  key: string;
  name: string;
  url?: string;
  progress: number;
  id?: string;
  artifactId?: string;
  error?: string;
  removing?: boolean;
};
const officeIcons = {
  doc: Document,
  docx: Document,
  odt: Document,
  rtf: Document,
  ppt: Notebook,
  pptx: Notebook,
  odp: Notebook,
  md: MarkdownFile,
  markdown: MarkdownFile,
  txt: Text,
  log: Text,
  env: Text,
  py: Python,
};
function FilePreview({
  name,
  url,
  id,
}: {
  name: string;
  url?: string;
  id?: string;
}) {
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (url || !id || !isImageFile(name)) return;
    let alive = true,
      local = "";
    void apiFetch(`/api/versions/${id}`)
      .then(async (r) => {
        if (!r.ok) return;
        const v = await readJsonResponse(r, `/api/versions/${id}`);
        if (!alive) return;
        const ext = name.split(".").pop()?.toLowerCase();
        const mime =
          ext === "svg"
            ? "image/svg+xml"
            : ext === "jpg"
              ? "image/jpeg"
              : `image/${ext}`;
        local = URL.createObjectURL(
          new Blob(
            [Uint8Array.from(atob(v.contentBase64), (c) => c.charCodeAt(0))],
            { type: mime },
          ),
        );
        setPreview(local);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (local) URL.revokeObjectURL(local);
    };
  }, [id, name, url]);
  return isImageFile(name) && (url || preview) ? (
    <img src={url || preview} alt={name} />
  ) : (
    <FileIcon
      fileName={name}
      editFileExtensionData={officeIcons}
      autoAssign
      width={48}
      height={48}
      aria-hidden="true"
    />
  );
}

export function ChatComposer({
  projectId,
  threadId,
  message,
  setMessage,
  refs,
  setRefs,
  folderRefs = [],
  setFolderRefs,
  versions,
  folders = [],
  members,
  busy,
  onSend,
  onRefresh,
  uploadTarget,
  connectorControl,
  onCopyConversation,
  copyLabel,
}: {
  projectId: string;
  threadId: string;
  message: string;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  refs: string[];
  setRefs: React.Dispatch<React.SetStateAction<string[]>>;
  folderRefs?: string[];
  setFolderRefs?: React.Dispatch<React.SetStateAction<string[]>>;
  versions: FileVersion[];
  folders?: FolderRef[];
  members: { id: string; name: string; email: string; kind?: string; avatar?: string | null }[];
  busy: boolean;
  onSend: () => Promise<boolean>;
  onRefresh: () => Promise<void>;
  uploadTarget: React.MutableRefObject<((files: File[]) => void) | null>;
  connectorControl: React.ReactNode;
  onCopyConversation: () => void;
  copyLabel: string;
}) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [imagePreview, setImagePreview] = useState<ImagePreviewSource | null>(null);
  const [error, setError] = useState("");
  const [trigger, setTrigger] = useState<{
    symbol: string;
    query: string;
    start: number;
    end: number;
  } | null>(null);
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const urls = useRef<string[]>([]);
  const slots = useRef(0);
  const cancelled = useRef(new Set<string>());
  const sending = useRef(false);
  const currentRefs = useRef(refs);
  currentRefs.current = refs;
  useEffect(
    () => () => {
      alive.current = false;
      urls.current.forEach(URL.revokeObjectURL);
    },
    [],
  );
  const update = (key: string, value: Partial<Upload>) => {
    if (alive.current)
      setUploads((rows) =>
        rows.map((r) => (r.key === key ? { ...r, ...value } : r)),
      );
  };
  const upload = (files: File[]) => {
    if (sending.current || busy) return;
    setError("");
    for (const file of files) {
      if (currentRefs.current.length + slots.current >= 30) {
        setError("每条消息最多引用 30 个文件");
        break;
      }
      if (file.size > FILE_MAX_BYTES) {
        setError(`${file.name} 超过单文件 ${FILE_MAX_BYTES / 1024 / 1024} MiB 上限`);
        continue;
      }
      slots.current++;
      const key = crypto.randomUUID();
      const url = isImageFile(file.name) ? URL.createObjectURL(file) : undefined;
      if (url) urls.current.push(url);
      setUploads((rows) => [
        ...rows,
        { key, name: file.name, url, progress: 0 },
      ]);
      void (async () => {
        try {
          const result = await uploadFileWithIntegrity({
            kind: "cache_draft",
            threadId,
            title: file.name,
          }, file, (progress) => update(key, { progress }));
          if (cancelled.current.has(key)) {
            update(key, { ...result, progress: 100 });
            await remove({
              key,
              name: file.name,
              url,
              progress: 100,
              ...result,
            });
            return;
          }
          try {
            await onRefresh();
          } catch {
            setError("文件已保存，文档列表刷新失败，请稍后刷新");
          }
          if (!alive.current) return;
          if (cancelled.current.has(key)) {
            await remove({
              key,
              name: file.name,
              url,
              progress: 100,
              ...result,
            });
            return;
          }
          const savedName = fileDisplayName({
            title: result.title,
            filename: result.filename || file.name,
          });
          currentRefs.current = [
            ...new Set([...currentRefs.current, result.id]),
          ];
          setRefs(currentRefs.current);
          setMessage(
            (text) =>
              `${text}${text && !/\s$/.test(text) ? " " : ""}/${savedName} `,
          );
          update(key, {
            id: result.id,
            artifactId: result.artifactId,
            name: savedName,
            progress: 100,
          });
        } catch (e) {
          update(key, { error: (e as Error).message, removing: false });
        } finally {
          slots.current--;
        }
      })();
    }
  };
  useEffect(() => {
    uploadTarget.current = upload;
    return () => {
      uploadTarget.current = null;
    };
  });
  const remove = async (item: Upload) => {
    update(item.key, { removing: true });
    try {
      if (item.artifactId) {
        const response = await fetch(
          `/api/projects/${projectId}/artifacts/${item.artifactId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deleted: true, threadId }),
          },
        );
        if (!response.ok)
          await readJsonResponse(response, "/api/attachments");
      }
      if (!alive.current) return;
      setUploads((rows) => rows.filter((r) => r.key !== item.key));
      if (item.id) setRefs((rows) => rows.filter((id) => id !== item.id));
      setMessage((text) => text.replace(`/${item.name}`, ""));
      if (item.url) URL.revokeObjectURL(item.url);
      if (item.artifactId) await onRefresh();
    } catch (e) {
      setError((e as Error).message);
      update(item.key, { removing: false });
    }
  };
  const detect = (text: string, caret: number) => {
    const match = /([/@])([^\s/@]*)$/.exec(text.slice(0, caret));
    setTrigger(
      match
        ? {
            symbol: match[1],
            query: match[2],
            start: caret - match[2].length - 1,
            end: caret,
          }
        : null,
    );
    setIndex(0);
  };
  const available = versions.filter(
    (v, i, all) =>
      !v.deleted_at &&
      all.findIndex((x) => x.artifact_id === v.artifact_id) === i,
  );
  const libraryFolders = folders.filter((folder) => {
    if (folder.folder_kind === "iteration_root" || folder.folder_kind === "iteration_cache" || folder.folder_kind === "iteration_outputs")
      return false;
    return folderRootKind(folder.id, folders) !== null;
  });
  const mentionMembers = members.filter((m) => m.kind !== "l1" && m.id !== AGENT_MEMBER.id);
  const options = (
    trigger?.symbol === "/"
      ? [
          ...available.map((v) => {
            const label = fileDisplayName(v);
            return { id: v.id, kind: "file" as const, label, detail: v.title !== label ? v.title : v.filename };
          }),
          ...libraryFolders.map((folder) => {
            const label = folderDisplayName(folder);
            const path = libraryFolderPath(folder.id, folders);
            return { id: folder.id, kind: "folder" as const, label, detail: path !== label ? path : "文件夹" };
          }),
        ]
      : mentionMembers.map((m) => ({
          id: m.id,
          kind: "member" as const,
          label: m.name,
          detail: m.id === AGENT_L2_MEMBER.id ? AGENT_L2_MEMBER.identity_tags[0] : m.email,
          avatar: m.id === AGENT_L2_MEMBER.id ? (m.avatar || AGENT_L2_MEMBER.avatar) : (m.avatar || undefined),
        }))
  )
    .filter((o) =>
      `${o.label} ${o.detail}`
        .toLowerCase()
        .includes(trigger?.query.toLowerCase() || ""),
    )
    .slice(0, 30);
  useLayoutEffect(() => {
    if (!trigger) return;
    const list = picker.current;
    const item = list?.querySelector<HTMLElement>(`#composer-option-${index}`);
    if (!list || !item) return;
    const listRect = list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (itemRect.bottom > listRect.bottom) list.scrollTop += itemRect.bottom - listRect.bottom;
    else if (itemRect.top < listRect.top) list.scrollTop -= listRect.top - itemRect.top;
  }, [index, trigger, options.length]);
  const choose = (option: (typeof options)[number]) => {
    if (!trigger) return;
    if (trigger.symbol === "/") {
      if (option.kind === "folder") {
        if (!folderRefs.includes(option.id) && folderRefs.length >= 30) {
          setError("每条消息最多引用 30 个文件夹");
          return;
        }
        setFolderRefs?.((rows) => [...new Set([...rows, option.id])]);
      } else {
        if (!refs.includes(option.id) && refs.length + slots.current >= 30) {
          setError("每条消息最多引用 30 个文件");
          return;
        }
        setRefs((rows) => [...new Set([...rows, option.id])]);
      }
    }
    const selectedMember = trigger.symbol === "@" ? mentionMembers.find((m) => m.id === option.id) : undefined;
    const mentionLabel = selectedMember
      && selectedMember.id !== AGENT_L2_MEMBER.id
      && mentionMembers.filter((m) => m.name === selectedMember.name).length > 1
      ? selectedMember.email : option.label;
    const replacement = `${trigger.symbol}${mentionLabel} `;
    setMessage(
      (text) =>
        text.slice(0, trigger.start) + replacement + text.slice(trigger.end),
    );
    const caret = trigger.start + replacement.length;
    setTrigger(null);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(caret, caret);
    });
  };
  const pending = uploads.some((u) => (!u.id && !u.error) || u.removing);
  const openUploadPreview = (item: Upload) => {
    if (item.error || !isImageFile(item.name) || (!item.url && !item.id)) return;
    setImagePreview({
      title: item.name,
      filename: item.name,
      id: item.id,
      src: item.id ? undefined : item.url,
    });
  };
  return (
    <>
    <form
      className={`composer chat-composer${expanded ? " is-expanded" : ""}`}
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          pending ||
          slots.current ||
          sending.current ||
          busy ||
          !message.trim()
        )
          return;
        sending.current = true;
        try {
          if (await onSend()) {
            setUploads([]);
            setImagePreview(null);
            urls.current.forEach(URL.revokeObjectURL);
            urls.current = [];
            setTrigger(null);
          }
        } finally {
          sending.current = false;
        }
      }}
    >
      <div className="composer-resize">
        <button
          type="button"
          className="composer-resize-btn"
          aria-label={expanded ? "缩小输入框" : "放大输入框"}
          aria-pressed={expanded}
          title={expanded ? "缩小" : "放大"}
          onClick={() => setExpanded((value) => !value)}
        >
          <UiIcon name={expanded ? "compress" : "expand"} size={14} />
        </button>
      </div>
      {folderRefs.length > 0 && (
        <div className="references composer-folder-refs" aria-label="引用文件夹">
          {folderRefs.map((id) => {
            const folder = folders.find((item) => item.id === id);
            const label = folder ? libraryFolderPath(id, folders) || folderDisplayName(folder) : id;
            return (
              <span className="ref ref-folder" key={id}>
                <UiIcon name="folder" size={12} /> {label}
                <button
                  type="button"
                  className="ref-remove"
                  aria-label={`移除文件夹 ${label}`}
                  onClick={() => setFolderRefs?.((rows) => rows.filter((item) => item !== id))}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
      {uploads.length > 0 && (
        <div className="chat-attachments" aria-label="消息附件">
          {uploads.map((item) => (
            <div
              className={`chat-attachment ${item.error ? "failed" : ""}`}
              key={item.key}
              title={item.error || item.name}
            >
              <div
                className={`attachment-preview${isImageFile(item.name) && (item.url || item.id) && !item.error ? " is-image" : ""}`}
                role={isImageFile(item.name) && (item.url || item.id) && !item.error ? "button" : undefined}
                tabIndex={isImageFile(item.name) && (item.url || item.id) && !item.error ? 0 : undefined}
                title={isImageFile(item.name) && (item.url || item.id) && !item.error ? `预览 ${item.name}` : undefined}
                onClick={() => openUploadPreview(item)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  openUploadPreview(item);
                }}
              >
                <FilePreview name={item.name} url={item.url} id={item.id} />
                {!item.id && !item.error && (
                  <div
                    className="upload-overlay"
                    role="progressbar"
                    aria-label={`上传 ${item.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={item.progress}
                  >
                    <span>
                      {item.progress === 99 ? "正在保存…" : `${item.progress}%`}
                    </span>
                    <progress max={100} value={item.progress} />
                  </div>
                )}
                {item.error && <span className="upload-overlay">上传失败</span>}
              </div>
              <small>{item.name}</small>
              <button
                type="button"
                className="attachment-remove"
                aria-label={`删除 ${item.name}`}
                disabled={busy || item.removing}
                onClick={() => {
                  if (!item.id && !item.error) {
                    cancelled.current.add(item.key);
                    update(item.key, { removing: true });
                  } else void remove(item);
                }}
              >
                ×
              </button>
              {item.error && (
                <span className="attachment-error">{item.error}</span>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="chat-input-wrap">
        {trigger && (
          <div
            ref={picker}
            className="composer-picker"
            role="listbox"
            id="composer-picker"
            aria-label={
              trigger.symbol === "/" ? "选择项目文件或文件夹" : "选择项目成员"
            }
          >
            <small>{trigger.symbol === "/" ? "项目文件与文件夹" : "项目成员"}</small>
            {options.map((option, i) => (
              <button
                type="button"
                role="option"
                aria-selected={i === index}
                id={`composer-option-${i}`}
                key={`${option.kind}:${option.id}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(option)}
              >
                {trigger.symbol === "/" ? (
                  option.kind === "folder" ? (
                    <UiIcon name="folder" size={20} />
                  ) : (
                    <FileIcon
                      fileName={option.label}
                      autoAssign
                      width={20}
                      height={20}
                    />
                  )
                ) : (
                  <span className="mention-avatar">
                    {"avatar" in option && option.avatar ? (
                      <img src={option.avatar} alt="" />
                    ) : (
                      option.label[0]
                    )}
                  </span>
                )}
                <span>
                  {option.label}
                  <small>{option.detail}</small>
                </span>
              </button>
            ))}
            {!options.length && (
              <p>没有匹配的{trigger.symbol === "/" ? "文件或文件夹" : "成员"}</p>
            )}
          </div>
        )}
        <textarea
          rows={2}
          ref={input}
          aria-label="发送消息"
          aria-controls={trigger ? "composer-picker" : undefined}
          aria-expanded={!!trigger}
          aria-activedescendant={
            trigger && options[index] ? `composer-option-${index}` : undefined
          }
          value={message}
          placeholder="写下想法… / 引用文件或文件夹，@ 提及成员；可拖拽或粘贴文件"
          maxLength={20000}
          onChange={(e) => {
            setMessage(e.target.value);
            detect(e.target.value, e.target.selectionStart);
          }}
          onClick={(e) =>
            detect(e.currentTarget.value, e.currentTarget.selectionStart)
          }
          onBlur={() => setTrigger(null)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length) {
              e.preventDefault();
              e.stopPropagation();
              upload(files);
            }
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "Enter") {
              if (e.shiftKey) return;
              e.preventDefault();
              if (e.repeat) return;
              if (trigger) {
                if (options[index]) choose(options[index]);
                return;
              }
              e.currentTarget.form?.requestSubmit();
              return;
            }
            if (!trigger) return;
            if (e.key === "Escape") {
              e.preventDefault();
              setTrigger(null);
            }
            if (options.length && ["ArrowDown", "ArrowUp"].includes(e.key)) {
              e.preventDefault();
              setIndex(
                (i) =>
                  (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) %
                  options.length,
              );
            }
          }}
        />
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="composer-footer">
        <div className="composer-tools">
          {connectorControl}
          <span className="composer-tools-split" aria-hidden="true" />
          <button type="button" className="composer-connector" onClick={onCopyConversation}>
            <UiIcon name="copy" size={15} />
            {copyLabel}
          </button>
        </div>
        <button
          className="primary"
          disabled={busy || pending || !message.trim()}
        >
          <UiIcon name="send" size={14} />
          {pending ? "上传中…" : busy ? "处理中…" : "发送"}
        </button>
      </div>
    </form>
    {imagePreview && (
      <ImagePreviewDialog
        id={imagePreview.id}
        title={imagePreview.title}
        filename={imagePreview.filename}
        src={imagePreview.src}
        onClose={() => setImagePreview(null)}
      />
    )}
    </>
  );
}


