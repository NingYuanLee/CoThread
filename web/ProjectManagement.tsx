import React, { useEffect, useRef, useState } from "react";
import { AGENT_L1_PROFILE, AGENT_L2_MEMBER, AGENT_MEMBER } from "../shared/agent-member.js";
import { AGENT_LEVEL_LABELS } from "./ui-labels";
import { RoleBadge } from "./Identity";
import { MemberPicker } from "./MemberPicker";
import { ProjectSettings } from "./ProjectSettings";
import { ProjectMark } from "./ProjectMark";
import { ProjectCodeConnectors } from "./ProjectCodeConnectors";
import { ProjectMiniProgramConfig } from "./ProjectMiniProgramConfig";
import { UiIcon } from "./ui-icon";
import {
  DialogClose,
  animateDialogClose,
  onDialogBackdropClick,
  onDialogCancel,
} from "./dialog-fx";
import { showTip } from "./Tip";

type ProjectConnector = {
  id: string;
  name: string;
  platform?: string;
  version?: string;
  online: boolean;
  bound: boolean;
  lastSeenAt?: string | null;
};

type ProjectMember = {
  id: string;
  name: string;
  username?: string;
  email?: string;
  bound_email?: string | null;
  avatar?: string | null;
  display_avatar?: string | null;
  nickname?: string | null;
  title?: string | null;
  motto?: string | null;
  user_number?: string | number;
  role?: string;
  kind?: "human" | "l1" | "l2";
  identity_tags?: string[];
  connector?: ProjectConnector | null;
};

type ProjectDetail = {
  id: string;
  name: string;
  description?: string;
  image?: string | null;
  created_at: string;
  created_by: string;
  created_by_name?: string;
  project_leader_id: string | null;
  members: ProjectMember[];
  longTermSummary?: {
    summary: string;
    updatedAt: string | null;
    lastThreadTitle: string | null;
  } | null;
};

function isHumanMember(member: ProjectMember) {
  return (
    member.kind !== "l1" &&
    member.kind !== "l2" &&
    member.id !== AGENT_MEMBER.id &&
    member.id !== AGENT_L2_MEMBER.id
  );
}

export function ProjectManagement({
  detail,
  busy,
  canManage,
  projectLeader,
  api,
  localDate,
  refresh,
  onProjectRenamed,
  onClose,
}: {
  detail: ProjectDetail | null;
  busy: boolean;
  canManage: boolean;
  projectLeader: boolean;
  api: (path: string, data?: unknown, method?: string) => Promise<any>;
  localDate: (value?: string) => string;
  refresh: () => Promise<void>;
  onProjectRenamed: (project: {
    id: string;
    name: string;
    description?: string;
    image?: string | null;
  }) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<"info" | "members" | "connectors" | "miniprogram">("info");
  const [memberScope, setMemberScope] = useState<"humans" | "agents">("humans");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const humans = (detail?.members || []).filter(isHumanMember);
  const projectAgent = (detail?.members || []).find(
    (member) => member.kind === "l1" || member.id === AGENT_MEMBER.id,
  ) || {
    ...AGENT_MEMBER,
    kind: "l1" as const,
    nickname: AGENT_L1_PROFILE.nickname,
    title: AGENT_L1_PROFILE.title,
    display_avatar: AGENT_L1_PROFILE.avatar,
  };
  const iterationAgent = (detail?.members || []).find(
    (member) => member.kind === "l2" || member.id === AGENT_L2_MEMBER.id,
  ) || { ...AGENT_L2_MEMBER, kind: "l2" as const };
  const matchesSearch = (member: ProjectMember) =>
    `${member.name} ${member.username || ""} ${member.email} ${member.bound_email || ""} ${member.connector?.name || ""}`
      .toLowerCase()
      .includes(memberSearch.toLowerCase());
  const visibleHumans = humans.filter(matchesSearch);
  const agentSearch = memberSearch.toLowerCase();
  const l1Visible =
    `${projectAgent.nickname || AGENT_L1_PROFILE.nickname} ${projectAgent.name} L1 老翁 ${AGENT_LEVEL_LABELS.l1}`
      .toLowerCase()
      .includes(agentSearch);
  const l2Visible =
    `${iterationAgent.nickname || AGENT_L2_MEMBER.nickname} ${iterationAgent.name} L2 ${AGENT_LEVEL_LABELS.l2}`
      .toLowerCase()
      .includes(agentSearch);
  const agentVisibleCount = Number(l1Visible) + Number(l2Visible);

  return (
    <>
      <dialog
        ref={dialog}
        className="project-management-dialog space-dialog"
        aria-labelledby="project-management-title"
        onCancel={onDialogCancel(onClose)}
        onClick={onDialogBackdropClick(onClose)}
      >
        <header className="space-dialog-header">
          <div className="space-dialog-heading">
            <ProjectMark name={detail?.name || "项目"} image={detail?.image} size={36} />
            <div>
              <span>工作空间</span>
              <h2 id="project-management-title">项目管理</h2>
            </div>
          </div>
          <DialogClose
            onClick={() => animateDialogClose(dialog.current, onClose)}
            label="关闭项目管理"
          />
        </header>
        <div className="project-management-body space-dialog-body">
          <nav className="project-management-tabs space-dialog-nav" aria-label="项目管理">
            <button
              type="button"
              className={tab === "info" ? "active" : ""}
              aria-current={tab === "info" ? "page" : undefined}
              aria-selected={tab === "info"}
              onClick={() => setTab("info")}
            >
              <span className="ui-icon-text">
                <UiIcon name="info" size={14} />
                基础信息
              </span>
            </button>
            <button
              type="button"
              className={tab === "members" ? "active" : ""}
              aria-current={tab === "members" ? "page" : undefined}
              aria-selected={tab === "members"}
              onClick={() => setTab("members")}
            >
              <span className="ui-icon-text">
                <UiIcon name="members" size={14} />
                项目成员
              </span>
              <small>{humans.length}</small>
            </button>
            <button
              type="button"
              className={tab === "connectors" ? "active" : ""}
              aria-current={tab === "connectors" ? "page" : undefined}
              aria-selected={tab === "connectors"}
              onClick={() => setTab("connectors")}
            >
              <span className="ui-icon-text">
                <UiIcon name="connector" size={14} />
                连接器
              </span>
            </button>
            <button
              type="button"
              className={tab === "miniprogram" ? "active" : ""}
              aria-current={tab === "miniprogram" ? "page" : undefined}
              aria-selected={tab === "miniprogram"}
              onClick={() => setTab("miniprogram")}
            >
              <span className="ui-icon-text">
                <UiIcon name="smartphone" size={14} />
                小程序与云开发
              </span>
            </button>
          </nav>
          <div className="project-management-content space-dialog-content">
            {tab === "info" ? (
              <>
                <div className="settings-content-heading">
                  <p>维护当前项目的图片、名称和简介。</p>
                </div>
                {detail ? (
                  <ProjectSettings
                    key={detail.id}
                    projectId={detail.id}
                    name={detail.name}
                    description={detail.description || ""}
                    image={detail.image}
                    createdAt={localDate(detail.created_at)}
                    creatorName={detail.created_by_name || "未知"}
                    canManage={canManage}
                    longTermSummary={detail.longTermSummary}
                    onSave={async ({ name, description, image }) => {
                      const updated = await api(
                        `/projects/${detail.id}`,
                        {
                          name,
                          description,
                          ...(image !== undefined ? { image } : {}),
                        },
                        "PATCH",
                      );
                      onProjectRenamed({
                        id: updated.id,
                        name: updated.name,
                        description: updated.description,
                        image: updated.image,
                      });
                    }}
                  />
                ) : (
                  <p className="muted">正在加载基本信息…</p>
                )}
              </>
            ) : tab === "connectors" ? (
              detail ? (
                <ProjectCodeConnectors projectId={detail.id} canManage={canManage} api={api} />
              ) : (
                <p className="muted">正在加载连接器…</p>
              )
            ) : tab === "miniprogram" ? (
              <ProjectMiniProgramConfig
                key={detail?.id}
                projectId={detail?.id || ""}
                canManage={canManage}
                api={api}
              />
            ) : (
              <>
                <p className="muted project-member-note">
                  项目成员含人类成员与 Agent（{AGENT_LEVEL_LABELS.l1}、{AGENT_LEVEL_LABELS.l2}
                  ）。本地执行器隶属于人类成员，不单独列成员；{AGENT_LEVEL_LABELS.l3} 隶属于
                  L2，也不单独列。L2 是项目内同一角色，各迭代只是独立会话。
                </p>
                <div className="member-scope" role="tablist" aria-label="项目成员分类">
                  <button
                    type="button"
                    className={memberScope === "humans" ? "active" : ""}
                    onClick={() => setMemberScope("humans")}
                  >
                    <UiIcon name="human" size={13} />
                    人类成员<small>{humans.length}</small>
                  </button>
                  <button
                    type="button"
                    className={memberScope === "agents" ? "active" : ""}
                    onClick={() => setMemberScope("agents")}
                  >
                    <UiIcon name="sparkle" size={13} />
                    Agent成员<small>2</small>
                  </button>
                </div>
                <input
                  className="member-search"
                  type="search"
                  name="cothread-project-member-search"
                  autoComplete="off"
                  aria-label="搜索成员"
                  placeholder="搜索成员"
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                />
                {memberScope === "humans" && (
                  <>
                    <div className="panel-heading">
                      <span>本项目人类成员</span>
                      {canManage && (
                        <small>
                          {projectLeader
                            ? "负责人可管理成员、任免管理员并转移负责人"
                            : "可管理成员角色；管理员任免和负责人转移仅负责人可操作"}
                        </small>
                      )}
                      {canManage && (
                        <button type="button" onClick={() => setMemberPickerOpen(true)}>
                          <UiIcon name="userPlus" size={12} />
                          添加
                        </button>
                      )}
                    </div>
                    {visibleHumans.map((member) => (
                      <HumanMemberRow
                        key={member.id}
                        member={member}
                        detail={detail}
                        canManage={canManage}
                        projectLeader={projectLeader}
                        busy={busy}
                        api={api}
                        refresh={refresh}
                      />
                    ))}
                    {!visibleHumans.length && <p className="empty-state">没有匹配的人类成员</p>}
                  </>
                )}
                {memberScope === "agents" && (
                  <>
                    <div className="panel-heading">
                      <span>本项目 Agent 成员</span>
                    </div>
                    {l1Visible ? (
                      <div className="member">
                        <span className="avatar">
                          <img
                            loading="lazy"
                            decoding="async"
                            src={projectAgent.display_avatar || AGENT_L1_PROFILE.avatar}
                            alt=""
                          />
                        </span>
                        <div className="member-copy">
                          <div className="member-name-row">
                            <strong>{projectAgent.nickname || AGENT_L1_PROFILE.nickname}</strong>
                            <RoleBadge role="L1" />
                            <RoleBadge role="项目知识库" />
                          </div>
                          <small className="member-user-id">
                            {projectAgent.title || AGENT_L1_PROFILE.title}；对用户仍显示为小祥
                          </small>
                          {projectAgent.motto ? (
                            <small className="member-motto">{projectAgent.motto}</small>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {l2Visible ? (
                      <div className="member">
                        <span className="avatar">
                          <img
                            loading="lazy"
                            decoding="async"
                            src={iterationAgent.avatar || AGENT_L2_MEMBER.avatar}
                            alt=""
                          />
                        </span>
                        <div className="member-copy">
                          <div className="member-name-row">
                            <strong>{iterationAgent.name}</strong>
                            <RoleBadge role="L2" />
                            <RoleBadge role="任务调度" />
                          </div>
                          <small className="member-user-id">
                            {iterationAgent.nickname || AGENT_L2_MEMBER.nickname}
                            ；项目内同一角色，各迭代使用独立会话
                          </small>
                          <small className="member-motto">
                            L3 隶属于本层执行，不单独列成员
                            {iterationAgent.motto ? ` · ${iterationAgent.motto}` : ""}
                          </small>
                        </div>
                      </div>
                    ) : null}
                    {!agentVisibleCount && <p className="empty-state">没有匹配的 Agent 成员</p>}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </dialog>
      {memberPickerOpen && detail && (
        <MemberPicker
          projectId={detail.id}
          api={api}
          onClose={() => setMemberPickerOpen(false)}
          onAdded={refresh}
        />
      )}
    </>
  );
}

function HumanMemberRow({
  member,
  detail,
  canManage,
  projectLeader,
  busy,
  api,
  refresh,
}: {
  member: ProjectMember;
  detail: ProjectDetail | null;
  canManage: boolean;
  projectLeader: boolean;
  busy: boolean;
  api: (path: string, data?: unknown, method?: string) => Promise<any>;
  refresh: () => Promise<void>;
}) {
  return (
    <div className="member">
      <span className="avatar">
        {member.avatar ? (
          <img loading="lazy" decoding="async" src={member.avatar} alt="" />
        ) : (
          member.name[0]
        )}
      </span>
      <div className="member-copy">
        <div className="member-name-row">
          <strong>{member.name}</strong>
          {Array.isArray(member.identity_tags) &&
            member.identity_tags.map((tag) => <RoleBadge key={tag} role={tag} />)}
          {member.id === detail?.project_leader_id && <RoleBadge role="项目主" />}
          {member.role === "project_admin" && <RoleBadge role="项目管理" />}
          {member.role === "viewer" && <RoleBadge role="只读" />}
          {member.role === "member" && <RoleBadge role="普通成员" />}
        </div>
        <small className="member-user-id">用户ID：{member.user_number ?? member.id}</small>
        {member.motto ? <small className="member-motto">{member.motto}</small> : null}
        {member.connector ? (
          <small className="member-motto">
            本地执行器：
            {member.connector.bound
              ? member.connector.online
                ? "本项目在线"
                : "已绑定，离线"
              : "已授权，未绑定本项目"}
          </small>
        ) : null}
      </div>
      {projectLeader &&
      detail &&
      member.id !== detail.project_leader_id &&
      !["project_admin", "viewer"].includes(member.role || "") ? (
        <button
          disabled={busy}
          onClick={() => {
            if (window.confirm(`确定将 ${member.name} 设为项目管理？`))
              void api(`/projects/${detail.id}/admins`, { userId: member.id }, "POST")
                .then(async () => {
                  await refresh();
                  showTip(`已将 ${member.name} 设为项目管理`);
                })
                .catch((cause) => showTip((cause as Error).message, "error"));
          }}
        >
          设为管理员
        </button>
      ) : null}
      {canManage &&
      detail &&
      member.id !== detail.project_leader_id &&
      member.id !== AGENT_MEMBER.id &&
      member.id !== AGENT_L2_MEMBER.id &&
      member.role === "member" ? (
        <button
          disabled={busy}
          onClick={() =>
            void api(
              `/projects/${detail.id}/members/${member.id}/role`,
              { role: "viewer" },
              "PATCH",
            )
              .then(async () => {
                await refresh();
                showTip(`已将 ${member.name} 设为只读成员`);
              })
              .catch((cause) => showTip((cause as Error).message, "error"))
          }
        >
          设为只读
        </button>
      ) : null}
      {canManage &&
      detail &&
      member.id !== detail.project_leader_id &&
      member.id !== AGENT_MEMBER.id &&
      member.id !== AGENT_L2_MEMBER.id &&
      member.role === "viewer" ? (
        <button
          disabled={busy}
          onClick={() =>
            void api(
              `/projects/${detail.id}/members/${member.id}/role`,
              { role: "member" },
              "PATCH",
            )
              .then(async () => {
                await refresh();
                showTip(`已恢复 ${member.name} 的编辑权限`);
              })
              .catch((cause) => showTip((cause as Error).message, "error"))
          }
        >
          恢复编辑权限
        </button>
      ) : null}
      {projectLeader && detail && member.role === "project_admin" ? (
        <button
          disabled={busy}
          onClick={() => {
            if (window.confirm(`确定撤销 ${member.name} 的项目管理身份？`))
              void api(`/projects/${detail.id}/admins/${member.id}`, undefined, "DELETE")
                .then(async () => {
                  await refresh();
                  showTip(`已撤销 ${member.name} 的项目管理身份`);
                })
                .catch((cause) => showTip((cause as Error).message, "error"));
          }}
        >
          撤销管理员
        </button>
      ) : null}
      {projectLeader && detail && member.id !== detail.project_leader_id ? (
        <button
          disabled={busy}
          onClick={() => {
            if (window.confirm(`确定将项目主转移给 ${member.name}？你将失去项目主的专属权限。`))
              void api(`/projects/${detail.id}/leader`, { userId: member.id }, "POST")
                .then(async () => {
                  await refresh();
                  showTip(`项目主已转移给 ${member.name}`);
                })
                .catch((cause) => showTip((cause as Error).message, "error"));
          }}
        >
          转移负责人
        </button>
      ) : null}
      {canManage &&
      detail &&
      member.id !== detail.project_leader_id &&
      member.id !== AGENT_MEMBER.id &&
      member.role !== "project_admin" ? (
        <button
          disabled={busy}
          onClick={() => {
            if (window.confirm(`确定将 ${member.name} 移出该项目？`))
              void api(`/projects/${detail.id}/members/${member.id}`, undefined, "DELETE")
                .then(async () => {
                  await refresh();
                  showTip("已移出项目成员");
                })
                .catch((cause) => showTip((cause as Error).message, "error"));
          }}
        >
          <UiIcon name="trash" size={13} />
          移出项目
        </button>
      ) : null}
    </div>
  );
}
