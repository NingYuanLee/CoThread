import { DialogFooter } from "./DialogFooter";
import { ImageField } from "./ImageField";
import { DialogBody } from "./DialogBody";
import { DialogHeader } from "./DialogHeader";
import React, { useState } from "react";
import { IDENTITY_TAGS } from "../shared/profile.js";
import { roleIcon, UiIcon } from "./ui-icon";
import { EmailBinding } from "./EmailBinding";
import { ModalBackdrop } from "./dialog-fx";
import { updateSavedAccountProfile } from "./saved-accounts";
import { showTip } from "./Tip";
import { TextField } from "./TextField";
import { SelectField } from "./SelectField";

export type PersonalProfile = {
  id: string;
  user_number: number;
  username: string;
  name: string;
  email: string | null;
  avatar: string | null;
  motto: string;
  identity_tags: string[];
  is_super_admin?: boolean;
  ui_theme?: string;
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
  api,
  onUpload,
  onRemove,
  onProfile,
}: {
  user: PersonalProfile;
  avatar: string | null;
  busy: boolean;
  api: (path: string, data?: unknown, method?: string) => Promise<any>;
  onUpload: (file: File) => void;
  onRemove: () => void;
  onProfile: (profile: PersonalProfile) => void;
}) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [role, setRole] = useState(user.identity_tags[0] || "");
  const [usernameOpen, setUsernameOpen] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState(user.username);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [idCopied, setIdCopied] = useState(false);
  const copyUserId = async () => {
    try {
      await navigator.clipboard.writeText(String(user.user_number));
      setIdCopied(true);
      showTip("用户ID已复制");
      window.setTimeout(() => setIdCopied(false), 1600);
    } catch {
      showTip("复制失败，请检查剪贴板权限。", "error");
    }
  };
  const saveUsername = async (close: () => void) => {
    const next = usernameDraft.trim();
    if (!passwordDraft) {
      showTip("请输入当前密码", "error");
      return;
    }
    if (next.length < 3) {
      showTip("用户名至少需要 3 位", "error");
      return;
    }
    try {
      const profile = await api(
        "/me/username",
        { username: next, currentPassword: passwordDraft },
        "PATCH",
      );
      updateSavedAccountProfile(profile);
      onProfile(profile);
      showTip("用户名已修改");
      close();
    } catch (error) {
      showTip(error instanceof Error ? error.message : "修改失败", "error");
    }
  };
  return (
    <fieldset className="profile-fields" disabled={busy}>
      <div className="profile-identity">
        <ImageField
          value={avatar}
          fallbackText={user.name[0]}
          uploadLabel="上传头像"
          changeLabel="更换头像"
          removeLabel="移除头像"
          disabled={busy}
          onSelect={onUpload}
          onRemove={onRemove}
        />
        <div className="profile-identity-fields">
          <span className="profile-email-field profile-id-row">
            <span className="profile-id-label">ID：</span>
            <span>{user.user_number}</span>
            <button type="button" className="profile-id-copy" onClick={() => void copyUserId()}>
              {idCopied ? "已复制" : "复制"}
            </button>
          </span>
          <div className="profile-name-row">
            <TextField
              name="name"
              label="姓名"
              defaultValue={user.name}
              required
              maxLength={80}
              autoComplete="name"
            />
            <button
              type="button"
              className={role ? "profile-role-trigger is-set" : "profile-role-trigger"}
              data-role={role || undefined}
              onClick={() => setRoleOpen(true)}
            >
              {role ? (
                <>
                  {(() => {
                    const icon = roleIcon(role);
                    return icon ? <UiIcon name={icon} size={12} /> : null;
                  })()}
                  {role}
                </>
              ) : (
                <>
                  <UiIcon name="plus" size={12} />
                  选择岗位
                </>
              )}
            </button>
          </div>
          <TextField name="motto" label="座右铭" defaultValue={user.motto} maxLength={15} />
          {role ? <input type="hidden" name="identity_tags" value={role} /> : null}
        </div>
      </div>
      <TextField
        label="用户名"
        value={user.username}
        readOnly
        containerClassName="profile-readonly-field"
        action={
          <button
            type="button"
            className="profile-field-action"
            onClick={() => {
              setUsernameDraft(user.username);
              setPasswordDraft("");
              setUsernameOpen(true);
            }}
          >
            <UiIcon name="edit" size={13} />
            修改
          </button>
        }
      />
      <TextField
        label="绑定邮箱"
        value={user.email || "未绑定"}
        readOnly
        hint="绑定后可使用邮箱登录和找回密码"
        containerClassName="profile-readonly-field"
        action={
          <button type="button" className="profile-field-action" onClick={() => setEmailOpen(true)}>
            <UiIcon name="email" size={13} />
            {user.email ? "更换" : "绑定邮箱"}
          </button>
        }
      />
      {roleOpen && (
        <ModalBackdrop onClose={() => setRoleOpen(false)}>
          {(close) => (
            <section
              className="modal profile-role-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="profile-role-title"
            >
              <DialogHeader
                title={<>选择岗位</>}
                titleId="profile-role-title"
                onClose={close}
                closeLabel="关闭选择岗位"
              />
              <DialogBody>
                <div className="profile-role-options">
                  {IDENTITY_TAGS.map((tag) => {
                    const icon = roleIcon(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        data-role={tag}
                        aria-pressed={role === tag}
                        onClick={() => {
                          setRole(tag);
                          close();
                        }}
                      >
                        {icon ? <UiIcon name={icon} size={12} /> : null}
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </DialogBody>
              {role ? (
                <DialogFooter>
                  <button
                    type="button"
                    className="profile-role-clear"
                    onClick={() => {
                      setRole("");
                      close();
                    }}
                  >
                    暂不设置
                  </button>
                </DialogFooter>
              ) : null}
            </section>
          )}
        </ModalBackdrop>
      )}
      {usernameOpen && (
        <ModalBackdrop onClose={() => setUsernameOpen(false)}>
          {(close) => (
            <section
              className="modal profile-username-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="profile-username-title"
            >
              <DialogHeader
                title={<>修改用户名</>}
                titleId="profile-username-title"
                onClose={close}
                closeLabel="关闭修改用户名"
              />
              <DialogBody>
                <TextField
                  label="用户名"
                  value={usernameDraft}
                  maxLength={80}
                  autoComplete="username"
                  onChange={(event) => setUsernameDraft(event.target.value)}
                />
                <TextField
                  label="当前密码"
                  type="password"
                  value={passwordDraft}
                  maxLength={200}
                  autoComplete="current-password"
                  onChange={(event) => setPasswordDraft(event.target.value)}
                />
              </DialogBody>
              <DialogFooter>
                <button type="button" className="primary" onClick={() => void saveUsername(close)}>
                  保存
                </button>
              </DialogFooter>
            </section>
          )}
        </ModalBackdrop>
      )}
      {emailOpen && (
        <ModalBackdrop onClose={() => setEmailOpen(false)}>
          {(close) => (
            <section
              className="modal email-bind-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="email-bind-title"
            >
              <DialogHeader
                title={<>{user.email ? "更换绑定邮箱" : "绑定邮箱"}</>}
                titleId="email-bind-title"
                onClose={close}
                closeLabel="关闭绑定邮箱"
              />
              <EmailBinding
                inDialog
                email={user.email}
                api={api}
                onBound={(profile) => {
                  updateSavedAccountProfile(profile);
                  onProfile(profile);
                  close();
                }}
              />
            </section>
          )}
        </ModalBackdrop>
      )}
    </fieldset>
  );
}
