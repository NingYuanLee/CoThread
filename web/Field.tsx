import React, { forwardRef, useId, type ReactNode } from "react";

/** Field 状态：无焦点、焦点活动、报警、禁用。 */
export type FieldState = "idle" | "active" | "error" | "disabled";

export type FieldProps = {
  /** 省略时不渲染浮动 label（用于筛选栏等自带标签的容器）。 */
  label?: ReactNode;
  /** 有内容时 label 上浮并缩小；无内容且未聚焦时 label 作为占位显示在框内。 */
  hasValue: boolean;
  state?: FieldState;
  hint?: ReactNode;
  error?: ReactNode;
  /** 右侧或右下角的自定义按钮区。 */
  action?: ReactNode;
  /** 控件内左侧图标（如搜索放大镜）。 */
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
  /** 与控件关联的 id，用于 label 的 for。 */
  controlId?: string;
  /** 紧凑尺寸（30px），用于筛选栏、工具栏等密集区域。 */
  dense?: boolean;
  /** 高度完全交给外部 CSS（--field-flush-height），用于保持工具栏原有尺寸。 */
  flush?: boolean;
};

/**
 * 输入类控件的外型组：label 浮动、四种状态、有无内容。
 * 只负责外型与状态呈现，不承载任何控件逻辑；TextField / TextAreaField / SelectField 共用。
 */
export const Field = forwardRef<HTMLDivElement, FieldProps>(function Field(
  {
    label,
    hasValue,
    state = "idle",
    hint,
    error,
    action,
    icon,
    className = "",
    children,
    controlId,
    dense,
    flush,
  },
  ref,
) {
  const autoId = useId();
  const id = controlId ?? autoId;
  const effective: FieldState = state === "disabled" ? "disabled" : error ? "error" : state;
  const floating =
    label !== undefined && (hasValue || effective === "active" || effective === "error");
  return (
    <div
      ref={ref}
      className={`field field--${effective}${floating ? " is-floating" : ""}${dense ? " field--dense" : ""}${flush ? " field--flush" : ""}${className ? ` ${className}` : ""}`}
    >
      <div className="field-control">
        {icon ? (
          <span className="field-icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {children}
        {label !== undefined && (
          <label className="field-label" htmlFor={id}>
            {label}
          </label>
        )}
        {action ? <span className="field-action">{action}</span> : null}
      </div>
      {error ? (
        <p className="field-message field-message--error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field-message">{hint}</p>
      ) : null}
    </div>
  );
});
