import { useEffect, useState } from "react";
import {
  ADMIN_PERMISSION_TREE,
  expandAdminPermissions,
  type AdminPermissionNode,
} from "../shared/admin-permissions.js";
import { api } from "./workspace-api";
import { UiIcon } from "./ui-icon";
import { showTip } from "./Tip";
import { AdminDialog, AdminConfirmDialog, type AdminConfirmation } from "./AdminDialog";

type Role = {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  member_count: number;
};
type Draft = { id?: string; name: string; description: string; permissions: string[] };
const descendants = (node: AdminPermissionNode): string[] => [
  node.key,
  ...(node.children || []).flatMap(descendants),
];

export function AdminRoles({
  permissions,
  onAccessChanged,
}: {
  permissions: string[];
  onAccessChanged: () => Promise<void>;
}) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<Role | null>(null);
  const [confirmation, setConfirmation] = useState<AdminConfirmation | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const canManage = permissions.includes("roles.manage");
  const load = async () => setRoles(await api("/admin/roles"));
  useEffect(() => {
    void load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
      await load();
      await onAccessChanged();
    } catch (e) {
      setError((e as Error).message);
      showTip((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const toggle = (node: AdminPermissionNode, checked: boolean) => {
    if (!draft) return;
    const keys = (
      checked
        ? [node.key, ...(node.type === "menu" ? (node.children || []).map((page) => page.key) : [])]
        : descendants(node)
    ).filter((key) => permissions.includes(key));
    const selected = new Set(draft.permissions);
    keys.forEach((key) => (checked ? selected.add(key) : selected.delete(key)));
    setDraft({ ...draft, permissions: expandAdminPermissions([...selected]) });
  };
  const checkbox = (node: AdminPermissionNode) => (
    <label key={node.key} className={`permission-node permission-${node.type}`}>
      <input
        type="checkbox"
        checked={draft?.permissions.includes(node.key) || false}
        disabled={busy || !permissions.includes(node.key)}
        onChange={(event) => toggle(node, event.target.checked)}
      />
      {node.label}
      <small>{node.type === "menu" ? "菜单" : node.type === "page" ? "页面" : "功能"}</small>
    </label>
  );
  return (
    <section className="admin-roles">
      <div className="admin-filters">
        <label className="admin-search">
          <UiIcon name="search" size={14} />
          <input
            aria-label="搜索角色"
            placeholder="搜索角色名称或说明"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {canManage && (
          <button
            className="primary"
            onClick={() => {
              setDraft({ name: "", description: "", permissions: [] });
            }}
          >
            <UiIcon name="plus" size={13} />
            新增角色
          </button>
        )}
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {draft && (
        <AdminDialog
          title={draft.id ? "编辑角色" : "新增角色"}
          onClose={() => setDraft(null)}
          busy={busy}
        >
          {(close) => (
            <form
              className="admin-editor"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await api(
                    draft.id ? `/admin/roles/${draft.id}` : "/admin/roles",
                    {
                      name: draft.name,
                      description: draft.description,
                      permissions: draft.permissions,
                    },
                    draft.id ? "PATCH" : "POST",
                  );
                  setDraft(null);
                  showTip("角色已保存");
                });
              }}
            >
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <p>功能权限自动包含所属页面与菜单；只选页面可配置只读角色。</p>
              <div className="admin-form-grid">
                <label>
                  角色名称
                  <input
                    autoFocus
                    required
                    maxLength={80}
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                </label>
                <label>
                  说明
                  <input
                    maxLength={500}
                    value={draft.description}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  />
                </label>
              </div>
              <h4>
                权限树 <small>菜单 → 页面 → 功能</small>
              </h4>
              <div className="permission-tree">
                {ADMIN_PERMISSION_TREE.map((menu) => (
                  <fieldset key={menu.key}>
                    <legend>{checkbox(menu)}</legend>
                    {menu.children?.map((page) => (
                      <div className="permission-page-block" key={page.key}>
                        {checkbox(page)}
                        <div className="permission-functions">{page.children?.map(checkbox)}</div>
                      </div>
                    ))}
                  </fieldset>
                ))}
              </div>
              <div className="admin-editor-actions">
                <button type="button" disabled={busy} onClick={close}>
                  取消
                </button>
                <button className="primary" disabled={busy}>
                  保存角色
                </button>
              </div>
            </form>
          )}
        </AdminDialog>
      )}

      {
        <div className="admin-table-wrap" aria-busy={loading}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>角色</th>
                <th>类型</th>
                <th>权限</th>
                <th>成员数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {["超级管理员", "内置", "全部权限"].some((value) => value.includes(search)) && (
                <tr>
                  <td>
                    <strong>超级管理员</strong>
                    <small>由现有超级管理员标记识别</small>
                  </td>
                  <td>
                    <span className="status-badge">内置</span>
                  </td>
                  <td>全部菜单 · 页面 · 功能</td>
                  <td>—</td>
                  <td>系统内置</td>
                </tr>
              )}
              {roles
                .filter((role) =>
                  [role.name, role.description].some((value) =>
                    value.toLowerCase().includes(search.toLowerCase()),
                  ),
                )
                .map((role) => (
                  <tr key={role.id}>
                    <td>
                      <strong>{role.name}</strong>
                      <small>{role.description || "暂无说明"}</small>
                    </td>
                    <td>自定义</td>
                    <td>
                      {role.permissions.length} 项权限
                      <small>
                        {ADMIN_PERMISSION_TREE.flatMap((menu) => menu.children || [])
                          .filter((page) => role.permissions.includes(page.key))
                          .map((page) => page.label)
                          .join("、") || "未配置页面"}
                      </small>
                    </td>
                    <td>{role.member_count}</td>
                    <td>
                      <div className="admin-table-actions">
                        <button onClick={() => setDetail(role)}>详情</button>
                        {canManage && (
                          <>
                            <button
                              disabled={
                                busy || role.permissions.some((key) => !permissions.includes(key))
                              }
                              onClick={() => {
                                setDraft({
                                  id: role.id,
                                  name: role.name,
                                  description: role.description,
                                  permissions: role.permissions,
                                });
                              }}
                            >
                              编辑
                            </button>
                            <button
                              disabled={
                                busy ||
                                Number(role.member_count) > 0 ||
                                role.permissions.some((key) => !permissions.includes(key))
                              }
                              onClick={() =>
                                setConfirmation({
                                  title: "删除角色",
                                  message: `删除未分配的角色「${role.name}」？`,
                                  confirm: async () => {
                                    await api(`/admin/roles/${role.id}`, {}, "DELETE");
                                    showTip("角色已删除");
                                  },
                                })
                              }
                            >
                              删除
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              {!loading &&
                !roles.some((role) =>
                  [role.name, role.description].some((value) =>
                    value.toLowerCase().includes(search.toLowerCase()),
                  ),
                ) &&
                !["超级管理员", "内置", "全部权限"].some((value) => value.includes(search)) && (
                  <tr>
                    <td colSpan={5} className="admin-empty">
                      没有符合筛选条件的角色
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      }
      {loading && <p className="admin-empty">正在加载角色…</p>}
      {detail && (
        <AdminDialog title={`${detail.name} · 权限详情`} onClose={() => setDetail(null)}>
          <p>{detail.description || "暂无说明"}</p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>菜单</th>
                  <th>页面</th>
                  <th>功能</th>
                </tr>
              </thead>
              <tbody>
                {ADMIN_PERMISSION_TREE.flatMap((menu) =>
                  (menu.children || [])
                    .filter((page) => detail.permissions.includes(page.key))
                    .map((page) => (
                      <tr key={page.key}>
                        <td>{menu.label}</td>
                        <td>{page.label}</td>
                        <td>
                          {(page.children || [])
                            .filter((fn) => detail.permissions.includes(fn.key))
                            .map((fn) => fn.label)
                            .join("、") || "只读"}
                        </td>
                      </tr>
                    )),
                )}
                {!ADMIN_PERMISSION_TREE.some((menu) =>
                  menu.children?.some((page) => detail.permissions.includes(page.key)),
                ) && (
                  <tr>
                    <td colSpan={3} className="admin-empty">
                      尚未配置页面权限
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </AdminDialog>
      )}
      <AdminConfirmDialog
        confirmation={confirmation}
        onClose={() => setConfirmation(null)}
        busy={busy}
        run={run}
      />
    </section>
  );
}
