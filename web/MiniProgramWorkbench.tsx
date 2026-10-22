import { DialogHeader } from "./DialogHeader";
import React, { useRef } from "react";
import { Dialog, animateDialogClose } from "./dialog-fx";
import { MiniProgramWorkspace } from "./MiniProgramWorkspace";

/**
 * 项目级面板：CloudBase 工作台。
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
  return (
    <Dialog
      onRequestClose={onClose}
      ref={dialog}
      className="miniprogram-workbench-dialog"
      aria-labelledby="miniprogram-workbench-title"
    >
      <DialogHeader
        title={<>CloudBase</>}
        titleId="miniprogram-workbench-title"
        subtitle={<>当前项目</>}
        onClose={() => animateDialogClose(dialog.current, onClose)}
        closeLabel="关闭 CloudBase"
      />
      <div className="miniprogram-workbench-body">
        <MiniProgramWorkspace
          projectId={projectId}
          request={request}
          writable={writable}
          currentUserId={currentUserId}
          owner={owner}
        />
      </div>
    </Dialog>
  );
}
