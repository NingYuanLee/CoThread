import { DialogFilters } from "./DialogFilters";
import { DialogHeader } from "./DialogHeader";
import React, { useEffect, useRef, useState } from "react";
import { UiIcon } from "./ui-icon";
import { Dialog, animateDialogClose } from "./dialog-fx";
import { showTip, useTipError } from "./Tip";
import { SelectField } from "./SelectField";

export function MemberPicker({
  projectId,
  api,
  onClose,
  onAdded,
}: {
  projectId: string;
  api: (path: string, data?: unknown, method?: string) => Promise<any>;
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [accounts, setAccounts] = useState<
    { id: string; username: string; name: string; email: string | null; avatar?: string | null }[]
  >([]);
  const [search, setSearch] = useState("");
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useTipError();
  const [role, setRole] = useState<"member" | "viewer">("member");
  const load = () => api(`/users?projectId=${encodeURIComponent(projectId)}`).then(setAccounts);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void load()
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId]);
  const visible = accounts.filter((account) =>
    `${account.name} ${account.username} ${account.email || ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const close = () => animateDialogClose(dialog.current, onClose);
  return (
    <Dialog
      onRequestClose={onClose}
      enabled={!busy}
      ref={dialog}
      className="modal member-picker dialog-list"
      aria-labelledby="member-picker-title"
    >
      <DialogHeader
        title={<>添加项目成员</>}
        titleId="member-picker-title"
        onClose={close}
        disabled={!!busy}
        closeLabel="关闭"
      />
      <DialogFilters
        label="成员列表筛选"
        keyword={{
          value: keyword,
          onChange: setKeyword,
          placeholder: "搜索姓名、用户名或邮箱",
          autoFocus: true,
        }}
        onQuery={() => setSearch(keyword.trim())}
        onReset={() => {
          setKeyword("");
          setSearch("");
        }}
        disabled={!!busy}
      />
      <SelectField
        label="加入后角色"
        value={role}
        onChange={(next) => setRole(next as "member" | "viewer")}
        options={[
          { value: "member", label: "普通成员（可编辑）" },
          { value: "viewer", label: "只读成员（仅查看）" },
        ]}
      />
      <div className="member-picker-list">
        {visible.map((account) => (
          <div className="member" key={account.id}>
            <span className="avatar">
              {account.avatar ? <img src={account.avatar} alt="" /> : account.name[0]}
            </span>
            <div>
              <strong>{account.name}</strong>
              <small>
                用户名：{account.username}
                {account.email ? ` · ${account.email}` : ""}
              </small>
            </div>
            <button
              type="button"
              className="primary"
              disabled={!!busy}
              onClick={() => {
                setBusy(account.id);
                setError("");
                void api(`/projects/${projectId}/members`, { userId: account.id, role })
                  .then(async () => {
                    await onAdded();
                    await load();
                    showTip("已添加项目成员");
                  })
                  .catch((e) => {
                    setError(e.message);
                  })
                  .finally(() => setBusy(""));
              }}
            >
              {busy === account.id ? (
                "添加中…"
              ) : (
                <>
                  <UiIcon name="userPlus" size={13} />
                  添加
                </>
              )}
            </button>
          </div>
        ))}
        {loading && (
          <p role="status" className="empty-state">
            正在加载账号…
          </p>
        )}
        {!loading && !error && !visible.length && (
          <p className="empty-state">没有可添加的系统账号</p>
        )}
      </div>
    </Dialog>
  );
}
