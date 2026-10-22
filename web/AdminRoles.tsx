import { DialogFooter } from "./DialogFooter";
import { TextField } from "./TextField";
import { useEffect, useState } from "react";
import {
  ADMIN_PERMISSION_TREE,
  IMPLICIT_ADMIN_PERMISSIONS,
  expandAdminPermissions,
  type AdminPermissionNode,
} from "../shared/admin-permissions.js";
import { api } from "./workspace-api";
import { UiIcon } from "./ui-icon";
import { showTip, useTipError } from "./Tip";
import { AdminDialog, AdminConfirmDialog, type AdminConfirmation } from "./AdminDialog";
import { PaginationControl } from "./PaginationControl";

type Role = {
  id: string;
  scope: "platform" | "project";
  code: string | null;
  is_builtin: boolean;
  name: string;
  description: string;
  permissions: string[];
  member_count: number;
};
type Draft = { id?: string; name: string; description: string; permissions: string[] };
const matchesRoleSearch = (role: Role, search: string) =>
  [
    role.name,
    role.description,
    role.scope === "project" ? "项目内置" : "平台",
    role.is_builtin ? "内置" : "自定义",
    role.code === "super_admin" ? "全部权限" : "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(search.toLowerCase());
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [detail, setDetail] = useState<Role | null>(null);
  const [viewing, setViewing] = useState<Role | null>(null);
  const [confirmation, setConfirmation] = useState<AdminConfirmation | null>(null);
  const [error, setError] = useTipError();
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
  const alwaysOpen = (node: AdminPermissionNode) =>
    node.type === "page" && IMPLICIT_ADMIN_PERMISSIONS.includes(node.key);
  const readonlyCheckbox = (
    node: AdminPermissionNode,
    grantedAll: boolean,
    granted: Set<string>,
  ) => (
    <label key={node.key} className={`permission-node permission-${node.type}`}>
      <input
        type="checkbox"
        checked={grantedAll || alwaysOpen(node) || granted.has(node.key)}
        disabled
        readOnly
      />
      {node.label}
      <small>
        {alwaysOpen(node)
          ? "全员开放"
          : node.type === "menu"
            ? "菜单"
            : node.type === "page"
              ? "页面"
              : "功能"}
      </small>
    </label>
  );
  const checkbox = (node: AdminPermissionNode) => (
    <label key={node.key} className={`permission-node permission-${node.type}`}>
      <input
        type="checkbox"
        checked={alwaysOpen(node) || draft?.permissions.includes(node.key) || false}
        disabled={busy || alwaysOpen(node) || !permissions.includes(node.key)}
        onChange={(event) => toggle(node, event.target.checked)}
      />
      {node.label}
      <small>
        {alwaysOpen(node)
          ? "全员开放"
          : node.type === "menu"
            ? "菜单"
            : node.type === "page"
              ? "页面"
              : "功能"}
      </small>
    </label>
  );
  const filteredRoles = roles.filter((role) => matchesRoleSearch(role, search));
  const visibleRoles = filteredRoles.slice((page - 1) * pageSize, page * pageSize);
  return (
    <section className="admin-roles">
      <form
        className="admin-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
        }}
      >
        <TextField
          dense
          containerClassName="admin-search-field"
          label="搜索"
          icon={<UiIcon name="search" size={14} />}
          placeholder="搜索角色名称或说明"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <button type="submit">查询</button>
        <button
          type="button"
          onClick={() => {
            setSearch("");
            setPage(1);
          }}
        >
          重置
        </button>
      </form>
      {canManage && (
        <div className="admin-list-actions">
          <button
            type="button"
            className="primary"
            onClick={() => {
              setDraft({ name: "", description: "", permissions: [] });
            }}
          >
            <UiIcon name="plus" size={13} />
            新增角色
          </button>
        </div>
      )}
      {loading && (
        <p className="admin-empty" role="status">
          正在加载角色…
        </p>
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
              <div className="dialog-form-scroll admin-editor-fields">
                <p>功能权限自动包含所属页面与菜单；只选页面可配置只读角色。</p>
                <div className="admin-form-grid">
                  <TextField
                    label="角色名称"
                    autoFocus
                    required
                    maxLength={80}
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                  <TextField
                    label="说明"
                    maxLength={500}
                    value={draft.description}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  />
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
              </div>
              <DialogFooter>
                <button type="button" disabled={busy} onClick={close}>
                  取消
                </button>
                <button className="primary" disabled={busy}>
                  保存角色
                </button>
              </DialogFooter>
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
                <th>权限与范围</th>
                <th>成员数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleRoles.map((role) => (
                <tr key={role.id}>
                  <td>
                    <strong>{role.name}</strong>
                    <small>
                      {role.description ||
                        (role.code === "super_admin" ? "由超级管理员账号标记识别" : "暂无说明")}
                    </small>
                  </td>
                  <td>
                    <span className="status-badge">
                      {role.scope === "project"
                        ? "项目内置"
                        : role.is_builtin
                          ? "平台内置"
                          : "平台自定义"}
                    </span>
                  </td>
                  <td>
                    {role.scope === "project"
                      ? role.description
                      : role.code === "super_admin"
                        ? "全部菜单 · 页面 · 功能"
                        : `${role.permissions.length} 项权限`}
                    {role.scope === "platform" && role.code !== "super_admin" && (
                      <small>
                        {ADMIN_PERMISSION_TREE.flatMap((menu) => menu.children || [])
                          .filter((page) => role.permissions.includes(page.key))
                          .map((page) => page.label)
                          .join("、") || "未配置页面"}
                      </small>
                    )}
                    {role.scope === "project" && <small>管理入口：项目管理 → 项目成员</small>}
                  </td>
                  <td>{role.member_count}</td>
                  <td>
                    {role.scope === "platform" && !role.is_builtin ? (
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
                    ) : (
                      <div className="admin-table-actions">
                        <button onClick={() => setViewing(role)}>查看</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && !error && !filteredRoles.length && (
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
      {filteredRoles.length > 0 && (
        <PaginationControl
          total={filteredRoles.length}
          currentPage={page}
          pageSize={pageSize}
          pageSizeOptions={[10, 20, 30, 50, 100]}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          ariaLabel="角色列表分页"
        />
      )}
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
      {viewing && (
        <AdminDialog title={`${viewing.name} · 查看`} onClose={() => setViewing(null)}>
          {(close) => {
            const grantedAll = viewing.code === "super_admin";
            const granted = new Set(viewing.permissions);
            return (
              <div className="admin-editor dialog-footer-layout">
                <div className="dialog-form-scroll admin-editor-fields">
                  <p>
                    {`${viewing.scope === "project" ? "项目内置" : "平台内置"}角色只能查看，不能修改或删除。当前 ${viewing.member_count} 名成员。`}
                  </p>
                  <div className="admin-form-grid">
                    <TextField label="角色名称" readOnly value={viewing.name} />
                    <TextField label="说明" readOnly value={viewing.description || "暂无说明"} />
                  </div>
                  {viewing.scope === "platform" ? (
                    <>
                      <h4>
                        权限树 <small>菜单 → 页面 → 功能，只读</small>
                      </h4>
                      <div className="permission-tree">
                        {ADMIN_PERMISSION_TREE.map((menu) => (
                          <fieldset key={menu.key} disabled>
                            <legend>{readonlyCheckbox(menu, grantedAll, granted)}</legend>
                            {menu.children?.map((page) => (
                              <div className="permission-page-block" key={page.key}>
                                {readonlyCheckbox(page, grantedAll, granted)}
                                <div className="permission-functions">
                                  {page.children?.map((fn) =>
                                    readonlyCheckbox(fn, grantedAll, granted),
                                  )}
                                </div>
                              </div>
                            ))}
                          </fieldset>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p>
                      此角色只在项目成员中生效，不使用平台权限树。管理入口：项目管理 → 项目成员。
                    </p>
                  )}
                </div>
                <DialogFooter>
                  <button type="button" onClick={close}>
                    关闭
                  </button>
                </DialogFooter>
              </div>
            );
          }}
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
