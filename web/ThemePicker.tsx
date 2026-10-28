import { DialogHeader } from "./DialogHeader";
import React, { useRef, useState } from "react";
import { UI_THEMES, normalizeUiTheme } from "../shared/ui-theme.js";
import { UI_SCALES, detectedUiScale } from "../shared/ui-scale.js";
import { applyUiTheme } from "./apply-ui-theme";
import { applyUiScale, readUiScale } from "./apply-ui-scale";
import { Dialog, animateDialogClose } from "./dialog-fx";
import { SelectField } from "./SelectField";
import { showTip, useTipError } from "./Tip";

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
  const detected = detectedUiScale(window.devicePixelRatio);
  const [scale, setScale] = useState(readUiScale);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useTipError();
  const dialog = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const close = () => animateDialogClose(dialog.current, () => setOpen(false));
  const choose = async (id: string) => {
    if (id === current || busy) return;
    setBusy(true);
    setError("");
    applyUiTheme(id);
    try {
      onChange(await api("/me/theme", { theme: id }, "PATCH"));
      showTip("主题已切换");
      close();
    } catch (cause) {
      applyUiTheme(current);
      const detail = (cause as Error).message;
      setError(detail);
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
        <svg
          width="1.429rem"
          height="1.429rem"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path d="M12 3a9 9 0 1 0 9 9c0-.5-.07-1-.18-1.47a5.5 5.5 0 0 1-7.35-7.35C13 3.07 12.5 3 12 3Z" />
          <circle cx="9.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="7.5" cy="14" r="1" fill="currentColor" stroke="none" />
          <circle cx="11.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <Dialog
        active={open}
        onRequestClose={() => setOpen(false)}
        ref={dialog}
        className="theme-dialog"
        aria-labelledby="theme-dialog-title"
      >
        <DialogHeader
          title={<>选择主题</>}
          titleId="theme-dialog-title"
          subtitle={<>配色保存在当前账号。显示大小只记在这台设备上。</>}
          onClose={close}
          closeLabel="关闭主题选择"
        />
        <div className="theme-scale">
          <SelectField
            allOption={false}
            label="显示大小"
            hint={
              detected
                ? "这台电脑读到的是 " +
                  detected +
                  "%。倍率＝电脑缩放÷所选缩放。选得一样就保持现在的样子；选得更低会更大。"
                : "读不到这台电脑的缩放。没自定义过时用 100%。倍率＝电脑缩放÷所选缩放，读不到时按 100% 算。"
            }
            value={scale}
            options={UI_SCALES.map((item) => ({
              value: item.id,
              label: detected && item.id === detected ? item.name + " (推荐)" : item.name,
              keywords: item.hint,
            }))}
            onChange={(id) => {
              setScale(applyUiScale(id, true));
              showTip("显示大小已切换");
            }}
          />
        </div>
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
      </Dialog>
    </>
  );
}
