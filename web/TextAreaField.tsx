import React, { forwardRef, useId, useState, type TextareaHTMLAttributes } from "react";
import { Field, type FieldState } from "./Field";

export type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** 省略时不渲染浮动 label。 */
  label?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  /** 右下角自定义按钮区。 */
  action?: React.ReactNode;
  containerClassName?: string;
  /** 紧凑尺寸（30px）。 */
  dense?: boolean;
};

/** 多行文本输入。字数提示通过 maxLength + hint 组合实现。 */
export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  function TextAreaField(
    {
      label,
      hint,
      error,
      action,
      containerClassName,
      dense,
      id,
      value,
      defaultValue,
      disabled,
      rows,
      style,
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
    /* 非受控输入时用内部状态跟踪内容，保证浮动 label 正确。 */
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
        className={containerClassName}
        controlId={controlId}
        dense={dense}
      >
        <textarea
          {...props}
          rows={rows}
          style={
            rows
              ? {
                  ...style,
                  ["--field-textarea-min" as string]: `${rows * (dense ? 20 : 22) + (dense ? 12 : 16) + 2}px`,
                }
              : style
          }
          id={controlId}
          ref={ref}
          value={value}
          defaultValue={defaultValue}
          disabled={disabled}
          className={`field-textarea${className ? ` ${className}` : ""}`}
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
  },
);
