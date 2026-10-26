/**
 * 工作台弹窗表单提交：按当前弹窗分发到个人资料 / 新建项目 / 修改密码 / 沙箱执行。
 * 依赖由 WorkspaceApp 打包成 ctx 传入。
 */
/**
 * 工作台弹窗表单提交：按当前弹窗分发到个人资料 / 新建项目 / 修改密码 / 沙箱执行。
 * 依赖由 WorkspaceApp 打包成 ctx 传入。
 */
import type { Dispatch, FormEvent, SetStateAction } from "react";

import { showTip } from "./Tip";
import { api } from "./workspace-api";
import type { Project, Modal } from "./workspace-types";
import type { PersonalProfile } from "./ProfileFields";

export type WorkspaceModalSubmitContext = {
  modal: Modal;
  run: (task: () => Promise<void>) => Promise<void>;
  refresh: () => Promise<void>;
  profileAvatar: string | null;
  projectImage: string | null;
  threadId: string;
  acceptProfile: (profile: PersonalProfile | null) => void;
  setProjects: Dispatch<SetStateAction<Project[]>>;
  setProjectId: Dispatch<SetStateAction<string>>;
  setModal: Dispatch<SetStateAction<Modal>>;
};

export function submitWorkspaceModal(
  ctx: WorkspaceModalSubmitContext,
  event: FormEvent<HTMLFormElement>,
): void {
  const {
    modal,
    run,
    refresh,
    profileAvatar,
    projectImage,
    threadId,
    acceptProfile,
    setProjects,
    setProjectId,
    setModal,
  } = ctx;
  event.preventDefault();
  if (modal === "email" || modal === "skills" || modal === "mcp") return;
  const form = new FormData(event.currentTarget);
  const value = (key: string) => String(form.get(key) || "");
  void run(async () => {
    if (modal === "profile") {
      const profile = await api(
        "/me",
        {
          name: value("name"),
          motto: value("motto"),
          avatar: profileAvatar,
          identity_tags: form.getAll("identity_tags").filter(Boolean),
        },
        "PATCH",
      );
      acceptProfile(profile);
      await refresh();
      showTip("个人资料已保存");
    }
    if (modal === "project") {
      const p = await api("/projects", {
        name: value("name"),
        description: value("description"),
        ...(projectImage ? { image: projectImage } : {}),
      });
      setProjects(await api("/projects"));
      setProjectId(p.id);
      showTip("项目已创建");
    }
    if (modal === "password") {
      await api("/password", {
        currentPassword: value("currentPassword"),
        password: value("password"),
      });
      showTip("密码已更新");
    }
    if (modal === "run") {
      const input = { command: value("command") };
      const result = await api(`/threads/${threadId}/runs`, input);
      await refresh();
      if (result.status !== "succeeded") throw new Error(result.output);
    }
    if (modal !== "profile" && modal !== "password") setModal(null);
  });
}
