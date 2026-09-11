import React, { useEffect, useState } from "react";

type Api = (path: string, data?: unknown, method?: string) => Promise<any>;
type AdminProject = {
  id: string; name: string; description: string; creator: string; created_at: string;
  archived_at: string | null; members: { id: string; username: string; name: string; email: string | null; role: string }[];
  changes: ChangeLog[];
};
type AdminAccount = {
  id: string; user_number: number; username: string; name: string; email: string | null; is_super_admin: number; disabled_at: string | null;
  projects: { id: string; name: string; role: string; archived_at: string | null }[];
  changes: ChangeLog[];
  logins: LoginLog[];
};
type ChangeLog = { action: string; actor: string; details: unknown; created_at: string };
type LoginLog = { ip: string; country: string | null; province: string | null; city: string | null; district: string | null; success: number; failure_reason: string | null; created_at: string };

const date = (value: string) => new Date(value.replace(" ", "T") + "Z").toLocaleDateString("zh-CN");
const dateTime = (value: string) => new Date(value.replace(" ", "T") + "Z").toLocaleString("zh-CN");
const actionNames: Record<string, string> = {
  created: "新建", archived: "归档", restored: "恢复", profile_updated: "变更资料",
  member_added: "添加成员", member_removed: "移出成员", password_changed: "修改密码",
  password_reset: "重置密码", disabled: "停用账号", enabled: "启用账号",
  registered: "邮箱注册", email_bound: "绑定邮箱", password_recovered: "邮箱重置密码",
};

export function SystemManagement({ section, api, currentUserId, onProjectsChanged }: {
  section: "projects" | "accounts";
  api: Api;
  currentUserId: string;
  onProjectsChanged: () => Promise<void>;
}) {
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [expanded, setExpanded] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState<{ name: string; username: string; value: string; copied?: boolean; initial?: boolean } | null>(null);
  const load = async () => {
    if (section === "projects") setProjects(await api("/admin/projects"));
    else setAccounts(await api("/admin/accounts"));
  };
  useEffect(() => { setError(""); setExpanded(""); setCreating(false); setPassword(null); void load().catch((e) => setError(e.message)); }, [section]);
  const action = async (work: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await work(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const loginDetails = (value: { username: string; value: string }) =>
    `网站：${document.title}\n访问地址：${window.location.origin}\n账号：${value.username}\n密码：${value.value}`;
  return (
    <div className="admin-manager">
      <div className="admin-manager-toolbar">
        <div><h3>{section === "projects" ? "项目管理" : "账号管理"}</h3>
          <p>{section === "projects" ? "新建、归档或恢复项目，并查看项目成员。" : "维护系统账号及其项目权限。"}</p></div>
        <button type="button" className="primary" onClick={() => setCreating(!creating)}>{creating ? "取消" : section === "projects" ? "新增项目" : "新增账号"}</button>
      </div>
      {creating && (section === "projects" ? (
        <div className="admin-create-form">
          <input id="admin-project-name" aria-label="项目名称" placeholder="项目名称" maxLength={120} />
          <textarea id="admin-project-description" aria-label="项目简介" placeholder="项目简介（选填）" maxLength={4000} />
          <button type="button" disabled={busy} onClick={() => void action(async () => {
            const name = (document.getElementById("admin-project-name") as HTMLInputElement).value.trim();
            const description = (document.getElementById("admin-project-description") as HTMLTextAreaElement).value.trim();
            if (!name) throw new Error("请输入项目名称");
            await api("/admin/projects", { name, description }); setCreating(false); await load(); await onProjectsChanged();
          })}>确认新增</button>
        </div>
      ) : (
        <div className="admin-create-form">
          <input id="admin-account-name" aria-label="姓名" placeholder="姓名" maxLength={80} />
          <input id="admin-account-username" aria-label="账号名" placeholder="账号名" maxLength={80} />
          <button type="button" disabled={busy} onClick={() => void action(async () => {
            const name = (document.getElementById("admin-account-name") as HTMLInputElement).value.trim();
            const username = (document.getElementById("admin-account-username") as HTMLInputElement).value.trim();
            const result = await api("/admin/accounts", { name, username });
            let copied = false;
            try { await navigator.clipboard.writeText(loginDetails({ username: result.username, value: result.password })); copied = true; } catch { /* Keep the one-time display available. */ }
            setPassword({ name: result.name, username: result.username, value: result.password, copied, initial: true });
            setCreating(false); await load();
          })}>确认新增</button>
        </div>
      ))}
      {password && <div className="one-time-password" role="status">
        <strong>{password.name} 的{password.initial ? "初始" : "新"}密码</strong>
        <span>账号：{password.username}</span><code>{password.value}</code>
        <small>{password.initial && password.copied ? "网站、访问地址、账号和密码已自动复制。" : "请立即交给账号本人。关闭后无法再次查看。"}</small>
        {password.initial && <button type="button" onClick={() => void (async () => {
          try { await navigator.clipboard.writeText(loginDetails(password)); setPassword({ ...password, copied: true }); }
          catch { setError("浏览器未允许写入剪贴板，请手动选择上方账号和密码。"); }
        })()}>{password.copied ? "再次复制登录信息" : "复制登录信息"}</button>}
      </div>}
      {error && <div className="error" role="alert">{error}</div>}
      <div className="admin-list">
        {(section === "projects" ? projects : accounts).map((item) => {
          const isProject = section === "projects";
          const project = item as AdminProject, account = item as AdminAccount;
          const inactive = isProject ? !!project.archived_at : !!account.disabled_at;
          return <article className="admin-row" key={item.id}>
            <div className="admin-row-main">
              <button type="button" className="admin-row-title" onClick={() => setExpanded(expanded === item.id ? "" : item.id)} aria-expanded={expanded === item.id}>
                <strong>{item.name}</strong><small>{isProject ? `${project.creator} · ${date(project.created_at)}` : `用户ID：${account.user_number} · 账号：${account.username}${account.email ? ` · ${account.email}` : " · 未绑定邮箱"}`}</small>
              </button>
              <span className={`status-badge ${inactive ? "inactive" : ""}`}>{inactive ? (isProject ? "已归档" : "已停用") : "正常"}</span>
              <button type="button" disabled={busy || (!isProject && account.id === currentUserId)} onClick={() => void action(async () => {
                if (isProject) { await api(`/admin/projects/${item.id}/${inactive ? "restore" : "archive"}`, {}, "PATCH"); await onProjectsChanged(); }
                else await api(`/admin/accounts/${item.id}/status`, { disabled: !inactive }, "PATCH");
                await load();
              })}>{inactive ? "恢复" : isProject ? "归档" : "停用"}</button>
              {!isProject && <button type="button" disabled={busy} onClick={() => {
                if (!window.confirm(`确定重置 ${account.name} 的密码？该账号当前登录将失效。`)) return;
                void action(async () => { const result = await api(`/admin/accounts/${item.id}/reset-password`, {}); setPassword({ name: account.name, username: account.username, value: result.password }); });
              }}>重置密码</button>}
            </div>
            {expanded === item.id && <div className="admin-row-detail">
              <strong>{isProject ? "项目成员" : "加入的项目"}</strong>
              {(isProject ? project.members : account.projects).length ? (isProject ? project.members : account.projects).map((related: any) =>
                <span key={related.id}>{related.name}<small>{isProject ? related.username : related.archived_at ? "已归档" : related.role}</small></span>) : <p>暂无</p>}
              <strong className="audit-heading">变更记录</strong>
              {(isProject ? project.changes : account.changes).length ? (isProject ? project.changes : account.changes).map((change, index) =>
                <span className="audit-entry" key={`${change.created_at}-${index}`}><span>{actionNames[change.action] || change.action}<small>{change.actor}</small></span><time>{dateTime(change.created_at)}</time></span>) : <p>暂无变更记录</p>}
              {!isProject && <><strong className="audit-heading">登录记录</strong>
                {account.logins.length ? account.logins.map((login, index) => {
                  const location = [login.country, login.province, login.city, login.district].filter(Boolean).join(" - ") || "归属地未知";
                  return <span className="audit-entry login-entry" key={`${login.created_at}-${index}`}>
                    <span><b className={login.success ? "login-success" : "login-failure"}>{login.success ? "成功" : "失败"}</b> {login.ip}<small>{location}{login.failure_reason ? ` · ${login.failure_reason}` : ""}</small></span>
                    <time>{dateTime(login.created_at)}</time>
                  </span>;
                }) : <p>暂无登录记录</p>}
              </>}
            </div>}
          </article>;
        })}
      </div>
    </div>
  );
}
