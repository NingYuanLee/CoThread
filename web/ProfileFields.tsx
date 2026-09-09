import React from "react";
import { IDENTITY_TAGS } from "../shared/profile.js";

export type PersonalProfile = {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  motto: string;
  identity_tags: string[];
};

export async function prepareAvatar(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("请选择 PNG、JPEG 或 WebP 图片");
  if (file.size > 5 * 1024 * 1024) throw new Error("头像图片不能超过 5 MiB");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("无法读取这张图片，请换一张图片重试");
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法处理头像，请重试");
    const side = Math.min(bitmap.width, bitmap.height);
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      256,
      256,
    );
    let image = canvas.toDataURL("image/webp", 0.78);
    if (!image.startsWith("data:image/webp")) image = canvas.toDataURL("image/jpeg", 0.78);
    if (image.length > 44000) image = canvas.toDataURL("image/jpeg", 0.55);
    return image;
  } finally {
    bitmap.close();
  }
}

export function ProfileFields({
  user,
  avatar,
  busy,
  onUpload,
  onRemove,
}: {
  user: PersonalProfile;
  avatar: string | null;
  busy: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <fieldset className="profile-fields" disabled={busy}>
      <div className="profile-avatar-editor">
        <span className="avatar profile-avatar-preview">
          {avatar ? <img src={avatar} alt="头像预览" /> : user.name[0]}
        </span>
        <div className="profile-avatar-controls">
          <label className="profile-upload-button">
            {avatar ? "更换头像" : "上传头像"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label="上传头像"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) onUpload(file);
              }}
            />
          </label>
          {avatar && (
            <button type="button" onClick={onRemove}>
              移除头像
            </button>
          )}
          <small>PNG、JPEG、WebP，最大 5 MiB，自动居中裁切</small>
        </div>
      </div>
      <label>
        姓名
        <input
          name="name"
          defaultValue={user.name}
          required
          maxLength={80}
          autoComplete="name"
          placeholder="你的姓名"
        />
      </label>
      <label>
        座右铭
        <textarea
          name="motto"
          defaultValue={user.motto}
          maxLength={200}
          rows={2}
          placeholder="一句话介绍你的态度（选填，最多 200 字）"
        />
      </label>
      <fieldset className="profile-tags">
        <legend>
          角色标签 <small>单选</small>
        </legend>
        <div>
          {["", ...IDENTITY_TAGS].map((tag) => (
            <label key={tag || "none"}>
              <input
                type="radio"
                name="identity_tags"
                value={tag}
                defaultChecked={(user.identity_tags[0] || "") === tag}
              />
              <span data-role={tag}>{tag || "暂不设置"}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </fieldset>
  );
}
