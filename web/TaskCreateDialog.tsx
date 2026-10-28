import { DialogFooter } from "./DialogFooter";
import { DialogHeader } from "./DialogHeader";
/**
 * 新建人类任务弹窗：标题、目标与验收标准、约束、引用文件与指派成员。
 * 弹窗拥有表单草稿和提交状态，父组件只提供上下文、初始引用和完成通知。
 */
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { AGENT_MEMBER } from "../shared/agent-member.js";
import { ModalBackdrop } from "./dialog-fx";
import { UiIcon } from "./ui-icon";
import { api } from "./workspace-api";
import type { Detail } from "./workspace-types";
import type { PersonalProfile } from "./ProfileFields";
import { showTip } from "./Tip";
import { TextField } from "./TextField";
import { TextAreaField } from "./TextAreaField";
import { SelectField } from "./SelectField";

const LibraryPickerField = lazy(() =>
  import("./LibraryPicker").then((module) => ({ default: module.LibraryPickerField })),
);

/** 从已取消任务带入新建表单的草稿。提交后原任务不变，新任务记下来源任务。 */
export type TaskCreateCopy = {
  sourceTaskId: string;
  title: string;
  goal: string;
  constraints?: string;
  targetUserId?: string;
  refs?: string[];
  folderRefs?: string[];
};

/** 编辑已有草稿。保存只更新内容；提交会变成待确认的正式任务。 */
export type TaskDraftEdit = {
  taskId: string;
  purpose: "save" | "submit";
  title: string;
  goal: string;
  constraints?: string;
  targetUserId?: string;
  refs?: string[];
  folderRefs?: string[];
};

export type TaskCreateDialogProps = {
  threadId: string;
  projectId: string;
  writable: boolean;
  initialRefId?: string;
  initialFolderId?: string;
  copyFrom?: TaskCreateCopy;
  draftEdit?: TaskDraftEdit;
  user: PersonalProfile;
  onClose: () => void;
  onCreated: (taskId: string) => void;
  detail: Detail | null;
};

export function TaskCreateDialog({
  threadId,
  projectId,
  writable,
  initialRefId,
  initialFolderId,
  copyFrom,
  draftEdit,
  user,
  onClose,
  onCreated,
  detail,
}: TaskCreateDialogProps) {
  const seeded = draftEdit || copyFrom;
  const [taskCreateTitle, setTaskCreateTitle] = useState(seeded?.title || "");
  const [taskCreateGoal, setTaskCreateGoal] = useState(seeded?.goal || "");
  const [taskCreateConstraints, setTaskCreateConstraints] = useState(seeded?.constraints || "");
  const [taskCreateTarget, setTaskCreateTarget] = useState(seeded?.targetUserId || user.id);
  const [taskCreateRefs, setTaskCreateRefs] = useState<string[]>(
    () => seeded?.refs || (initialRefId ? [initialRefId] : []),
  );
  const [taskCreateFolderRefs, setTaskCreateFolderRefs] = useState<string[]>(
    () => seeded?.folderRefs || (initialFolderId ? [initialFolderId] : []),
  );
  const [taskActionBusy, setTaskActionBusy] = useState(false);
  const [taskActionError, setTaskActionError] = useState("");
  const submitting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const submit = async (asDraft = false) => {
    if (submitting.current) return;
    if (!writable) {
      setTaskActionError("当前迭代只读，任务暂不能变更");
      return;
    }
    if (!taskCreateTitle.trim() || !taskCreateGoal.trim() || !taskCreateTarget) return;
    submitting.current = true;
    setTaskActionBusy(true);
    setTaskActionError("");
    try {
      const payload = {
        title: taskCreateTitle.trim(),
        goal: taskCreateGoal.trim(),
        constraints: taskCreateConstraints.trim() || undefined,
        refs: taskCreateRefs,
        folderRefs: taskCreateFolderRefs,
        targetType: "human_member" as const,
        targetUserId: taskCreateTarget,
      };
      const created = draftEdit
        ? await api(
            `/tasks/${draftEdit.taskId}/${draftEdit.purpose === "save" ? "save-draft" : "submit"}`,
            payload,
          )
        : copyFrom
          ? await api(`/tasks/${copyFrom.sourceTaskId}/copy`, payload)
          : await api(`/projects/${projectId}/tasks`, { ...payload, threadId, asDraft });
      if (!mounted.current) return;
      showTip(
        draftEdit
          ? draftEdit.purpose === "save"
            ? "草稿已保存"
            : "已提交正式任务"
          : copyFrom
            ? "已复制新建任务"
            : asDraft
              ? "草稿已保存"
              : "任务已创建",
      );
      onCreated(created.id);
    } catch (cause) {
      if (!mounted.current) return;
      const message = (cause as Error).message;
      setTaskActionError(message);
      showTip(message, "error");
    } finally {
      submitting.current = false;
      if (mounted.current) setTaskActionBusy(false);
    }
  };
  return (
    <ModalBackdrop className="task-create-backdrop" onClose={onClose} enabled={!taskActionBusy}>
      {(close) => (
        <section
          className="task-create-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-create-dialog-title"
          onClick={(event) => event.stopPropagation()}
        >
          <DialogHeader
            title={
              <>
                {draftEdit
                  ? draftEdit.purpose === "save"
                    ? "保存草稿"
                    : "提交正式任务"
                  : copyFrom
                    ? "复制新建任务"
                    : "新建人类任务"}
              </>
            }
            titleId="task-create-dialog-title"
            subtitle={
              <>{detail?.threads.find((item) => item.id === threadId)?.title || "未选择迭代"}</>
            }
            leftExtra={
              <>
                <div>
                  <span>当前迭代</span>
                </div>
              </>
            }
            onClose={close}
            disabled={taskActionBusy}
            closeLabel={draftEdit ? "关闭草稿" : copyFrom ? "关闭复制新建" : "关闭新建任务"}
          />
          <form
            className="task-create-form"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              void submit(false);
            }}
          >
            <div className="task-create-fields">
              <TextField
                label="标题"
                autoFocus
                value={taskCreateTitle}
                onChange={(event) => setTaskCreateTitle(event.target.value)}
                maxLength={240}
              />
              <TextAreaField
                label="任务目标与验收标准"
                value={taskCreateGoal}
                onChange={(event) => setTaskCreateGoal(event.target.value)}
                maxLength={20000}
              />
              <TextAreaField
                label="约束（可选）"
                value={taskCreateConstraints}
                onChange={(event) => setTaskCreateConstraints(event.target.value)}
                maxLength={20000}
              />
              <div className="task-create-library">
                <Suspense fallback={<p className="muted">正在加载文件选择…</p>}>
                  <LibraryPickerField
                    label="引用正式文件"
                    buttonLabel="选择文件或文件夹"
                    dialogTitle="选择正式文件"
                    dialogDescription="可同时选择文件和文件夹。选中文件夹后，其中已选文件会自动收进该文件夹。"
                    folders={detail?.folders || []}
                    files={detail?.versions || []}
                    rootKinds={["project_official"]}
                    allowFiles
                    allowFolders
                    multiple
                    value={{ fileIds: taskCreateRefs, folderIds: taskCreateFolderRefs }}
                    onChange={(next) => {
                      setTaskCreateRefs(next.fileIds);
                      setTaskCreateFolderRefs(next.folderIds);
                    }}
                    searchPlaceholder="搜索正式文件或文件夹"
                    emptyLabel="暂无可引用的正式文件"
                  />
                </Suspense>
              </div>
              <SelectField
                allOption={false}
                label="指派成员"
                placeholder="选择指派成员"
                value={taskCreateTarget}
                onChange={setTaskCreateTarget}
                options={(detail?.members || [])
                  .filter(
                    (member) =>
                      member.kind !== "laoweng" &&
                      member.kind !== "xiaoxiang" &&
                      member.id !== AGENT_MEMBER.id &&
                      member.role !== "viewer",
                  )
                  .map((member) => ({
                    value: member.id,
                    label: `${member.name}${member.id === user?.id ? "（我）" : ""}`,
                  }))}
              />
            </div>
            <DialogFooter>
              <button type="button" disabled={taskActionBusy} onClick={close}>
                取消
              </button>
              {!copyFrom && !draftEdit && (
                <button
                  type="button"
                  disabled={
                    taskActionBusy ||
                    !writable ||
                    !taskCreateTitle.trim() ||
                    !taskCreateGoal.trim() ||
                    !taskCreateTarget
                  }
                  onClick={() => void submit(true)}
                >
                  <UiIcon name="save" size={13} />
                  保存草稿
                </button>
              )}
              <button
                type="submit"
                className="primary"
                disabled={
                  taskActionBusy ||
                  !writable ||
                  !taskCreateTitle.trim() ||
                  !taskCreateGoal.trim() ||
                  !taskCreateTarget
                }
              >
                <UiIcon
                  name={draftEdit?.purpose === "save" ? "save" : copyFrom ? "copy" : "plus"}
                  size={13}
                />
                {draftEdit
                  ? draftEdit.purpose === "save"
                    ? "保存"
                    : "提交正式任务"
                  : copyFrom
                    ? "复制新建"
                    : "创建正式任务"}
              </button>
            </DialogFooter>
          </form>
        </section>
      )}
    </ModalBackdrop>
  );
}
