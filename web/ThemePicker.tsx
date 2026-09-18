import React, { useEffect, useRef, useState } from "react";
import { UI_THEMES, normalizeUiTheme } from "../shared/ui-theme.js";
import { applyUiTheme } from "./apply-ui-theme";
import { DialogClose, animateDialogClose, onDialogBackdropClick, onDialogCancel } from "./dialog-fx";

export function ThemePicker({
  theme,
  api,
  onChange,
}: {
  theme: string;
  api: (path: string, data?: unknown, method?: string) => Promise<any>;
  onChange: (profile: any) => void;
}) {
  const current = normalizeUiTheme(theme);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  const close = () => animateDialogClose(dialog.current, () => setOpen(false));
  const choose = async (id: string) => {
    if (id === current || busy) return;
    setBusy(true);
    setError("");
    applyUiTheme(id);
    try {
      onChange(await api("/me/theme", { theme: id }, "PATCH"));
      close();
    } catch (cause) {
      applyUiTheme(current);
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        ref={button}
        type="button"
        className="sidebar-toggle theme-picker-toggle"
        title="切换主题"
        aria-label="切换主题"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M12 3a9 9 0 1 0 9 9c0-.5-.07-1-.18-1.47a5.5 5.5 0 0 1-7.35-7.35C13 3.07 12.5 3 12 3Z" />
          <circle cx="9.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="7.5" cy="14" r="1" fill="currentColor" stroke="none" />
          <circle cx="11.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <dialog
        ref={dialog}
        className="theme-dialog"
        aria-labelledby="theme-dialog-title"
        onCancel={onDialogCancel(() => setOpen(false))}
        onClick={onDialogBackdropClick(() => setOpen(false))}
        onClose={() => {
          setOpen(false);
          button.current?.focus();
        }}
      >
        <div className="theme-dialog-header">
          <div>
            <h2 id="theme-dialog-title">选择主题</h2>
            <p>配色保存在当前账号，换设备登录后仍会使用这套主题。</p>
          </div>
          <DialogClose onClick={close} label="关闭主题选择" />
        </div>
        {error && (
          <p role="alert" className="theme-dialog-error">
            {error}
          </p>
        )}
        <div className="theme-grid" role="listbox" aria-label="可用主题">
          {UI_THEMES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="option"
              className={item.id === current ? "selected" : ""}
              aria-selected={item.id === current}
              disabled={busy}
              onClick={() => void choose(item.id)}
            >
              <span className="theme-swatch" aria-hidden="true">
                {item.preview.map((color) => (
                  <i key={color} style={{ background: color }} />
                ))}
              </span>
              <strong>{item.name}</strong>
              <small>{item.hint}</small>
            </button>
          ))}
        </div>
      </dialog>
    </>
  );
}
