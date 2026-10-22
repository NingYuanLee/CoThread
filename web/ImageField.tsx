import React from "react";
import { UiIcon } from "./ui-icon";

const DEFAULT_ACCEPT = "image/png,image/jpeg,image/webp";

export type ImageFieldProps = {
  /** 当前图片地址；为空时显示 fallbackText。 */
  value?: string | null;
  /** 无图时的占位文字，通常传名称或首字。 */
  fallbackText?: string;
  /** 外层容器类名，默认 profile-avatar-slot。 */
  className?: string;
  /** 只读：不渲染相机遮罩、文件输入与移除按钮。 */
  readOnly?: boolean;
  /** 交互禁用（例如保存中）。 */
  disabled?: boolean;
  accept?: string;
  /** 未上传时的可访问名称。 */
  uploadLabel?: string;
  /** 已上传时的可访问名称。 */
  changeLabel?: string;
  /** 移除按钮的可访问名称，同时作为 title。 */
  removeLabel?: string;
  /** 选择文件后的处理，由调用方决定上传或转 dataURL。 */
  onSelect: (file: File) => void;
  /** 传了才显示移除按钮；未传时不显示。 */
  onRemove?: () => void;
};

/**
 * 图片上传预览：圆形预览 + hover 相机遮罩 + 隐藏 file input。
 * 结构与样式沿用 .profile-avatar-* 系列类名，供头像与项目图片共用。
 */
export function ImageField({
  value,
  fallbackText = "",
  className = "profile-avatar-slot",
  readOnly = false,
  disabled = false,
  accept = DEFAULT_ACCEPT,
  uploadLabel = "上传图片",
  changeLabel = "更换图片",
  removeLabel = "移除图片",
  onSelect,
  onRemove,
}: ImageFieldProps) {
  const interactive = !readOnly;
  return (
    <div className={className}>
      <label className={interactive ? "profile-avatar-hit" : "profile-avatar-hit is-readonly"}>
        <span className="avatar profile-avatar-preview">
          {value ? <img src={value} alt="" /> : fallbackText}
          {interactive && (
            <span className="profile-avatar-mask" aria-hidden="true">
              <UiIcon name="camera" size={20} />
            </span>
          )}
        </span>
        {interactive && (
          <input
            type="file"
            accept={accept}
            aria-label={value ? changeLabel : uploadLabel}
            disabled={disabled}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              /* 允许重复选择同一个文件。 */
              event.currentTarget.value = "";
              if (file) onSelect(file);
            }}
          />
        )}
      </label>
      {interactive && value && onRemove ? (
        <button
          type="button"
          className="profile-avatar-remove"
          disabled={disabled}
          onClick={onRemove}
          aria-label={removeLabel}
          title={removeLabel}
        >
          <UiIcon name="close" size={11} />
        </button>
      ) : null}
    </div>
  );
}
