import { readJsonResponse } from "../shared/json-response.js";
import { apiFetch } from "./api-fetch";
import React, { useEffect, useRef, useState } from "react";
import { AGENT_MEMBER } from "../shared/agent-member.js";
import { FileIcon } from "@react-symbols/icons/utils";
import { Document, Notebook } from "@react-symbols/icons/files";

type FileVersion = {
  id: string;
  artifact_id: string;
  filename: string;
  title: string;
  deleted_at?: string | null;
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
};
const isImage = (name: string) =>
  /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(name);
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
    if (url || !id || !isImage(name)) return;
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
  return isImage(name) && (url || preview) ? (
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
  versions,
  members,
  busy,
  onSend,
  onRefresh,
  uploadTarget,
}: {
  projectId: string;
  threadId: string;
  message: string;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  refs: string[];
  setRefs: React.Dispatch<React.SetStateAction<string[]>>;
  versions: FileVersion[];
  members: { id: string; name: string; email: string }[];
  busy: boolean;
  onSend: () => Promise<boolean>;
  onRefresh: () => Promise<void>;
  uploadTarget: React.MutableRefObject<((files: File[]) => void) | null>;
}) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState("");
  const [trigger, setTrigger] = useState<{
    symbol: string;
    query: string;
    start: number;
    end: number;
  } | null>(null);
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null);
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
      if (file.size > 5 * 1024 * 1024) {
        setError(`${file.name} 超过单文件 5 MiB 上限`);
        continue;
      }
      slots.current++;
      const key = crypto.randomUUID();
      const url = isImage(file.name) ? URL.createObjectURL(file) : undefined;
      if (url) urls.current.push(url);
      setUploads((rows) => [
        ...rows,
        { key, name: file.name, url, progress: 0 },
      ]);
      void (async () => {
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          let binary = "";
          for (let i = 0; i < bytes.length; i += 8192)
            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          const response = await apiFetch(`/api/threads/${threadId}/attachments`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(120000),
            body: JSON.stringify({title: file.name, filename: file.name,
              mime: file.type || "application/octet-stream", contentBase64: btoa(binary)}),
          }, (progress) => update(key, {progress}));
          const result = await readJsonResponse(response, `/api/threads/${threadId}/attachments`);
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
          if (!alive.current) return;
          currentRefs.current = [
            ...new Set([...currentRefs.current, result.id]),
          ];
          setRefs(currentRefs.current);
          setMessage(
            (text) =>
              `${text}${text && !/\s$/.test(text) ? " " : ""}/${file.name} `,
          );
          update(key, {
            id: result.id,
            artifactId: result.artifactId,
            progress: 100,
          });
          try {
            await onRefresh();
          } catch {
            setError("文件已保存，文档列表刷新失败，请稍后刷新");
          }
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
            body: JSON.stringify({ deleted: true }),
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
  const options = (
    trigger?.symbol === "/"
      ? available.map((v) => ({ id: v.id, label: v.filename, detail: v.title }))
      : members.map((m) => ({
          id: m.id,
          label: m.name,
          detail: m.id === AGENT_MEMBER.id ? "助理" : m.email,
        }))
  )
    .filter((o) =>
      `${o.label} ${o.detail}`
        .toLowerCase()
        .includes(trigger?.query.toLowerCase() || ""),
    )
    .slice(0, 30);
  const choose = (option: (typeof options)[number]) => {
    if (!trigger) return;
    if (trigger.symbol === "/") {
      if (!refs.includes(option.id) && refs.length + slots.current >= 30) {
        setError("每条消息最多引用 30 个文件");
        return;
      }
      setRefs((rows) => [...new Set([...rows, option.id])]);
    }
    const selectedMember = trigger.symbol === "@" ? members.find((m) => m.id === option.id) : undefined;
    const mentionLabel = selectedMember && members.filter((m) => m.name === selectedMember.name).length > 1
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
  const selected = refs
    .filter((id) => !uploads.some((u) => u.id === id))
    .map((id) => versions.find((v) => v.id === id))
    .filter((v): v is FileVersion => !!v);
  return (
    <form
      className="composer chat-composer"
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
            urls.current.forEach(URL.revokeObjectURL);
            urls.current = [];
            setTrigger(null);
          }
        } finally {
          sending.current = false;
        }
      }}
    >
      {(uploads.length > 0 || selected.length > 0) && (
        <div className="chat-attachments" aria-label="消息附件">
          {uploads.map((item) => (
            <div
              className={`chat-attachment ${item.error ? "failed" : ""}`}
              key={item.key}
              title={item.error || item.name}
            >
              <div className="attachment-preview">
                <FilePreview name={item.name} url={item.url} />
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
          {selected.map((v) => (
            <div className="chat-attachment" key={v.id} title={v.filename}>
              <div className="attachment-preview">
                <FilePreview name={v.filename} id={v.id} />
              </div>
              <small>{v.filename}</small>
              <button
                type="button"
                className="attachment-remove"
                aria-label={`取消引用 ${v.filename}`}
                disabled={busy}
                onClick={() => {
                  setRefs((rows) => rows.filter((id) => id !== v.id));
                  setMessage((text) => text.replace(`/${v.filename}`, ""));
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="chat-input-wrap">
        {trigger && (
          <div
            className="composer-picker"
            role="listbox"
            id="composer-picker"
            aria-label={
              trigger.symbol === "/" ? "选择项目文件" : "选择项目成员"
            }
          >
            <small>{trigger.symbol === "/" ? "项目文件" : "项目成员"}</small>
            {options.map((option, i) => (
              <button
                type="button"
                role="option"
                aria-selected={i === index}
                id={`composer-option-${i}`}
                key={option.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(option)}
              >
                {trigger.symbol === "/" ? (
                  <FileIcon
                    fileName={option.label}
                    autoAssign
                    width={20}
                    height={20}
                  />
                ) : (
                  <span className="mention-avatar">
                    {option.id === AGENT_MEMBER.id ? (
                      <img src={AGENT_MEMBER.avatar} alt="" />
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
              <p>没有匹配的{trigger.symbol === "/" ? "文件" : "成员"}</p>
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
          placeholder="写下想法… / 引用文件，@ 提及成员；可拖拽或粘贴文件"
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
        <small className="muted" title="单文件最大 5 MiB">
          Enter 发送 · Shift+Enter 换行 ·{" "}
          {members.filter((member) => member.id !== AGENT_MEMBER.id).length ===
          1
            ? "小祥会直接回复"
            : "@小祥 明确邀请回复"}
        </small>
        <button
          className="primary"
          disabled={busy || pending || !message.trim()}
        >
          {pending ? "上传中…" : busy ? "处理中…" : "发送 ↑"}
        </button>
      </div>
    </form>
  );
}
