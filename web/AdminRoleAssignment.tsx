import { useEffect, useState } from "react";
import { AdminDialog } from "./AdminDialog";
import { showTip } from "./Tip";

type Options = {
  roles: { id: string; name: string; description: string; permissions: string[] }[];
  roleIds: string[];
  canAssign: boolean;
};

export function AdminRoleAssignment({
  member,
  permissions,
  api,
  onClose,
  onSaved,
}: {
  member: { id: string; name: string; is_super_admin: number };
  permissions: string[];
  api: (path: string, data?: unknown, method?: string) => Promise<any>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void api(`/admin/accounts/${member.id}/role-options`)
      .then((value) => {
        if (active) setOptions(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [member.id]);
  return (
    <AdminDialog title={`Admin角色 · ${member.name}`} onClose={onClose} busy={busy}>
      {(close) => (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!options?.canAssign || busy) return;
            setBusy(true);
            setError("");
            void (async () => {
              try {
                await api(
                  `/admin/accounts/${member.id}/roles`,
                  { roleIds: options.roleIds },
                  "PUT",
                );
                await onSaved();
                showTip("成员角色已保存");
                onClose();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {!options && !error && <p role="status">正在加载角色…</p>}
          {options && (
            <>
              {!!member.is_super_admin && <p>超级管理员拥有全部权限，无需分配角色。</p>}
              {!member.is_super_admin && !options.canAssign && (
                <p>不能修改自己的角色或权限范围高于自己的成员角色。</p>
              )}
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>选择角色</th>
                      <th>说明</th>
                      <th>权限数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {options.roles.map((role) => (
                      <tr key={role.id}>
                        <td>
                          <label className="permission-node">
                            <input
                              type="checkbox"
                              disabled={
                                busy ||
                                !options.canAssign ||
                                role.permissions.some((key) => !permissions.includes(key))
                              }
                              checked={options.roleIds.includes(role.id)}
                              onChange={(event) =>
                                setOptions({
                                  ...options,
                                  roleIds: event.target.checked
                                    ? [...options.roleIds, role.id]
                                    : options.roleIds.filter((id) => id !== role.id),
                                })
                              }
                            />
                            {role.name}
                          </label>
                        </td>
                        <td>{role.description || "暂无说明"}</td>
                        <td>{role.permissions.length}</td>
                      </tr>
                    ))}
                    {!options.roles.length && (
                      <tr>
                        <td colSpan={3} className="admin-empty">
                          暂无可分配角色，请先在角色权限页面创建角色。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="admin-editor-actions">
            <button type="button" disabled={busy} onClick={close}>
              取消
            </button>
            <button className="primary" disabled={busy || !options?.canAssign}>
              保存分配
            </button>
          </div>
        </form>
      )}
    </AdminDialog>
  );
}
