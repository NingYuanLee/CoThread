import React, { forwardRef, useId, useState, type InputHTMLAttributes } from "react";
import { Field, type FieldState } from "./Field";

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  /** 省略时不渲染浮动 label。 */
  label?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  /** 右侧按钮区，例如"获取验证码"、"显示密码"。 */
  action?: React.ReactNode;
  /** 控件内左侧图标，例如搜索放大镜。 */
  icon?: React.ReactNode;
  containerClassName?: string;
  /** 紧凑尺寸（30px）。 */
  dense?: boolean;
  /** 高度交给外部 CSS（--field-flush-height），用于保持工具栏原有尺寸。 */
  flush?: boolean;
};

/** 单行文本输入。label 浮动由 Field 统一处理。 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  {
    label,
    hint,
    error,
    action,
    icon,
    containerClassName,
    dense,
    flush,
    id,
    value,
    defaultValue,
    disabled,
    onFocus,
    onBlur,
    className = "",
    ...props
  },
  ref,
) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const [focused, setFocused] = useState(false);
  /* 非受控输入（只给 defaultValue）时，用内部状态跟踪实际内容，
     否则浮动 label 不会随用户输入上浮。 */
  const [uncontrolledHasValue, setUncontrolledHasValue] = useState(
    defaultValue !== undefined && String(defaultValue).length > 0,
  );
  const hasValue = value !== undefined ? String(value).length > 0 : uncontrolledHasValue;
  const state: FieldState = disabled ? "disabled" : error ? "error" : focused ? "active" : "idle";
  return (
    <Field
      label={label}
      hasValue={hasValue}
      state={state}
      hint={hint}
      error={error}
      action={action}
      icon={icon}
      className={containerClassName}
      controlId={controlId}
      dense={dense}
      flush={flush}
    >
      <input
        {...props}
        id={controlId}
        ref={ref}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        className={`field-input${className ? ` ${className}` : ""}`}
        onInput={(event) => {
          if (value === undefined) setUncontrolledHasValue(event.currentTarget.value.length > 0);
        }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
      />
    </Field>
  );
});
