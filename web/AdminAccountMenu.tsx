import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ContextMenu } from "./ContextMenu";
import { FloatingPortal } from "./FloatingPortal";
import type { PersonalProfile } from "./ProfileFields";
import { UiIcon } from "./ui-icon";

/** 管理空间顶栏账号入口：当前用户头像，以及个人设置 / 切换账号。 */
export function AdminAccountMenu({
  user,
  title,
  busy,
  onOpen,
}: {
  user: PersonalProfile;
  title: string;
  busy: boolean;
  onOpen: (panel: "profile" | "settings") => void;
}) {
  const [open, setOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [box, setBox] = useState({ left: 0, top: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setAvatarFailed(false);
  }, [user.avatar]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const button = buttonRef.current;
    const menu = menuRef.current;
    if (!button || !menu) return;
    const anchor = button.getBoundingClientRect();
    const rect = menu.getBoundingClientRect();
    const viewWidth = window.visualViewport?.width ?? document.documentElement.clientWidth;
    const offsetLeft = window.visualViewport?.offsetLeft ?? 0;
    const left = Math.min(
      Math.max(offsetLeft + 8, anchor.right - rect.width),
      Math.max(offsetLeft + 8, offsetLeft + viewWidth - rect.width - 8),
    );
    setBox((previous) =>
      previous.left === left && previous.top === anchor.bottom + 4
        ? previous
        : { left, top: anchor.bottom + 4 },
    );
  }, [open]);
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="sidebar-toggle admin-account-trigger"
        title={title}
        aria-label={`${user.name}，账号菜单`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="avatar admin-account-avatar">
          {user.avatar && !avatarFailed ? (
            <img src={user.avatar} alt="" onError={() => setAvatarFailed(true)} />
          ) : (
            user.name.slice(0, 1)
          )}
        </span>
      </button>
      {open ? (
        <FloatingPortal>
          <ContextMenu
            ref={menuRef}
            className="library-folder-menu admin-account-menu"
            style={{ left: box.left, top: box.top }}
            onDismiss={() => setOpen(false)}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              className="library-folder-menu-item"
              onClick={() => {
                setOpen(false);
                onOpen("profile");
              }}
            >
              <UiIcon name="human" size={14} />
              <span>个人设置</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="library-folder-menu-item"
              onClick={() => {
                setOpen(false);
                onOpen("settings");
              }}
            >
              <UiIcon name="login" size={14} />
              <span>切换账号</span>
            </button>
          </ContextMenu>
        </FloatingPortal>
      ) : null}
    </>
  );
}
