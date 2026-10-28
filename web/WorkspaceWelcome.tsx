/**
 * 无迭代时的欢迎页：发起新迭代、导入已有项目或新建项目。
 * 数据与回调由 WorkspaceApp 打包成 props 传入。
 */
import { ProjectMark } from "./ProjectMark";
import { UiIcon } from "./ui-icon";
import { CoThreadLogo } from "./workspace-chrome";
import { localDate } from "./workspace-format";
import type { Modal, Project } from "./workspace-types";

export type WorkspaceWelcomeProps = {
  projectId: string;
  busy: boolean;
  availableProjects: Project[];
  open: (value: Modal) => void;
  openNewThreadDialog: () => void;
  /** 与右上角「问老翁」同一个开关：有项目且有登录人就能问，不要求已有迭代。 */
  canAskElder: boolean;
  onAskElder: () => void;
  showProjectPicker: () => void;
  updateProjectTab: (id: string, action: "open" | "close" | "pin" | "unpin") => void;
};

export function WorkspaceWelcome({
  projectId,
  busy,
  availableProjects,
  open,
  openNewThreadDialog,
  canAskElder,
  onAskElder,
  showProjectPicker,
  updateProjectTab,
}: WorkspaceWelcomeProps) {
  return (
    <div className="welcome">
      {projectId ? (
        <>
          <div className="welcome-heading">
            <CoThreadLogo className="welcome-logo" title="共序" />
            <h1>先从一轮讨论开始吧</h1>
          </div>
          <div className="welcome-primary-actions">
            <button className="primary" onClick={openNewThreadDialog}>
              <UiIcon name="plus" size={14} />
              发起新迭代
            </button>
            {canAskElder && (
              <button type="button" className="welcome-ask-elder" onClick={onAskElder}>
                <UiIcon name="messageQuestion" size={14} />
                先问问老翁
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="welcome-heading">
            <CoThreadLogo className="welcome-logo" title="共序" />
            <h1>先选个项目吧</h1>
          </div>
          {availableProjects.length ? (
            <>
              <p>最近加入的项目</p>
              <div className="welcome-projects">
                {availableProjects.slice(0, 3).map((project) => (
                  <button
                    type="button"
                    className="welcome-project-card"
                    key={project.id}
                    onClick={() => updateProjectTab(project.id, "open")}
                    disabled={busy}
                  >
                    <strong>
                      <ProjectMark name={project.name} image={project.image} size={18} />
                      <span>{project.name}</span>
                    </strong>
                    <span>{project.description || "暂无项目简介"}</span>
                    <small>加入于 {localDate(project.joined_at)}</small>
                  </button>
                ))}
                {availableProjects.length > 3 && (
                  <button
                    type="button"
                    className="welcome-more-card"
                    onClick={showProjectPicker}
                    disabled={busy}
                  >
                    <span>
                      更多
                      <br />
                      项目
                    </span>
                  </button>
                )}
              </div>
              <div className="welcome-create-row">
                <button
                  type="button"
                  className="welcome-create"
                  onClick={() => open("project")}
                  disabled={busy}
                >
                  <UiIcon name="plus" size={14} />
                  新建我的项目
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="welcome-actions welcome-actions-empty">
                <button type="button" onClick={showProjectPicker} disabled={busy}>
                  <UiIcon name="inbox" size={14} />
                  导入项目
                </button>
              </div>
              <div className="welcome-create-row">
                <button
                  type="button"
                  className="welcome-create"
                  onClick={() => open("project")}
                  disabled={busy}
                >
                  <UiIcon name="plus" size={14} />
                  新建我的项目
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
