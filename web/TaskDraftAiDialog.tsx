/**
 * AI 起草任务的设置弹窗：系统提示词只读，用户提示词可改，输出 JSON 只读。
 */
import { DialogFooter } from "./DialogFooter";
import { DialogHeader } from "./DialogHeader";
import { ModalBackdrop } from "./dialog-fx";
import { TextAreaField } from "./TextAreaField";
import { DEFAULT_TASK_DRAFT_PROMPT, TASK_DRAFT_SYSTEM_PROMPT } from "../shared/task-draft-brief.js";

export function TaskDraftAiDialog({
  prompt,
  busy,
  waitSeconds,
  error,
  onPromptChange,
  onClose,
  onGenerate,
}: {
  prompt: string;
  busy: boolean;
  waitSeconds: number;
  error: string;
  onPromptChange: (value: string) => void;
  onClose: () => void;
  onGenerate: () => void;
}) {
  const locked = busy || waitSeconds > 0;
  return (
    <ModalBackdrop className="task-draft-ai-backdrop" onClose={onClose} enabled={!busy}>
      {(close) => (
        <section
          className="task-draft-ai-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-draft-ai-title"
          onClick={(event) => event.stopPropagation()}
        >
          <DialogHeader
            title={<>AI生成</>}
            titleId="task-draft-ai-title"
            subtitle={<>系统提示词固定。用户提示词可改，和已选文件一起交给模型。</>}
            onClose={close}
            disabled={busy}
            closeLabel="关闭 AI 生成"
          />
          <div className="task-draft-ai-body">
            <section className="task-draft-ai-block" aria-label="系统提示词">
              <h3>系统提示词</h3>
              <pre>{TASK_DRAFT_SYSTEM_PROMPT}</pre>
            </section>
            <div className="task-draft-ai-prompt">
              <div className="task-draft-ai-prompt-bar">
                <span>用户提示词</span>
                <button
                  type="button"
                  disabled={busy || prompt === DEFAULT_TASK_DRAFT_PROMPT}
                  onClick={() => onPromptChange(DEFAULT_TASK_DRAFT_PROMPT)}
                >
                  恢复默认
                </button>
              </div>
              <TextAreaField
                aria-label="用户提示词"
                value={prompt}
                disabled={busy}
                rows={6}
                maxLength={8000}
                onChange={(event) => onPromptChange(event.target.value)}
              />
            </div>
            {error ? (
              <p className="task-create-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <button type="button" disabled={busy} onClick={close}>
              取消
            </button>
            <button type="button" className="primary" disabled={locked} onClick={onGenerate}>
              {busy ? "正在生成…" : waitSeconds > 0 ? `${waitSeconds} 秒后再试` : "生成"}
            </button>
          </DialogFooter>
        </section>
      )}
    </ModalBackdrop>
  );
}
