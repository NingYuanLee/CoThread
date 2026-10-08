import React, { useEffect, useRef } from "react";
import {
  DialogClose,
  animateDialogClose,
  onDialogBackdropClick,
  onDialogCancel,
} from "./dialog-fx";
import { MiniProgramWorkspace } from "./MiniProgramWorkspace";

/**
 * 项目级面板：小程序云开发工作台。
 *
 * 工作台原本寄在会话右侧栏的文档库组件里（activeTool === "miniprogram"），
 * 6 个 tab 塞不进 400px 侧栏；现在与「项目管理」「小祥监控」并列，作为
 * 项目级弹层。只承载运行时与发布，项目级配置仍在「项目管理 → 小程序与云开发」。
 */
export function MiniProgramWorkbench({
  projectId,
  request,
  writable,
  currentUserId,
  owner,
  onClose,
}: {
  projectId: string;
  request: (path: string, options?: RequestInit) => Promise<Response>;
  writable: boolean;
  currentUserId: string;
  owner: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="miniprogram-workbench-dialog"
      aria-labelledby="miniprogram-workbench-title"
      onCancel={onDialogCancel(onClose)}
      onClick={onDialogBackdropClick(onClose)}
    >
      <header className="agent-monitor-header">
        <div>
          <span>当前项目</span>
          <h2 id="miniprogram-workbench-title">小程序云开发</h2>
        </div>
        <DialogClose
          onClick={() => animateDialogClose(dialog.current, onClose)}
          label="关闭小程序云开发"
        />
      </header>
      <div className="miniprogram-workbench-body">
        <MiniProgramWorkspace
          projectId={projectId}
          request={request}
          writable={writable}
          currentUserId={currentUserId}
          owner={owner}
        />
      </div>
    </dialog>
  );
}
