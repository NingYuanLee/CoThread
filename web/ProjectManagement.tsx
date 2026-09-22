import React, { useEffect, useRef, useState } from "react";
import { AGENT_MEMBER } from "../shared/agent-member.js";
import { AGENT_LEVEL_LABELS } from "./ui-labels";
import { RoleBadge } from "./Identity";
import { MemberPicker } from "./MemberPicker";
import { ProjectSettings } from "./ProjectSettings";
import { ProjectCodeConnectors } from "./ProjectCodeConnectors";
import { UiIcon } from "./ui-icon";
import { DialogClose, animateDialogClose, onDialogBackdropClick, onDialogCancel } from "./dialog-fx";
import { showTip } from "./Tip";
import { connectorHostLabel, connectorOsLabel } from "./ConnectorPanel";

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
  motto?: string | null;
  user_number?: string | number;
  role?: string;
  kind?: "human" | "l1";
  identity_tags?: string[];
  connector?: ProjectConnector | null;
};

type ProjectDetail = {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  created_by: string;
  members: ProjectMember[];
  longTermSummary?: {
    summary: string;
    updatedAt: string | null;
    lastThreadTitle: string | null;
  } | null;
};

export function ProjectManagement({
  detail,
  busy,
  creator,
  owner,
  projectMember,
  api,
  localDate,
  refresh,
  onProjectRenamed,
  onClose,
}: {
  detail: ProjectDetail | null;
  busy: boolean;
  creator: boolean;
  owner: boolean;
  projectMember: boolean;
  api: (path: string, data?: unknown, method?: string) => Promise<any>;
  localDate: (value?: string) => string;
  refresh: () => Promise<void>;
  onProjectRenamed: (project: { id: string; name: string; description?: string }) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<"info" | "members" | "connectors">("info");
  const [memberScope, setMemberScope] = useState<"humans" | "l1" | "executors">("humans");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const humans = (detail?.members || []).filter((member) => member.kind !== "l1" && member.id !== AGENT_MEMBER.id);
  const projectAgent = (detail?.members || []).find((member) => member.kind === "l1" || member.id === AGENT_MEMBER.id)
    || { ...AGENT_MEMBER, kind: "l1" as const };
  const connectors = humans.filter((member) => member.connector);
  const matchesSearch = (member: ProjectMember) =>
    `${member.name} ${member.username || ""} ${member.email} ${member.bound_email || ""} ${member.connector?.name || ""}`
      .toLowerCase()
      .includes(memberSearch.toLowerCase());
  const visibleHumans = humans.filter(matchesSearch);
  const visibleConnectors = connectors.filter(matchesSearch);
  const agentVisible = `${projectAgent.name} L1 老翁`.toLowerCase().includes(memberSearch.toLowerCase());

  return (
    <dialog
      ref={dialog}
      className="project-management-dialog"
      aria-labelledby="project-management-title"
      onCancel={onDialogCancel(onClose)}
      onClick={onDialogBackdropClick(onClose)}
    >
      <header className="agent-monitor-header">
        <div>
          <span>当前项目</span>
          <h2 id="project-management-title">项目管理</h2>
        </div>
        <DialogClose onClick={() => animateDialogClose(dialog.current, onClose)} label="关闭项目管理" />
      </header>
      <div className="project-management-body">
        <nav className="project-management-tabs" aria-label="项目管理">
          <button
            type="button"
            className={tab === "info" ? "active" : ""}
            aria-selected={tab === "info"}
            onClick={() => setTab("info")}
          >
            <span className="ui-icon-text"><UiIcon name="info" size={14} />基础信息</span>
          </button>
          <button
            type="button"
            className={tab === "members" ? "active" : ""}
            aria-selected={tab === "members"}
            onClick={() => setTab("members")}
          >
            <span className="ui-icon-text"><UiIcon name="members" size={14} />项目成员</span>
            <small>{humans.length}</small>
          </button>
          <button
            type="button"
            className={tab === "connectors" ? "active" : ""}
            aria-selected={tab === "connectors"}
            onClick={() => setTab("connectors")}
          >
            <span className="ui-icon-text"><UiIcon name="connector" size={14} />连接器</span>
          </button>
        </nav>
        <div className="project-management-content">
          {tab === "info" ? (
            detail ? (
              <ProjectSettings
                key={detail.id}
                projectId={detail.id}
                name={detail.name}
                description={detail.description || ""}
                createdAt={localDate(detail.created_at)}
                creator={creator}
                longTermSummary={detail.longTermSummary}
                onSave={async ({ name, description }) => {
                  const updated = await api(`/projects/${detail.id}`, { name, description }, "PATCH");
                  onProjectRenamed({ id: updated.id, name: updated.name, description: updated.description });
                }}
              />
            ) : (
              <p className="muted">正在加载基本信息…</p>
            )
          ) : tab === "connectors" ? (
            detail ? (
              <ProjectCodeConnectors projectId={detail.id} canManage={owner} api={api} />
            ) : (
              <p className="muted">正在加载连接器…</p>
            )
          ) : (
            <>
              <p className="muted project-member-note">
                项目成员是本项目的人类成员及其本地执行器，加上{AGENT_LEVEL_LABELS.l1}。迭代里再出现本迭代{AGENT_LEVEL_LABELS.l2}与{AGENT_LEVEL_LABELS.l3}；公司目录里只有人类成员。
              </p>
              <div className="member-scope" role="tablist" aria-label="项目成员分类">
                <button type="button" className={memberScope === "humans" ? "active" : ""} onClick={() => setMemberScope("humans")}>
                  <UiIcon name="human" size={13} />人类成员<small>{humans.length}</small>
                </button>
                <button type="button" className={memberScope === "l1" ? "active" : ""} onClick={() => setMemberScope("l1")}>
                  <UiIcon name="book" size={13} />{AGENT_LEVEL_LABELS.l1}
                </button>
                <button type="button" className={memberScope === "executors" ? "active" : ""} onClick={() => setMemberScope("executors")}>
                  <UiIcon name="connector" size={13} />本地执行器<small>{connectors.length}</small>
                </button>
              </div>
              <input
                className="member-search"
                type="search"
                name="cothread-project-member-search"
                autoComplete="off"
                aria-label="搜索成员"
                placeholder={memberScope === "executors" ? "搜索成员或本地执行器" : "搜索成员"}
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.target.value)}
              />
              {memberScope === "humans" && (
                <>
                  <div className="panel-heading">
                    <span>本项目人类成员</span>
                    {projectMember && (
                      <button type="button" onClick={() => setMemberPickerOpen(true)}>
                        <UiIcon name="userPlus" size={12} />添加
                      </button>
                    )}
                  </div>
                  {visibleHumans.map((member) => (
                    <HumanMemberRow
                      key={member.id}
                      member={member}
                      detail={detail}
                      creator={creator}
                      busy={busy}
                      api={api}
                      refresh={refresh}
                    />
                  ))}
                  {!visibleHumans.length && <p className="empty-state">没有匹配的人类成员</p>}
                </>
              )}
              {memberScope === "l1" && (
                <>
                  <div className="panel-heading">
                    <span>{AGENT_LEVEL_LABELS.l1}</span>
                  </div>
                  {agentVisible ? (
                    <div className="member">
                      <span className="avatar">
                        <img loading="lazy" decoding="async" src={projectAgent.avatar || AGENT_MEMBER.avatar} alt="" />
                      </span>
                      <div className="member-copy">
                        <div className="member-name-row">
                          <strong>{projectAgent.name}</strong>
                          <RoleBadge role="L1" />
                          <RoleBadge role="项目知识库" />
                        </div>
                        <small className="member-user-id">对用户仍显示为小祥；本层负责成员认识、文档摘要与长期记忆</small>
                        {projectAgent.motto ? <small className="member-motto">{projectAgent.motto}</small> : null}
                      </div>
                    </div>
                  ) : (
                    <p className="empty-state">没有匹配的{AGENT_LEVEL_LABELS.l1}</p>
                  )}
                </>
              )}
              {memberScope === "executors" && (
                <>
                  <div className="panel-heading">
                    <span>本项目人类成员的本地执行器</span>
                  </div>
                  {visibleConnectors.map((member) => (
                    <div className="member" key={member.connector?.id || member.id}>
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
                          <RoleBadge role={member.connector?.bound ? (member.connector.online ? "在线" : "离线") : "未绑定本项目"} />
                        </div>
                        <small className="member-user-id">
                          {connectorHostLabel(member.connector?.name)}
                          {member.connector?.platform ? ` · ${connectorOsLabel(member.connector.platform)}` : ""}
                          {member.connector?.bound ? " · 已绑定本项目" : " · 设备在线于其他项目"}
                        </small>
                      </div>
                    </div>
                  ))}
                  {!visibleConnectors.length && (
                    <p className="empty-state">本项目人类成员还没有授权本地执行器。本地执行器属于成员本人，授权后可绑定本项目。</p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
      {memberPickerOpen && detail && (
        <MemberPicker
          projectId={detail.id}
          api={api}
          onClose={() => setMemberPickerOpen(false)}
          onAdded={refresh}
        />
      )}
    </dialog>
  );
}

function HumanMemberRow({
  member,
  detail,
  creator,
  busy,
  api,
  refresh,
}: {
  member: ProjectMember;
  detail: ProjectDetail | null;
  creator: boolean;
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
            member.identity_tags.map((tag) => (
              <RoleBadge key={tag} role={tag} />
            ))}
          {member.id === detail?.created_by && <RoleBadge role="创建人" />}
          {member.role === "viewer" && <RoleBadge role="只读" />}
        </div>
        <small className="member-user-id">用户ID：{member.user_number ?? member.id}</small>
        {member.motto ? <small className="member-motto">{member.motto}</small> : null}
        {member.connector ? (
          <small className="member-motto">
            本地执行器：{member.connector.bound ? (member.connector.online ? "本项目在线" : "已绑定，离线") : "已授权，未绑定本项目"}
          </small>
        ) : null}
      </div>
      {creator &&
      detail &&
      member.id !== detail.created_by ? (
        <button
          disabled={busy}
          onClick={() => {
            if (window.confirm(`确定将 ${member.name} 移出该项目？`))
              void api(`/projects/${detail.id}/members/${member.id}`, undefined, "DELETE")
                .then(async () => { await refresh(); showTip("已移出项目成员"); })
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
