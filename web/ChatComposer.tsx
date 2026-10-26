import { ContextMenu } from "./ContextMenu";
import { FloatingPortal } from "./FloatingPortal";
import { useTipError } from "./Tip";
import { readJsonResponse } from "../shared/json-response.js";
import { apiFetch } from "./api-fetch";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { folderDisplayName, folderRootKind, libraryFolderPath } from "./document-library";
import { AGENT_XIAOXIANG_MEMBER, AGENT_MEMBER } from "../shared/agent-member.js";
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
import { wechatFileIcons } from "./wechat-file-icons";
import { DIALOGUE_MODE_UI, SELECTABLE_DIALOGUE_MODES } from "../shared/dialogue-mode.js";
import type { UiIconName } from "./ui-icon";
import type { DialogueMode } from "./dialogue-mode-storage";
import type { CSSProperties } from "react";

function placePopover(
  anchor: HTMLElement | null,
  options: { width: number; gap: number; maxHeight: number },
): CSSProperties {
  if (!anchor) return { position: "fixed", visibility: "hidden" };
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(options.width, Math.max(rect.width, 240), window.innerWidth - 16);
  let left = rect.left;
  if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - width);
  const maxHeight = Math.max(120, Math.min(options.maxHeight, rect.top - 16));
  return {
    position: "fixed",
    left,
    width,
    maxHeight,
    bottom: window.innerHeight - rect.top + options.gap,
  };
}

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
  ...wechatFileIcons,
};
function FilePreview({ name, url, id }: { name: string; url?: string; id?: string }) {
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
          ext === "svg" ? "image/svg+xml" : ext === "jpg" ? "image/jpeg" : `image/${ext}`;
        local = URL.createObjectURL(
          new Blob([Uint8Array.from(atob(v.contentBase64), (c) => c.charCodeAt(0))], {
            type: mime,
          }),
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

export type ComposerController = {
  updateDraft: (updater: (text: string) => string) => void;
  focus: () => void;
};

export function ChatComposer({
  projectId,
  threadId,
  refs,
  setRefs,
  folderRefs = [],
  setFolderRefs,
  versions,
  folders = [],
  members,
  currentUserId,
  busy,
  onSend,
  onRefresh,
  uploadTarget,
  dialogueMode = "default",
  onDialogueModeChange,
  onController,
  mentions = true,
  modes,
  mode,
  onModeChange,
}: {
  projectId: string;
  threadId: string;
  refs: string[];
  setRefs: React.Dispatch<React.SetStateAction<string[]>>;
  folderRefs?: string[];
  setFolderRefs?: React.Dispatch<React.SetStateAction<string[]>>;
  versions: FileVersion[];
  folders?: FolderRef[];
  members: { id: string; name: string; email: string; kind?: string; avatar?: string | null }[];
  currentUserId?: string;
  busy: boolean;
  onSend: (body: string) => Promise<boolean>;
  onRefresh: () => Promise<void>;
  uploadTarget: React.MutableRefObject<((files: File[]) => void) | null>;
  dialogueMode?: DialogueMode;
  onDialogueModeChange?: (mode: DialogueMode) => void;
  onController?: (controller: ComposerController | null, threadId?: string) => void;
  /** 为 false 时输入 @ 不弹出成员列表，只当普通文字。 */
  mentions?: boolean;
  modes?: {
    id: string;
    icon: string;
    accent: string;
    surface: string;
    label: string;
    summary: string;
  }[];
  mode?: string;
  onModeChange?: (mode: string) => void;
}) {
  const modeChoices = modes?.length
    ? modes
    : SELECTABLE_DIALOGUE_MODES.map((id) => ({ id, ...DIALOGUE_MODE_UI[id] }));
  const selectedModeId = modes?.length ? mode || modeChoices[0]?.id : dialogueMode;
  const selectedMode = modeChoices.find((item) => item.id === selectedModeId) || modeChoices[0];
  const [message, setMessage] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [imagePreview, setImagePreview] = useState<ImagePreviewSource | null>(null);
  const [error, setError] = useTipError();
  const [trigger, setTrigger] = useState<{
    symbol: string;
    query: string;
    start: number;
    end: number;
  } | null>(null);
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    onController?.(
      {
        updateDraft: (updater) => setMessage(updater),
        focus: () => input.current?.focus(),
      },
      threadId,
    );
    return () => onController?.(null);
  }, [onController, threadId]);
  const picker = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const urls = useRef<string[]>([]);
  const slots = useRef(0);
  const cancelled = useRef(new Set<string>());
  const sending = useRef(false);
  const suppressSlashTrigger = useRef(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [modeMenuBox, setModeMenuBox] = useState<{ left: number; bottom: number } | null>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const modeMenuPanelRef = useRef<HTMLDivElement>(null);
  const modeButtonRef = useRef<HTMLButtonElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const currentRefs = useRef(refs);
  currentRefs.current = refs;
  useEffect(
    () => () => {
      alive.current = false;
      urls.current.forEach(URL.revokeObjectURL);
    },
    [],
  );
  useEffect(() => {
    if (!modeMenuOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (modeMenuRef.current?.contains(target) || modeMenuPanelRef.current?.contains(target))
        return;
      setModeMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [modeMenuOpen]);
  useLayoutEffect(() => {
    if (!modeMenuOpen) return;
    const place = () => {
      const button = modeButtonRef.current;
      const menu = modeMenuPanelRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const menuWidth = menu?.offsetWidth ?? 280;
      let left = rect.left;
      if (left + menuWidth > window.innerWidth - 8)
        left = Math.max(8, window.innerWidth - 8 - menuWidth);
      setModeMenuBox({ left, bottom: window.innerHeight - rect.top + 6 });
    };
    place();
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [modeMenuOpen]);
  const update = (key: string, value: Partial<Upload>) => {
    if (alive.current)
      setUploads((rows) => rows.map((r) => (r.key === key ? { ...r, ...value } : r)));
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
      setUploads((rows) => [...rows, { key, name: file.name, url, progress: 0 }]);
      void (async () => {
        try {
          const result = await uploadFileWithIntegrity(
            {
              kind: "cache_draft",
              threadId,
              title: file.name,
            },
            file,
            (progress) => update(key, { progress }),
          );
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
          currentRefs.current = [...new Set([...currentRefs.current, result.id])];
          setRefs(currentRefs.current);
          setMessage((text) => `${text}${text && !/\s$/.test(text) ? " " : ""}/${savedName} `);
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
        const response = await fetch(`/api/projects/${projectId}/artifacts/${item.artifactId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deleted: true, threadId }),
        });
        if (!response.ok) await readJsonResponse(response, "/api/attachments");
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
    // 键盘输入：光标前以 @ 或 / 结尾即触发（与改前一致，可在已有文字后直接触发）
    // 粘贴：onPaste 置 suppressSlashTrigger，避免正文里的 / 弹出文件选择器
    // mentions 为 false 时 @ 不当触发符，问老翁里输入 @ 不列出成员
    const pattern = !mentions
      ? suppressSlashTrigger.current
        ? null
        : /(\/)([^\s/@]*)$/
      : suppressSlashTrigger.current
        ? /(@)([^\s/@]*)$/
        : /([/@])([^\s/@]*)$/;
    const match = pattern ? pattern.exec(text.slice(0, caret)) : null;
    suppressSlashTrigger.current = false;
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
  const available = useMemo(
    () =>
      versions.filter(
        (v, i, all) => !v.deleted_at && all.findIndex((x) => x.artifact_id === v.artifact_id) === i,
      ),
    [versions],
  );
  const libraryFolders = useMemo(
    () =>
      folders.filter((folder) => {
        if (
          folder.folder_kind === "iteration_root" ||
          folder.folder_kind === "iteration_cache" ||
          folder.folder_kind === "iteration_outputs"
        )
          return false;
        return folderRootKind(folder.id, folders) !== null;
      }),
    [folders],
  );
  const mentionMembers = useMemo(
    () =>
      members.filter(
        (m) => m.kind !== "laoweng" && m.id !== AGENT_MEMBER.id && m.id !== currentUserId,
      ),
    [members, currentUserId],
  );
  const fileChoices = useMemo(
    () =>
      available.map((v) => {
        const label = fileDisplayName(v);
        return {
          id: v.id,
          kind: "file" as const,
          label,
          detail: v.title !== label ? v.title : v.filename,
        };
      }),
    [available],
  );
  const folderChoices = useMemo(
    () =>
      libraryFolders.map((folder) => {
        const label = folderDisplayName(folder);
        const path = libraryFolderPath(folder.id, folders);
        return {
          id: folder.id,
          kind: "folder" as const,
          label,
          detail: path !== label ? path : "文件夹",
        };
      }),
    [libraryFolders, folders],
  );
  const memberChoices = useMemo(
    () =>
      mentionMembers.map((m) => ({
        id: m.id,
        kind: "member" as const,
        label: m.name,
        detail:
          m.id === AGENT_XIAOXIANG_MEMBER.id ? AGENT_XIAOXIANG_MEMBER.identity_tags[0] : m.email,
        avatar:
          m.id === AGENT_XIAOXIANG_MEMBER.id
            ? m.avatar || AGENT_XIAOXIANG_MEMBER.avatar
            : m.avatar || undefined,
      })),
    [mentionMembers],
  );
  const options = (
    trigger?.symbol === "/" ? [...fileChoices, ...folderChoices] : mentions ? memberChoices : []
  )
    .filter((o) =>
      `${o.label} ${o.detail}`.toLowerCase().includes(trigger?.query.toLowerCase() || ""),
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
    const selectedMember =
      trigger.symbol === "@" ? mentionMembers.find((m) => m.id === option.id) : undefined;
    const mentionLabel =
      selectedMember &&
      selectedMember.id !== AGENT_XIAOXIANG_MEMBER.id &&
      mentionMembers.filter((m) => m.name === selectedMember.name).length > 1
        ? selectedMember.email
        : option.label;
    const replacement = `${trigger.symbol}${mentionLabel} `;
    setMessage((text) => text.slice(0, trigger.start) + replacement + text.slice(trigger.end));
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
          if (pending || slots.current || sending.current || busy || !message.trim()) return;
          sending.current = true;
          const body = message;
          try {
            if (await onSend(body)) {
              setMessage("");
              setUploads([]);
              setImagePreview(null);
              urls.current.forEach(URL.revokeObjectURL);
              urls.current = [];
              setTrigger(null);
            }
          } catch (error) {
            setMessage(body);
            throw error;
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
            <UiIcon name={expanded ? "compress" : "expand"} size={16} />
          </button>
        </div>
        {folderRefs.length > 0 && (
          <div className="references composer-folder-refs" aria-label="引用文件夹">
            {folderRefs.map((id) => {
              const folder = folders.find((item) => item.id === id);
              const label = folder
                ? libraryFolderPath(id, folders) || folderDisplayName(folder)
                : id;
              return (
                <span className="ref ref-folder" key={id}>
                  <UiIcon name="folder" size={14} /> {label}
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
                  role={
                    isImageFile(item.name) && (item.url || item.id) && !item.error
                      ? "button"
                      : undefined
                  }
                  tabIndex={
                    isImageFile(item.name) && (item.url || item.id) && !item.error ? 0 : undefined
                  }
                  title={
                    isImageFile(item.name) && (item.url || item.id) && !item.error
                      ? `预览 ${item.name}`
                      : undefined
                  }
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
                      <span>{item.progress === 99 ? "正在保存…" : `${item.progress}%`}</span>
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
                {item.error && <span className="attachment-error">{item.error}</span>}
              </div>
            ))}
          </div>
        )}
        <div className="chat-input-wrap" ref={inputWrapRef}>
          {trigger && (
            <FloatingPortal>
              <div
                ref={picker}
                className="composer-picker"
                style={placePopover(inputWrapRef.current, { width: 360, gap: 8, maxHeight: 240 })}
                role="listbox"
                id="composer-picker"
                aria-label={trigger.symbol === "/" ? "选择项目文件或文件夹" : "选择项目成员"}
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
                          editFileExtensionData={wechatFileIcons}
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
            </FloatingPortal>
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
            placeholder={
              mentions
                ? "写下想法… / 引用文件或文件夹，@ 提及成员；可拖拽或粘贴文件"
                : "写下想法… / 引用文件或文件夹；可拖拽或粘贴文件"
            }
            maxLength={20000}
            onChange={(e) => {
              setMessage(e.target.value);
              detect(e.target.value, e.target.selectionStart);
            }}
            onClick={(e) => detect(e.currentTarget.value, e.currentTarget.selectionStart)}
            onBlur={() => setTrigger(null)}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files);
              if (files.length) {
                e.preventDefault();
                e.stopPropagation();
                upload(files);
                return;
              }
              // 粘贴文本时即使内容含 `/` 也不打开文件引用面板
              suppressSlashTrigger.current = true;
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
                  (i) => (i + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length,
                );
              }
            }}
          />
        </div>
        <div className="composer-footer">
          {onDialogueModeChange || modes?.length ? (
            <div className="composer-mode-anchor" ref={modeMenuRef}>
              <button
                ref={modeButtonRef}
                type="button"
                className="composer-mode-toggle"
                aria-label={`${modes?.length ? "询问范围" : "对话模式"}：${selectedMode?.label || ""}`}
                aria-expanded={modeMenuOpen}
                aria-haspopup="menu"
                title={`${modes?.length ? "询问范围" : "对话模式"}：${selectedMode?.label || ""}`}
                onClick={() => setModeMenuOpen((open) => !open)}
              >
                <UiIcon name="plus" size={18} />
              </button>
              {modeMenuOpen ? (
                <FloatingPortal>
                  <ContextMenu
                    ref={modeMenuPanelRef}
                    onDismiss={() => setModeMenuOpen(false)}
                    className={`composer-mode-menu${modeMenuBox ? "" : " is-positioning"}`}
                    role="menu"
                    aria-label={modes?.length ? "询问范围" : "对话模式"}
                    style={{
                      position: "fixed",
                      left: modeMenuBox?.left ?? 0,
                      bottom: modeMenuBox?.bottom ?? 0,
                      width: "max-content",
                      maxWidth: "min(360px, calc(100vw - 16px))",
                    }}
                  >
                    {modeChoices.map((meta) => {
                      return (
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={selectedModeId === meta.id}
                          className={`composer-mode-option composer-mode-option-${meta.id}${selectedModeId === meta.id ? " is-active" : ""}`}
                          key={meta.id}
                          style={{ "--mode-accent": meta.accent } as React.CSSProperties}
                          onClick={() => {
                            if (modes?.length) onModeChange?.(meta.id);
                            else onDialogueModeChange?.(meta.id as DialogueMode);
                            setModeMenuOpen(false);
                          }}
                        >
                          <span className="composer-mode-option-icon" aria-hidden="true">
                            <UiIcon name={meta.icon as UiIconName} size={18} />
                          </span>
                          <span className="composer-mode-option-copy">
                            <span className="composer-mode-option-label">{meta.label}</span>
                            <span className="composer-mode-option-summary">{meta.summary}</span>
                          </span>
                        </button>
                      );
                    })}
                  </ContextMenu>
                </FloatingPortal>
              ) : null}
            </div>
          ) : null}
          {selectedMode &&
          (modes?.length
            ? selectedModeId !== modeChoices[0]?.id
            : onDialogueModeChange && dialogueMode !== "default") ? (
            <div
              className={`composer-mode-chip composer-mode-chip-${selectedMode.id}`}
              style={
                {
                  "--mode-accent": selectedMode.accent,
                  "--mode-surface": selectedMode.surface,
                } as React.CSSProperties
              }
            >
              <span className="composer-mode-chip-icon" aria-hidden="true">
                <UiIcon name={selectedMode.icon as UiIconName} size={16} />
              </span>
              <span className="composer-mode-chip-label">{selectedMode.label}</span>
              {(() => {
                // 老翁的询问范围也有「恢复默认」：当前项目 是默认项。
                const fallbackLabel = modes?.length
                  ? modeChoices[0]?.label || "当前项目"
                  : DIALOGUE_MODE_UI.default.label;
                return (
                  <button
                    type="button"
                    className="composer-mode-chip-clear"
                    aria-label={`退出 ${selectedMode.label}，恢复${fallbackLabel}`}
                    title={`恢复${fallbackLabel}`}
                    onClick={() => {
                      if (modes?.length) {
                        const fallbackId = modeChoices[0]?.id;
                        if (fallbackId) onModeChange?.(fallbackId);
                      } else onDialogueModeChange?.("default");
                    }}
                  >
                    <UiIcon name="close" size={12} />
                  </button>
                );
              })()}
            </div>
          ) : null}
          <button
            className="primary composer-send"
            type="submit"
            aria-label={pending ? "上传中" : busy ? "处理中" : "发送"}
            title={pending ? "上传中…" : busy ? "处理中…" : "发送"}
            disabled={busy || pending || !message.trim()}
          >
            <UiIcon name="send" size={17} />
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
