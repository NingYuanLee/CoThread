import React, { useId, useRef, useState } from "react";
import { Field, type FieldState } from "./Field";

export type FileFieldProps = {
  /** 省略时不渲染浮动 label。 */
  label?: string;
  /** 已选/已保存文件的展示文本。 */
  value?: string;
  placeholder?: string;
  accept?: string;
  disabled?: boolean;
  /** 上传进行中，按钮显示忙态且禁用。 */
  busy?: boolean;
  /** 按钮文案，默认「选择文件」。 */
  actionLabel?: string;
  busyLabel?: string;
  title?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  containerClassName?: string;
  /** 紧凑尺寸（30px）。 */
  dense?: boolean;
  onSelect: (file: File) => void;
};

/**
 * 文件选择字段：不可编辑的文本框展示已选文件，右侧按钮触发系统选择框。
 * 与 TextField/SelectField 共用 Field 外型（36px、浮动 label、右侧按钮）。
 */
export function FileField({
  label,
  value,
  placeholder = "未选择文件",
  accept,
  disabled,
  busy,
  actionLabel = "选择文件",
  busyLabel = "处理中…",
  title,
  hint,
  error,
  containerClassName,
  dense,
  onSelect,
}: FileFieldProps) {
  const autoId = useId();
  const controlId = autoId;
  const fileRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const state: FieldState = disabled ? "disabled" : error ? "error" : focused ? "active" : "idle";

  return (
    <Field
      label={label}
      hasValue={Boolean(value)}
      state={state}
      hint={hint}
      error={error}
      className={containerClassName}
      controlId={controlId}
      dense={dense}
      action={
        disabled ? undefined : (
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? busyLabel : actionLabel}
          </button>
        )
      }
    >
      <input
        id={controlId}
        className="field-input"
        type="text"
        readOnly
        value={value || ""}
        placeholder={placeholder}
        title={title}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        tabIndex={-1}
        aria-hidden="true"
        hidden
        onChange={(event) => {
          const picked = event.target.files?.[0];
          if (picked) onSelect(picked);
          /* 允许重复选择同一个文件。 */
          event.target.value = "";
        }}
      />
    </Field>
  );
}
