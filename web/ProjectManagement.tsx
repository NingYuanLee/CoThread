import React, { useEffect, useRef, useState } from "react";
import { AGENT_MEMBER } from "../shared/agent-member.js";
import { RoleBadge } from "./Identity";
import { MemberPicker } from "./MemberPicker";
import { ProjectSettings } from "./ProjectSettings";

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
  identity_tags?: string[];
};

type ProjectDetail = {
  id: string;
  name: string;
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
  projectMember: boolean;
  api: (path: string, data?: unknown, method?: string) => Promise<any>;
  localDate: (value?: string) => string;
  refresh: () => Promise<void>;
  onProjectRenamed: (project: { id: string; name: string }) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<"info" | "members">("info");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const members = (detail?.members || []).filter((member) =>
    `${member.name} ${member.username || ""} ${member.email} ${member.bound_email || ""}`
      .toLowerCase()
      .includes(memberSearch.toLowerCase()),
  );

  return (
    <dialog
      ref={dialog}
      className="project-management-dialog"
      aria-labelledby="project-management-title"
      onCancel={onClose}
    >
      <header className="agent-monitor-header">
        <div>
          <span>当前项目</span>
          <h2 id="project-management-title">项目管理</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭项目管理" title="关闭">
          ×
        </button>
      </header>
      <div className="project-management-body">
        <nav className="project-management-tabs" aria-label="项目管理">
          <button
            type="button"
            className={tab === "info" ? "active" : ""}
            aria-selected={tab === "info"}
            onClick={() => setTab("info")}
          >
            基础信息
          </button>
          <button
            type="button"
            className={tab === "members" ? "active" : ""}
            aria-selected={tab === "members"}
            onClick={() => setTab("members")}
          >
            成员管理
            <small>{detail?.members.length || 0}</small>
          </button>
        </nav>
        <div className="project-management-content">
          {tab === "info" ? (
            detail ? (
              <ProjectSettings
                key={detail.id}
                name={detail.name}
                createdAt={localDate(detail.created_at)}
                creator={creator}
                longTermSummary={detail.longTermSummary}
                onSave={async (name) => {
                  const updated = await api(`/projects/${detail.id}`, { name }, "PATCH");
                  onProjectRenamed({ id: updated.id, name: updated.name });
                }}
              />
            ) : (
              <p className="muted">正在加载基本信息…</p>
            )
          ) : (
            <>
              <input
                className="member-search"
                aria-label="搜索成员"
                placeholder="搜索成员"
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.target.value)}
              />
              <div className="panel-heading">
                <span>参与此项目的成员</span>
                {projectMember && (
                  <button type="button" onClick={() => setMemberPickerOpen(true)}>
                    ＋ 添加
                  </button>
                )}
              </div>
              {members.map((member) => (
                <div className="member" key={member.id}>
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
                  </div>
                  {creator &&
                  detail &&
                  member.id !== detail.created_by &&
                  member.id !== AGENT_MEMBER.id ? (
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`确定将 ${member.name} 移出该项目？`))
                          void api(`/projects/${detail.id}/members/${member.id}`, undefined, "DELETE").then(refresh);
                      }}
                    >
                      移出项目
                    </button>
                  ) : null}
                </div>
              ))}
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
