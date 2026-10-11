import React, { useEffect, useState } from "react";
import { UiIcon } from "./ui-icon";
import { showTip } from "./Tip";
import { AdminRoleAssignment } from "./AdminRoleAssignment";
import { AdminDialog, AdminConfirmDialog, type AdminConfirmation } from "./AdminDialog";

type Api = (path: string, data?: unknown, method?: string) => Promise<any>;
type AdminProject = {
  id: string;
  name: string;
  description: string;
  creator: string;
  created_at: string;
  archived_at: string | null;
  members: { id: string; username: string; name: string; email: string | null; role: string }[];
  changes: ChangeLog[];
};
type AdminAccount = {
  id: string;
  user_number: number;
  avatar: string | null;
  created_at: string;
  username: string;
  name: string;
  email: string | null;
  is_super_admin: number;
  disabled_at: string | null;
  projects: { id: string; name: string; role: string; archived_at: string | null }[];
  changes: ChangeLog[];
  logins: LoginLog[];
};
type ChangeLog = { action: string; actor: string; details: unknown; created_at: string };
type LoginLog = {
  ip: string;
  country: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  success: number;
  failure_reason: string | null;
  created_at: string;
};
type AgentLevel = "l1" | "l2" | "l3";
type PromptSkill = {
  id: string;
  name: string;
  description: string;
  agentLevel: AgentLevel;
  prompt: string;
  source: "custom";
  enabled: boolean;
  version: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};
type DshPlugin = {
  key: string;
  pluginId: string;
  packageName: string;
  name: string;
  version: string;
  kind: string;
  policy: "required" | "optional" | "forbidden";
  origin: "dsh" | "cothread";
  developerEnabled: boolean;
  effectiveEnabled: boolean;
  assembled: boolean | null;
  exposed: boolean;
  callable: boolean;
  capabilities: {
    key: string;
    type: "tool" | "mcp";
    name: string;
    policy: "required" | "optional" | "forbidden";
    developerEnabled: boolean;
    effectiveEnabled: boolean;
    toolNames: string[];
  }[];
};
type PromptVariable = {
  key: string;
  layer: "system" | "task" | "runtime";
  name: string;
  description: string;
  source: string;
};
type SystemPrompt = {
  name: string;
  description: string;
  prompt: string;
  sourceFiles: string[];
  updatedAt: string;
};
type PluginManagementData = {
  levels: {
    id: AgentLevel;
    plugins: DshPlugin[];
    skills: PromptSkill[];
    promptVariables: PromptVariable[];
    systemPrompt: SystemPrompt | null;
  }[];
};
type SkillDraft = {
  id?: string;
  name: string;
  description: string;
  prompt: string;
  enabled: boolean;
};
type PluginLevel = PluginManagementData["levels"][number];
type PluginView = "dsh" | "cothread-dsh-plugins" | "skill";

const pluginViews: { id: PluginView; label: string }[] = [
  { id: "dsh", label: "dsh-plugins" },
  { id: "cothread-dsh-plugins", label: "cothread-dsh-plugins" },
  { id: "skill", label: "自定义skills" },
];
const policyName = { required: "必需", optional: "可选·默认启用", forbidden: "禁止" } as const;

function PolicyBadge({ policy }: { policy: "required" | "optional" | "forbidden" }) {
  return (
    <span className={`capability-policy ${policy}`}>
      <UiIcon
        name={policy === "required" ? "checkCircle" : policy === "forbidden" ? "blocked" : "info"}
        size={10}
      />
      {policyName[policy]}
    </span>
  );
}

const utcDate = (value: string) =>
  new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
const date = (value: string) => utcDate(value).toLocaleDateString("zh-CN");
const dateTime = (value: string) => utcDate(value).toLocaleString("zh-CN");
const actionNames: Record<string, string> = {
  created: "新建",
  archived: "归档",
  restored: "恢复",
  profile_updated: "变更资料",
  member_added: "添加成员",
  member_removed: "移出成员",
  password_changed: "修改密码",
  password_reset: "重置密码",
  disabled: "停用账号",
  enabled: "启用账号",
  registered: "邮箱注册",
  email_bound: "绑定邮箱",
  password_recovered: "邮箱重置密码",
};

function SystemPromptContent({ level }: { level: PluginLevel }) {
  return (
    <>
      <p>{level.systemPrompt?.description || "当前层级尚未登记系统提示词。"}</p>
      {level.systemPrompt && (
        <>
          <pre className="admin-prompt">{level.systemPrompt.prompt}</pre>
          <h4>注入来源</h4>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>源文件</th>
                </tr>
              </thead>
              <tbody>
                {level.systemPrompt.sourceFiles.map((source) => (
                  <tr key={source}>
                    <td>
                      <code>{source}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <h4>变量注释</h4>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>变量</th>
              <th>注入层</th>
              <th>说明 / 来源</th>
            </tr>
          </thead>
          <tbody>
            {level.promptVariables.map((variable) => (
              <tr key={variable.key}>
                <td>
                  <code>{`\${${variable.key}}`}</code>
                  <small>{variable.name}</small>
                </td>
                <td>
                  {variable.layer === "system"
                    ? "系统"
                    : variable.layer === "task"
                      ? "任务"
                      : "运行时"}
                </td>
                <td>
                  {variable.description}
                  <small>{variable.source}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PluginInventory({
  level,
  origin,
  search,
}: {
  level?: PluginLevel;
  origin: "dsh" | "cothread";
  search: string;
}) {
  const [detail, setDetail] = useState<DshPlugin | null>(null);
  const inventory = (level?.plugins || []).filter(
    (plugin) =>
      plugin.origin === origin &&
      [plugin.name, plugin.pluginId, plugin.packageName].some((value) =>
        value.toLowerCase().includes(search.toLowerCase()),
      ),
  );
  return (
    <>
      <div className="admin-table-wrap">
        <table className="admin-table admin-plugin-table">
          <thead>
            <tr>
              <th>插件</th>
              <th>版本</th>
              <th>策略</th>
              <th>装配状态</th>
              <th>调用状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {inventory.map((plugin) => (
              <tr key={plugin.key}>
                <td>
                  <strong>{plugin.name}</strong>
                  <small>{plugin.packageName}</small>
                </td>
                <td className="admin-nowrap">{plugin.version}</td>
                <td>
                  <PolicyBadge policy={plugin.policy} />
                </td>
                <td>
                  <span className={`status-badge ${plugin.assembled ? "" : "inactive"}`}>
                    {plugin.assembled ? "配置已装配" : "未装配"}
                  </span>
                </td>
                <td>
                  {plugin.callable ? "可调用" : "不可调用"}
                  <small>{plugin.exposed ? "本层已暴露" : "本层未暴露"}</small>
                </td>
                <td>
                  <button onClick={() => setDetail(plugin)}>详情</button>
                </td>
              </tr>
            ))}
            {!inventory.length && (
              <tr>
                <td colSpan={6} className="admin-empty">
                  没有符合筛选条件的插件
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="admin-list-note">装配状态来自生产配置快照，不代表当前进程的实时加载结果。</p>
      {detail && (
        <AdminDialog title={detail.name} onClose={() => setDetail(null)}>
          <p>
            {detail.pluginId} · {detail.kind.toUpperCase()} · v{detail.version}
          </p>
          <p>
            <code>{detail.packageName}</code>
          </p>
          <h4>提供的能力</h4>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>能力</th>
                  <th>类型</th>
                  <th>策略</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {detail.capabilities.map((capability) => (
                  <tr key={capability.key}>
                    <td>
                      {capability.name}
                      <small>{capability.toolNames.join("、")}</small>
                    </td>
                    <td>{capability.type.toUpperCase()}</td>
                    <td>
                      <PolicyBadge policy={capability.policy} />
                    </td>
                    <td>{capability.effectiveEnabled ? "已启用" : "已停用"}</td>
                  </tr>
                ))}
                {!detail.capabilities.length && (
                  <tr>
                    <td colSpan={4} className="admin-empty">
                      暂无登记能力
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {detail.pluginId === "system-prompt" && level && <SystemPromptContent level={level} />}
        </AdminDialog>
      )}
    </>
  );
}

function MemberAvatar({ account }: { account: AdminAccount }) {
  const [failed, setFailed] = useState(false);
  return account.avatar && !failed ? (
    <img
      className="admin-member-avatar"
      src={account.avatar}
      alt={`${account.name}的头像`}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  ) : (
    <span
      className="admin-member-avatar admin-avatar-fallback"
      role="img"
      aria-label={`${account.name}的头像`}
    >
      {account.name.slice(0, 1)}
    </span>
  );
}

function RecordDetails({
  item,
  isProject,
  section,
}: {
  item: AdminProject | AdminAccount;
  isProject: boolean;
  section: "details" | "related" | "changes" | "logins";
}) {
  const project = item as AdminProject,
    account = item as AdminAccount;
  const related = isProject ? project.members : account.projects;
  return (
    <>
      {section === "details" && (
        <dl className="admin-info-grid">
          <dt>{isProject ? "项目名称" : "姓名"}</dt>
          <dd>{item.name}</dd>
          {isProject ? (
            <>
              <dt>项目简介</dt>
              <dd className="admin-prewrap">{project.description || "暂无简介"}</dd>
              <dt>创建人</dt>
              <dd>{project.creator}</dd>
              <dt>创建时间</dt>
              <dd>{dateTime(project.created_at)}</dd>
              <dt>成员数</dt>
              <dd>{project.members.length}</dd>
              <dt>状态</dt>
              <dd>{project.archived_at ? "已归档" : "正常"}</dd>
            </>
          ) : (
            <>
              <dt>用户 ID</dt>
              <dd>{account.user_number}</dd>
              <dt>账号</dt>
              <dd>{account.username}</dd>
              <dt>邮箱</dt>
              <dd>{account.email || "未绑定"}</dd>
              <dt>创建时间</dt>
              <dd>{dateTime(account.created_at)}</dd>
              <dt>账号类型</dt>
              <dd>{account.is_super_admin ? "超级管理员" : "成员"}</dd>
              <dt>状态</dt>
              <dd>{account.disabled_at ? "已停用" : "正常"}</dd>
            </>
          )}
        </dl>
      )}
      {section === "related" && (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{isProject ? "成员" : "项目"}</th>
                  <th>{isProject ? "账号" : "状态"}</th>
                  <th>角色</th>
                </tr>
              </thead>
              <tbody>
                {related.map((value: any) => (
                  <tr key={value.id}>
                    <td>{value.name}</td>
                    <td>{isProject ? value.username : value.archived_at ? "已归档" : "正常"}</td>
                    <td>{value.role}</td>
                  </tr>
                ))}
                {!related.length && (
                  <tr>
                    <td colSpan={3} className="admin-empty">
                      暂无记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      {section === "changes" && (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>操作</th>
                  <th>操作人</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {item.changes.map((change, index) => (
                  <tr key={index}>
                    <td>{actionNames[change.action] || change.action}</td>
                    <td>{change.actor}</td>
                    <td>{dateTime(change.created_at)}</td>
                  </tr>
                ))}
                {!item.changes.length && (
                  <tr>
                    <td colSpan={3} className="admin-empty">
                      暂无变更记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!isProject && section === "logins" && (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>结果</th>
                  <th>IP / 归属地</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {account.logins.map((login, index) => (
                  <tr key={index}>
                    <td>
                      {login.success ? "成功" : "失败"}
                      <small>{login.failure_reason}</small>
                    </td>
                    <td>
                      {login.ip}
                      <small>
                        {[login.country, login.province, login.city, login.district]
                          .filter(Boolean)
                          .join(" - ") || "归属地未知"}
                      </small>
                    </td>
                    <td>{dateTime(login.created_at)}</td>
                  </tr>
                ))}
                {!account.logins.length && (
                  <tr>
                    <td colSpan={3} className="admin-empty">
                      暂无登录记录
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

export function SystemManagement({
  section,
  api,
  currentUserId,
  onProjectsChanged,
  onAccessChanged,
  permissions,
}: {
  section: "projects" | "accounts" | "plugins";
  api: Api;
  currentUserId: string;
  onProjectsChanged: () => Promise<void>;
  onAccessChanged: () => Promise<void>;
  permissions: string[];
}) {
  const can = (permission: string) => permissions.includes(permission);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [expanded, setExpanded] = useState("");
  const [detailSection, setDetailSection] = useState<"details" | "related" | "changes" | "logins">(
    "details",
  );
  const [assignment, setAssignment] = useState<AdminAccount | null>(null);
  const openDetail = (id: string, section: typeof detailSection) => {
    setExpanded(id);
    setDetailSection(section);
  };
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<AdminConfirmation | null>(null);
  const [password, setPassword] = useState<{
    name: string;
    username: string;
    value: string;
    copied?: boolean;
    initial?: boolean;
  } | null>(null);
  const [plugins, setPlugins] = useState<PluginManagementData | null>(null);
  const [agentLevel, setAgentLevel] = useState<AgentLevel>("l1");
  const [pluginType, setPluginType] = useState<PluginView>("dsh");
  const [skillDraft, setSkillDraft] = useState<SkillDraft | null>(null);
  const [skillDetail, setSkillDetail] = useState<PromptSkill | null>(null);
  const load = async () => {
    setLoading(true);
    try {
      if (section === "projects") setProjects(await api("/admin/projects"));
      else if (section === "accounts") setAccounts(await api("/admin/accounts"));
      else setPlugins(await api("/admin/plugins"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    setError("");
    setExpanded("");
    setAssignment(null);
    setCreating(false);
    setPassword(null);
    setSkillDraft(null);
    setConfirmation(null);
    setSearch("");
    setStatus("all");
    void load().catch((e) => setError(e.message));
  }, [section]);
  const action = async (work: () => Promise<void>, success?: string) => {
    setBusy(true);
    setError("");
    try {
      await work();
      if (success) showTip(success);
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      showTip(message, "error");
    } finally {
      setBusy(false);
    }
  };
  const loginDetails = (value: { username: string; value: string }) =>
    `网站：${document.title}\n访问地址：${window.location.origin}\n账号：${value.username}\n密码：${value.value}`;
  const feedback = error && (
    <div className="error" role="alert">
      {error}
    </div>
  );
  const confirmDialog = (
    <AdminConfirmDialog
      confirmation={confirmation}
      onClose={() => setConfirmation(null)}
      busy={busy}
      run={action}
    />
  );
  if (section === "plugins") {
    const level = plugins?.levels.find((item) => item.id === agentLevel);
    const saveSkill = async () => {
      if (!skillDraft) return;
      if (!skillDraft.name.trim() || !skillDraft.prompt.trim())
        throw new Error("请输入 Skill 名称和提示词");
      const payload = {
        agentLevel,
        name: skillDraft.name.trim(),
        description: skillDraft.description.trim(),
        prompt: skillDraft.prompt.trim(),
        enabled: skillDraft.enabled,
      };
      if (skillDraft.id) await api(`/admin/plugins/skills/${skillDraft.id}`, payload, "PATCH");
      else await api("/admin/plugins/skills", payload);
      setSkillDraft(null);
      await load();
    };
    const skills = (level?.skills || []).filter(
      (skill) =>
        (status === "all" || skill.enabled === (status === "active")) &&
        [skill.name, skill.description].some((value) =>
          value.toLowerCase().includes(search.toLowerCase()),
        ),
    );
    return (
      <div className="admin-manager">
        <div className="admin-filters">
          <label className="admin-search">
            <UiIcon name="search" size={14} />
            <input
              aria-label="搜索插件或Skill"
              placeholder="搜索插件或 Skill"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="Agent 层级"
            value={agentLevel}
            onChange={(e) => {
              setAgentLevel(e.target.value as AgentLevel);
              setSearch("");
            }}
          >
            <option value="l1">L1</option>
            <option value="l2">L2</option>
            <option value="l3">子 Agent</option>
          </select>
          <select
            aria-label="插件类型"
            value={pluginType}
            onChange={(e) => {
              setPluginType(e.target.value as PluginView);
              setSearch("");
              setStatus("all");
            }}
          >
            {pluginViews.map((view) => (
              <option key={view.id} value={view.id}>
                {view.label}
              </option>
            ))}
          </select>
          {pluginType === "skill" && (
            <select
              aria-label="Skill 状态"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">全部状态</option>
              <option value="active">已启用</option>
              <option value="inactive">已停用</option>
            </select>
          )}
          {pluginType === "skill" && can("plugins.create") && (
            <button
              className="primary"
              onClick={() =>
                setSkillDraft({ name: "", description: "", prompt: "", enabled: false })
              }
            >
              <UiIcon name="plus" size={13} />
              新增 Skill
            </button>
          )}
        </div>
        {feedback}
        {loading ? (
          <p className="admin-empty" role="status">
            正在加载…
          </p>
        ) : pluginType !== "skill" ? (
          <PluginInventory
            key={`${agentLevel}-${pluginType}`}
            level={level}
            origin={pluginType === "dsh" ? "dsh" : "cothread"}
            search={search}
          />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Skill</th>
                  <th>版本</th>
                  <th>状态</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {skills.map((skill) => (
                  <tr key={skill.id}>
                    <td>
                      <strong>{skill.name}</strong>
                      <small>{skill.description || "暂无说明"}</small>
                    </td>
                    <td>v{skill.version}</td>
                    <td>
                      <span className={`status-badge ${skill.enabled ? "" : "inactive"}`}>
                        {skill.enabled ? "已启用" : "已停用"}
                      </span>
                    </td>
                    <td className="admin-date">{dateTime(skill.updatedAt)}</td>
                    <td>
                      <div className="admin-table-actions">
                        <button onClick={() => setSkillDetail(skill)}>详情</button>
                        {can("plugins.update") && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              setSkillDraft({
                                id: skill.id,
                                name: skill.name,
                                description: skill.description,
                                prompt: skill.prompt,
                                enabled: skill.enabled,
                              })
                            }
                          >
                            编辑
                          </button>
                        )}
                        {can("plugins.archive") && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              setConfirmation({
                                title: "归档 Skill",
                                message: `确定归档 Skill「${skill.name}」？`,
                                confirm: async () => {
                                  await api(`/admin/plugins/skills/${skill.id}`, {}, "DELETE");
                                  await load();
                                  showTip("Skill 已归档");
                                },
                              })
                            }
                          >
                            归档
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!skills.length && (
                  <tr>
                    <td colSpan={5} className="admin-empty">
                      没有符合筛选条件的 Skills
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {skillDetail && (
          <AdminDialog title={skillDetail.name} onClose={() => setSkillDetail(null)}>
            <p>{skillDetail.description || "暂无说明"}</p>
            <pre className="admin-prompt">{skillDetail.prompt}</pre>
          </AdminDialog>
        )}
        {skillDraft && (
          <AdminDialog
            title={skillDraft.id ? "编辑 Skill" : "新增 Skill"}
            onClose={() => setSkillDraft(null)}
            busy={busy}
          >
            {(close) => (
              <form
                className="admin-editor"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(saveSkill, skillDraft.id ? "Skill 已保存" : "Skill 已创建");
                }}
              >
                {feedback}
                <label>
                  名称
                  <input
                    autoFocus
                    required
                    maxLength={120}
                    value={skillDraft.name}
                    onChange={(e) => setSkillDraft({ ...skillDraft, name: e.target.value })}
                  />
                </label>
                <label>
                  说明
                  <input
                    maxLength={500}
                    value={skillDraft.description}
                    onChange={(e) => setSkillDraft({ ...skillDraft, description: e.target.value })}
                  />
                </label>
                <label>
                  提示词
                  <textarea
                    required
                    maxLength={30000}
                    value={skillDraft.prompt}
                    onChange={(e) => setSkillDraft({ ...skillDraft, prompt: e.target.value })}
                  />
                </label>
                <label className="permission-node">
                  <input
                    type="checkbox"
                    checked={skillDraft.enabled}
                    onChange={(e) => setSkillDraft({ ...skillDraft, enabled: e.target.checked })}
                  />
                  启用此 Skill
                </label>
                <div className="admin-editor-actions">
                  <button type="button" disabled={busy} onClick={close}>
                    取消
                  </button>
                  <button className="primary" disabled={busy}>
                    保存 Skill
                  </button>
                </div>
              </form>
            )}
          </AdminDialog>
        )}
        {confirmDialog}
      </div>
    );
  }
  const isProject = section === "projects";
  const visibleItems = (isProject ? projects : accounts).filter((item) => {
    const value = item as AdminProject & AdminAccount;
    const inactive = isProject ? !!value.archived_at : !!value.disabled_at;
    return (
      (status === "all" || inactive === (status === "inactive")) &&
      [value.name, value.username, value.user_number, value.description, value.creator].some(
        (text) =>
          String(text ?? "")
            .toLowerCase()
            .includes(search.toLowerCase()),
      )
    );
  });
  const detailItem = (isProject ? projects : accounts).find((item) => item.id === expanded);
  const create = async (form: HTMLFormElement) => {
    const fields = new FormData(form);
    const name = String(fields.get("name") || "").trim();
    if (!name) throw new Error(isProject ? "请输入项目名称" : "请输入姓名");
    if (isProject) {
      await api("/admin/projects", {
        name,
        description: String(fields.get("description") || "").trim(),
      });
      await onProjectsChanged();
    } else {
      const result = await api("/admin/accounts", {
        name,
        username: String(fields.get("username") || "").trim(),
      });
      let copied = false;
      try {
        await navigator.clipboard.writeText(
          loginDetails({ username: result.username, value: result.password }),
        );
        copied = true;
      } catch {
        /* Keep the one-time display available. */
      }
      setPassword({
        name: result.name,
        username: result.username,
        value: result.password,
        copied,
        initial: true,
      });
    }
    setCreating(false);
    await load();
  };
  return (
    <div className="admin-manager">
      <div className="admin-filters">
        <label className="admin-search">
          <UiIcon name="search" size={14} />
          <input
            aria-label="搜索项目或成员"
            placeholder={isProject ? "搜索项目名称、简介或创建人" : "搜索姓名、账号或用户 ID"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select aria-label="状态筛选" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">全部状态</option>
          <option value="active">正常</option>
          <option value="inactive">{isProject ? "已归档" : "已停用"}</option>
        </select>
        {can(`${section}.create`) && (
          <button className="primary" onClick={() => setCreating(true)}>
            <UiIcon name="plus" size={13} />
            {isProject ? "新增项目" : "新增成员"}
          </button>
        )}
      </div>
      {feedback}
      <div className="admin-table-wrap" aria-busy={loading}>
        <table className={`admin-table ${isProject ? "" : "admin-member-table"}`}>
          <thead>
            <tr>
              {!isProject && <th className="admin-avatar-column">头像</th>}
              <th>{isProject ? "项目名称" : "成员"}</th>
              <th>{isProject ? "创建人" : "账号"}</th>
              <th>{isProject ? "成员数" : "加入项目"}</th>
              <th>状态</th>
              <th>{isProject ? "创建时间" : "账号类型"}</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {!loading &&
              visibleItems.map((item) => {
                const project = item as AdminProject,
                  account = item as AdminAccount;
                const inactive = isProject ? !!project.archived_at : !!account.disabled_at;
                return (
                  <tr key={item.id}>
                    {!isProject && (
                      <td className="admin-avatar-column">
                        <MemberAvatar account={account} />
                      </td>
                    )}
                    <td>
                      <button
                        className="admin-table-link"
                        onClick={() => openDetail(item.id, "details")}
                      >
                        {item.name}
                      </button>
                      <small>
                        {isProject
                          ? project.description || "暂无简介"
                          : `用户 ID：${account.user_number}`}
                      </small>
                    </td>
                    <td>
                      <span className="admin-nowrap">
                        {isProject ? project.creator : account.username}
                      </span>
                      {!isProject && <small>{account.email || "未绑定邮箱"}</small>}
                    </td>
                    <td>{isProject ? project.members.length : account.projects.length}</td>
                    <td>
                      <span className={`status-badge ${inactive ? "inactive" : ""}`}>
                        {inactive ? (isProject ? "已归档" : "已停用") : "正常"}
                      </span>
                    </td>
                    <td>
                      {isProject
                        ? date(project.created_at)
                        : account.is_super_admin
                          ? "超级管理员"
                          : "成员"}
                    </td>
                    <td>
                      <div className="admin-table-actions">
                        <button onClick={() => openDetail(item.id, "details")}>详情</button>
                        <button onClick={() => openDetail(item.id, "related")}>
                          {isProject ? "成员" : "项目"}
                        </button>
                        <button onClick={() => openDetail(item.id, "changes")}>
                          {isProject ? "记录" : "变更记录"}
                        </button>
                        {!isProject && (
                          <button onClick={() => openDetail(item.id, "logins")}>登录记录</button>
                        )}
                        {!isProject && can("roles.assign") && (
                          <button disabled={busy} onClick={() => setAssignment(account)}>
                            分配角色
                          </button>
                        )}
                        {can(
                          isProject
                            ? `projects.${inactive ? "restore" : "archive"}`
                            : "accounts.status",
                        ) && (
                          <button
                            disabled={busy || (!isProject && account.id === currentUserId)}
                            onClick={() =>
                              void action(
                                async () => {
                                  if (isProject) {
                                    await api(
                                      `/admin/projects/${item.id}/${inactive ? "restore" : "archive"}`,
                                      {},
                                      "PATCH",
                                    );
                                    await onProjectsChanged();
                                  } else
                                    await api(
                                      `/admin/accounts/${item.id}/status`,
                                      { disabled: !inactive },
                                      "PATCH",
                                    );
                                  await load();
                                },
                                isProject
                                  ? inactive
                                    ? "项目已恢复"
                                    : "项目已归档"
                                  : inactive
                                    ? "成员已恢复"
                                    : "成员已停用",
                              )
                            }
                          >
                            {inactive ? "恢复" : isProject ? "归档" : "停用"}
                          </button>
                        )}
                        {!isProject && can("accounts.reset-password") && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              setConfirmation({
                                title: "重置密码",
                                message: `确定重置 ${account.name} 的密码？该账号当前登录将失效。`,
                                confirm: async () => {
                                  const result = await api(
                                    `/admin/accounts/${item.id}/reset-password`,
                                    {},
                                  );
                                  setConfirmation(null);
                                  setPassword({
                                    name: account.name,
                                    username: account.username,
                                    value: result.password,
                                  });
                                  showTip("密码已重置");
                                },
                              })
                            }
                          >
                            重置密码
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            {(loading || !visibleItems.length) && (
              <tr>
                <td
                  colSpan={isProject ? 6 : 7}
                  className="admin-empty"
                  role={loading ? "status" : undefined}
                >
                  {loading ? "正在加载…" : `没有符合筛选条件的${isProject ? "项目" : "成员"}`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="admin-pagination">
        <span>共 {visibleItems.length} 条</span>
      </div>
      {detailItem && (
        <AdminDialog
          title={`${detailItem.name} · ${detailSection === "details" ? (isProject ? "项目详情" : "成员详情") : detailSection === "related" ? (isProject ? "项目成员" : "加入的项目") : detailSection === "changes" ? "变更记录" : "登录记录"}`}
          onClose={() => setExpanded("")}
        >
          <RecordDetails item={detailItem} isProject={isProject} section={detailSection} />
        </AdminDialog>
      )}
      {assignment && (
        <AdminRoleAssignment
          member={assignment}
          permissions={permissions}
          api={api}
          onClose={() => setAssignment(null)}
          onSaved={async () => {
            await load();
            await onAccessChanged();
          }}
        />
      )}
      {creating && (
        <AdminDialog
          title={isProject ? "新增项目" : "新增成员"}
          onClose={() => setCreating(false)}
          busy={busy}
        >
          {(close) => (
            <form
              className="admin-editor"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                void action(() => create(form), isProject ? "项目已创建" : "成员已创建");
              }}
            >
              {feedback}
              <label>
                {isProject ? "项目名称" : "姓名"}
                <input autoFocus required name="name" maxLength={isProject ? 120 : 80} />
              </label>
              {isProject ? (
                <label>
                  项目简介
                  <textarea name="description" maxLength={4000} placeholder="选填" />
                </label>
              ) : (
                <label>
                  账号名
                  <input required name="username" maxLength={80} />
                </label>
              )}
              <div className="admin-editor-actions">
                <button type="button" disabled={busy} onClick={close}>
                  取消
                </button>
                <button className="primary" disabled={busy}>
                  确认新增
                </button>
              </div>
            </form>
          )}
        </AdminDialog>
      )}
      {password && (
        <AdminDialog
          title={`${password.name} 的${password.initial ? "初始" : "新"}密码`}
          onClose={() => setPassword(null)}
        >
          <div className="admin-password">
            <p>账号：{password.username}</p>
            <code>{password.value}</code>
            <p>
              {password.initial && password.copied
                ? "网站、访问地址、账号和密码已自动复制。"
                : "请立即交给账号本人。关闭后无法再次查看。"}
            </p>
            <button
              onClick={() =>
                void (async () => {
                  try {
                    await navigator.clipboard.writeText(loginDetails(password));
                    setPassword({ ...password, copied: true });
                    showTip("登录信息已复制");
                  } catch {
                    showTip("浏览器未允许写入剪贴板，请手动复制账号和密码。", "error");
                  }
                })()
              }
            >
              <UiIcon name="copy" size={12} />
              {password.copied ? "再次复制登录信息" : "复制登录信息"}
            </button>
          </div>
        </AdminDialog>
      )}
      {confirmDialog}
    </div>
  );
}
