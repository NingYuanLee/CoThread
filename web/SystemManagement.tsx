import React, { useEffect, useState } from "react";
import { UiIcon } from "./ui-icon";
import { showTip } from "./Tip";

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
type AgentLevel = "l1" | "l2" | "l3";
type PromptSkill = {
  id: string; name: string; description: string; agentLevel: AgentLevel; prompt: string;
  source: "custom"; enabled: boolean; version: number; createdBy: string | null; updatedBy: string | null; createdAt: string; updatedAt: string;
};
type DshPlugin = { key: string; pluginId: string; packageName: string; name: string; version: string; kind: string;
  policy: "required" | "optional" | "forbidden"; origin: "dsh" | "cothread"; developerEnabled: boolean; effectiveEnabled: boolean;
  assembled: boolean | null; exposed: boolean; callable: boolean;
  capabilities: { key: string; type: "tool" | "mcp"; name: string; policy: "required" | "optional" | "forbidden"; developerEnabled: boolean; effectiveEnabled: boolean; toolNames: string[] }[] };
type PromptVariable = { key: string; layer: "system" | "task" | "runtime"; name: string; description: string; source: string };
type SystemPrompt = { name: string; description: string; prompt: string; sourceFiles: string[]; updatedAt: string };
type PluginManagementData = { levels: { id: AgentLevel; plugins: DshPlugin[]; skills: PromptSkill[]; promptVariables: PromptVariable[]; systemPrompt: SystemPrompt | null }[] };
type SkillDraft = { id?: string; name: string; description: string; prompt: string; enabled: boolean };
type PluginLevel = PluginManagementData["levels"][number];
type PluginView = "dsh" | "cothread-dsh-plugins" | "skill";

const pluginViews: { id: PluginView; label: string }[] = [
  { id: "dsh", label: "dsh-plugins" },
  { id: "cothread-dsh-plugins", label: "cothread-dsh-plugins" },
  { id: "skill", label: "自定义skills" },
];
const policyName = { required: "必需", optional: "可选·默认启用", forbidden: "禁止" } as const;

function PolicyBadge({ policy }: { policy: "required" | "optional" | "forbidden" }) {
  return <span className={`capability-policy ${policy}`}><UiIcon name={policy === "required" ? "checkCircle" : policy === "forbidden" ? "blocked" : "info"} size={10} />{policyName[policy]}</span>;
}

function SystemPromptDetails({ level, agentLevel }: { level: PluginLevel; agentLevel: AgentLevel }) {
  return <details className="system-prompt-plugin">
    <summary><span><strong>{level.systemPrompt?.name || `${agentLevel.toUpperCase()} 系统提示词`}</strong><small>查看只读提示词正文、注入来源和变量注释</small></span><span className="status-badge"><UiIcon name="lock" size={10} />开发者只读</span></summary>
    <div className="system-prompt-panel">
      <p>{level.systemPrompt?.description || "当前层级尚未登记系统提示词。"}</p>
      {level.systemPrompt && <><pre>{level.systemPrompt.prompt}</pre><div className="system-prompt-sources"><strong>注入来源</strong>{level.systemPrompt.sourceFiles.map((source) => <code key={source}>{source}</code>)}</div></>}
      <section className="prompt-variable-panel"><div><strong>变量注释</strong><small>动态内容按注入层标识；任务变量不是系统权限，也不能覆盖原子能力边界。</small></div>
        <div className="prompt-variable-list">{level.promptVariables.map((variable) => <div key={variable.key} className="prompt-variable-row">
          <span className={`prompt-layer ${variable.layer}`}>{variable.layer === "system" ? "系统" : variable.layer === "task" ? "任务" : "运行时"}</span>
          <code>{`\${${variable.key}}`}</code><span><strong>{variable.name}</strong><small>{variable.description}</small><code>来源：{variable.source}</code></span>
        </div>)}</div>
      </section>
    </div>
  </details>;
}

function PluginInventory({ level, agentLevel, origin }: {
  level?: PluginLevel; agentLevel: AgentLevel; origin: "dsh" | "cothread";
}) {
  const inventory = level?.plugins.filter((plugin) => plugin.origin === origin) || [];
  const label = origin === "dsh" ? "dsh-plugins" : "cothread-dsh-plugins";
  return <><p className="plugin-foundation-note">{origin === "dsh" ? "dsh-plugins 展示 DSH 原生运行时插件。" : "cothread-dsh-plugins 展示共序自创并注入 DSH 的运行时插件。"} 装配状态来自生产 patch 的配置组合快照，不是当前 Harness 进程的实时加载结果。禁止项表示该层已明确停用或未装配。</p><div className="plugin-list">
    {inventory.map((plugin) => {
      return <React.Fragment key={plugin.key}><article className="plugin-row">
        <div className="plugin-copy"><strong>{plugin.name}</strong><small>{plugin.kind.toUpperCase()} · {plugin.pluginId}</small><code>{plugin.packageName} · v{plugin.version}</code></div>
        <PolicyBadge policy={plugin.policy} />
        <div className="plugin-runtime-states">
          <span className={`status-badge ${plugin.assembled ? "" : "inactive"}`}><UiIcon name={plugin.assembled ? "checkCircle" : "clock"} size={10} />{plugin.assembled ? "配置已装配" : "未装配"}</span>
          <span className={`status-badge ${plugin.exposed ? "" : "inactive"}`}><UiIcon name={plugin.exposed ? "eye" : "blocked"} size={10} />{plugin.exposed ? "本层已暴露" : "本层未暴露"}</span>
          <span className={`status-badge ${plugin.callable ? "" : "inactive"}`}><UiIcon name={plugin.callable ? "play" : "pause"} size={10} />{plugin.callable ? "可调用" : "不可调用"}</span>
        </div>
        {!!plugin.capabilities.length && <div className="plugin-provided-capabilities">{plugin.capabilities.map((capability) => <span key={capability.key}><b>{capability.type.toUpperCase()}</b>{capability.name}<small>{policyName[capability.policy]}</small></span>)}</div>}
      </article>{plugin.pluginId === "system-prompt" && level && <SystemPromptDetails level={level} agentLevel={agentLevel} />}</React.Fragment>;
    })}
    {!inventory.length && <p className="monitor-empty">当前层级没有登记 {label}。</p>}
  </div></>;
}

const utcDate = (value: string) => new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
const date = (value: string) => utcDate(value).toLocaleDateString("zh-CN");
const dateTime = (value: string) => utcDate(value).toLocaleString("zh-CN");
const actionNames: Record<string, string> = {
  created: "新建", archived: "归档", restored: "恢复", profile_updated: "变更资料",
  member_added: "添加成员", member_removed: "移出成员", password_changed: "修改密码",
  password_reset: "重置密码", disabled: "停用账号", enabled: "启用账号",
  registered: "邮箱注册", email_bound: "绑定邮箱", password_recovered: "邮箱重置密码",
};

export function SystemManagement({ section, api, currentUserId, onProjectsChanged }: {
  section: "projects" | "accounts" | "plugins";
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
  const [plugins, setPlugins] = useState<PluginManagementData | null>(null);
  const [agentLevel, setAgentLevel] = useState<AgentLevel>("l1");
  const [pluginType, setPluginType] = useState<PluginView>("dsh");
  const [skillDraft, setSkillDraft] = useState<SkillDraft | null>(null);
  const load = async () => {
    if (section === "projects") setProjects(await api("/admin/projects"));
    else if (section === "accounts") setAccounts(await api("/admin/accounts"));
    else setPlugins(await api("/admin/plugins"));
  };
  useEffect(() => { setError(""); setExpanded(""); setCreating(false); setPassword(null); setSkillDraft(null); void load().catch((e) => setError(e.message)); }, [section]);
  const action = async (work: () => Promise<void>, success?: string) => {
    setBusy(true); setError("");
    try {
      await work();
      if (success) showTip(success);
    }
    catch (e) {
      const detail = (e as Error).message;
      setError(detail);
      showTip(detail, "error");
    }
    finally { setBusy(false); }
  };
  const loginDetails = (value: { username: string; value: string }) =>
    `网站：${document.title}\n访问地址：${window.location.origin}\n账号：${value.username}\n密码：${value.value}`;
  if (section === "plugins") {
    const level = plugins?.levels.find((item) => item.id === agentLevel);
    const saveSkill = async () => {
      if (!skillDraft) return;
      if (!skillDraft.name.trim() || !skillDraft.prompt.trim()) throw new Error("请输入 Skill 名称和提示词");
      const payload = { agentLevel, name: skillDraft.name.trim(), description: skillDraft.description.trim(),
        prompt: skillDraft.prompt.trim(), enabled: skillDraft.enabled };
      if (skillDraft.id) await api(`/admin/plugins/skills/${skillDraft.id}`, payload, "PATCH");
      else await api("/admin/plugins/skills", payload);
      setSkillDraft(null); await load();
    };
    return <div className="admin-manager plugin-manager">
      <div className="admin-manager-toolbar"><div><h3>插件管理</h3><p>查看各层只读运行时插件，并维护按层注入的纯提示词自定义 Skills。</p></div>
        {pluginType === "skill" && <button type="button" className="primary" onClick={() => setSkillDraft({ name: "", description: "", prompt: "", enabled: false })}><UiIcon name="plus" size={13} />新增 Skill</button>}
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      <div className="plugin-level-tabs" role="tablist" aria-label="Agent 层级">
        {(["l1", "l2", "l3"] as const).map((value) => <button type="button" role="tab" aria-selected={agentLevel === value} key={value} onClick={() => { setAgentLevel(value); setSkillDraft(null); }}><UiIcon name={value === "l1" ? "book" : value === "l2" ? "task" : "play"} size={12} />{value.toUpperCase()}</button>)}
      </div>
      <div className="plugin-type-tabs" role="tablist" aria-label="插件类型">
        {pluginViews.map((view) => <button type="button" role="tab" aria-selected={pluginType === view.id} key={view.id} onClick={() => { setPluginType(view.id); setSkillDraft(null); }}><UiIcon name={view.id === "skill" ? "skill" : "plugin"} size={12} />{view.label}</button>)}
      </div>
      {pluginType === "dsh" || pluginType === "cothread-dsh-plugins" ? <PluginInventory level={level} agentLevel={agentLevel} origin={pluginType === "dsh" ? "dsh" : "cothread"} /> : <>
        {skillDraft && <div className="skill-editor">
          <div className="skill-editor-heading"><strong>{skillDraft.id ? "编辑 Skill" : "新增 Skill"}</strong><button type="button" onClick={() => setSkillDraft(null)}><UiIcon name="close" size={12} />取消</button></div>
          <label>名称<input value={skillDraft.name} maxLength={120} onChange={(event) => setSkillDraft({ ...skillDraft, name: event.target.value })} /></label>
          <label>说明<input value={skillDraft.description} maxLength={500} onChange={(event) => setSkillDraft({ ...skillDraft, description: event.target.value })} /></label>
          <label>提示词<textarea value={skillDraft.prompt} maxLength={30000} onChange={(event) => setSkillDraft({ ...skillDraft, prompt: event.target.value })} /></label>
          <label className="skill-enabled"><input type="checkbox" checked={skillDraft.enabled} onChange={(event) => setSkillDraft({ ...skillDraft, enabled: event.target.checked })} />启用此 Skill</label>
          <button type="button" className="primary" disabled={busy} onClick={() => void action(saveSkill, skillDraft.id ? "Skill 已保存" : "Skill 已创建")}><UiIcon name="save" size={13} />保存 Skill</button>
        </div>}
        <div className="plugin-list">
          {level?.skills.map((skill) => <article className="plugin-row skill-row" key={skill.id}>
            <div className="plugin-copy"><strong>{skill.name}</strong><small>{skill.description || skill.prompt.slice(0, 100)}</small><code>纯提示词 · v{skill.version}</code></div>
            <span className={`status-badge ${skill.enabled ? "" : "inactive"}`}><UiIcon name={skill.enabled ? "checkCircle" : "pause"} size={10} />{skill.enabled ? "已启用" : "已停用"}</span>
            <button type="button" onClick={() => setSkillDraft({ id: skill.id, name: skill.name, description: skill.description, prompt: skill.prompt, enabled: skill.enabled })}><UiIcon name="edit" size={12} />编辑</button>
            <button type="button" disabled={busy} onClick={() => { if (!window.confirm(`确定归档 Skill「${skill.name}」？`)) return; void action(async () => { await api(`/admin/plugins/skills/${skill.id}`, {}, "DELETE"); await load(); }, "Skill 已归档"); }}><UiIcon name="archive" size={12} />归档</button>
          </article>)}
          {!level?.skills.length && !skillDraft && <p className="monitor-empty">当前层级还没有自定义 Skills。</p>}
        </div>
      </>}
    </div>;
  }
  return (
    <div className="admin-manager">
      <div className="admin-manager-toolbar">
        <div><h3>{section === "projects" ? "项目管理" : "成员管理"}</h3>
          <p>{section === "projects" ? "本公司内的项目：新建、归档或恢复，并查看各项目人类成员。" : "仅人类成员（含超级管理员）。Agent 与本地执行器不属于公司目录。"}</p></div>
        <button type="button" className="primary" onClick={() => setCreating(!creating)}>{creating ? <><UiIcon name="close" size={13} />取消</> : <><UiIcon name="plus" size={13} />{section === "projects" ? "新增项目" : "新增成员"}</>}</button>
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
          }, "项目已创建")}><UiIcon name="plus" size={13} />确认新增</button>
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
          }, "成员已创建")}><UiIcon name="plus" size={13} />确认新增</button>
        </div>
      ))}
      {password && <div className="one-time-password" role="status">
        <strong>{password.name} 的{password.initial ? "初始" : "新"}密码</strong>
        <span>账号：{password.username}</span><code>{password.value}</code>
        <small>{password.initial && password.copied ? "网站、访问地址、账号和密码已自动复制。" : "请立即交给账号本人。关闭后无法再次查看。"}</small>
        {password.initial && <button type="button" onClick={() => void (async () => {
          try { await navigator.clipboard.writeText(loginDetails(password)); setPassword({ ...password, copied: true }); showTip("登录信息已复制"); }
          catch { setError("浏览器未允许写入剪贴板，请手动选择上方账号和密码。"); showTip("浏览器未允许写入剪贴板，请手动选择上方账号和密码。", "error"); }
        })()}>{password.copied ? <><UiIcon name="copy" size={12} />再次复制登录信息</> : <><UiIcon name="copy" size={12} />复制登录信息</>}</button>}
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
              <span className={`status-badge ${inactive ? "inactive" : ""}`}><UiIcon name={inactive ? (isProject ? "archive" : "pause") : "checkCircle"} size={10} />{inactive ? (isProject ? "已归档" : "已停用") : "正常"}</span>
              <button type="button" disabled={busy || (!isProject && account.id === currentUserId)} onClick={() => void action(async () => {
                if (isProject) { await api(`/admin/projects/${item.id}/${inactive ? "restore" : "archive"}`, {}, "PATCH"); await onProjectsChanged(); }
                else await api(`/admin/accounts/${item.id}/status`, { disabled: !inactive }, "PATCH");
                await load();
              }, isProject ? (inactive ? "项目已恢复" : "项目已归档") : (inactive ? "成员已恢复" : "成员已停用"))}><UiIcon name={inactive ? "restore" : isProject ? "archive" : "pause"} size={12} />{inactive ? "恢复" : isProject ? "归档" : "停用"}</button>
              {!isProject && <button type="button" disabled={busy} onClick={() => {
                if (!window.confirm(`确定重置 ${account.name} 的密码？该账号当前登录将失效。`)) return;
                void action(async () => { const result = await api(`/admin/accounts/${item.id}/reset-password`, {}); setPassword({ name: account.name, username: account.username, value: result.password }); }, "密码已重置");
              }}><UiIcon name="key" size={12} />重置密码</button>}
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
