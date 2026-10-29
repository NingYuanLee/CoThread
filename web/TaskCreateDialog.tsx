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
import { LOGO_LOADING_MIN_MS, LogoLoading } from "./LogoLoading";
import { TaskDraftAiDialog } from "./TaskDraftAiDialog";
import { DEFAULT_TASK_DRAFT_PROMPT } from "../shared/task-draft-brief.js";
import { uploadFileWithIntegrity } from "./file-upload";

const LibraryPicker = lazy(() =>
  import("./LibraryPicker").then((module) => ({ default: module.LibraryPicker })),
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
  onLibraryRefresh?: () => Promise<void>;
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
  onLibraryRefresh,
  detail,
}: TaskCreateDialogProps) {
  const seeded = draftEdit || copyFrom;
  const [taskCreateTitle, setTaskCreateTitle] = useState(seeded?.title || "");
  const [taskCreateGoal, setTaskCreateGoal] = useState(seeded?.goal || "");
  const [taskCreateConstraints, setTaskCreateConstraints] = useState(seeded?.constraints || "");
  const [taskCreateTarget, setTaskCreateTarget] = useState(seeded?.targetUserId || "");
  const [taskCreateRefs, setTaskCreateRefs] = useState<string[]>(
    () => seeded?.refs || (initialRefId ? [initialRefId] : []),
  );
  const [taskCreateFolderRefs, setTaskCreateFolderRefs] = useState<string[]>(
    () => seeded?.folderRefs || (initialFolderId ? [initialFolderId] : []),
  );
  const [taskActionBusy, setTaskActionBusy] = useState(false);
  const [taskActionError, setTaskActionError] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState(DEFAULT_TASK_DRAFT_PROMPT);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiWait, setAiWait] = useState(0);
  const submitting = useRef(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const mounted = useRef(true);
  const aiLockedUntil = useRef(0);
  const aiTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearInterval(aiTimer.current);
    };
  }, []);
  const hasOfficialRefs = taskCreateRefs.length > 0 || taskCreateFolderRefs.length > 0;
  const organizing = (detail?.documentOrganizationJobs || []).some(
    (job) =>
      job.scope === "project" && !job.thread_id && ["queued", "running"].includes(job.status),
  );
  const officialRootId =
    (detail?.folders || []).find(
      (folder) => folder.folder_kind === "project_official" && !folder.parent_id,
    )?.id || "";
  const uploadFolderId =
    taskCreateFolderRefs.length === 1 ? taskCreateFolderRefs[0] : officialRootId;
  const uploadOfficialFiles = async (list: File[]) => {
    if (!writable || organizing) {
      showTip(organizing ? "正式文件正在整理，暂时不能上传" : "没有上传正式文件的权限", "error");
      return;
    }
    if (!uploadFolderId) {
      showTip("找不到正式文件目录，请刷新后重试", "error");
      return;
    }
    setUploading(true);
    try {
      const createdIds: string[] = [];
      for (const file of list) {
        const created = (await uploadFileWithIntegrity(
          { kind: "official_file", projectId, folderId: uploadFolderId },
          file,
        )) as { id: string };
        if (created?.id) createdIds.push(created.id);
      }
      await onLibraryRefresh?.();
      if (createdIds.length) {
        setTaskCreateRefs((current) => {
          const next = [...current];
          for (const id of createdIds) {
            if (!next.includes(id) && next.length < 30) next.push(id);
          }
          return next;
        });
      }
      showTip(list.length > 1 ? `已上传 ${list.length} 个文件` : "文件已上传");
    } catch (cause) {
      showTip((cause as Error).message, "error");
    } finally {
      setUploading(false);
    }
  };
  const lockGenerate = () => {
    const until = Date.now() + 5000;
    aiLockedUntil.current = until;
    setAiWait(5);
    clearInterval(aiTimer.current);
    aiTimer.current = setInterval(() => {
      const left = Math.ceil((until - Date.now()) / 1000);
      if (left <= 0) {
        setAiWait(0);
        clearInterval(aiTimer.current);
        return;
      }
      setAiWait(left);
    }, 200);
  };
  const generateBrief = async () => {
    if (aiBusy || Date.now() < aiLockedUntil.current) return;
    if (!hasOfficialRefs) {
      setTaskActionError("先选择正式文件，再生成");
      return;
    }
    lockGenerate();
    setAiOpen(false);
    setAiBusy(true);
    setTaskActionError("");
    const shownAt = Date.now();
    try {
      const brief = await api(`/projects/${projectId}/tasks/draft-brief`, {
        refs: taskCreateRefs,
        folderRefs: taskCreateFolderRefs,
        prompt: aiPrompt,
        threadId,
        ...(taskCreateTarget ? { targetUserId: taskCreateTarget } : {}),
      });
      if (!mounted.current) return;
      if (brief?.title) setTaskCreateTitle(String(brief.title));
      if (brief?.goal) setTaskCreateGoal(String(brief.goal));
      setTaskCreateConstraints(brief?.constraints ? String(brief.constraints) : "");
    } catch (cause) {
      if (!mounted.current) return;
      const message = (cause as Error).message;
      setTaskActionError(message);
      showTip(message, "error");
    } finally {
      const remain = LOGO_LOADING_MIN_MS - (Date.now() - shownAt);
      if (remain > 0) await new Promise((resolve) => setTimeout(resolve, remain));
      if (mounted.current) setAiBusy(false);
    }
  };
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
    <>
      <ModalBackdrop
        className="task-create-backdrop"
        onClose={onClose}
        enabled={!taskActionBusy && !aiOpen}
      >
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
                      ? "编辑任务"
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
              closeLabel={
                draftEdit
                  ? draftEdit.purpose === "save"
                    ? "关闭编辑"
                    : "关闭草稿"
                  : copyFrom
                    ? "关闭复制新建"
                    : "关闭新建任务"
              }
            />
            <form
              className="task-create-form"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                void submit(false);
              }}
            >
              <div className="task-create-split">
                <aside className="task-create-files" aria-label="引用正式文件">
                  <p className="task-create-files-label">引用正式文件</p>
                  <Suspense fallback={<p className="muted">正在加载正式文件…</p>}>
                    <LibraryPicker
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
                      onUpload={
                        writable && !organizing ? () => uploadInputRef.current?.click() : undefined
                      }
                      uploadDisabled={uploading || taskActionBusy}
                    />
                    <input
                      ref={uploadInputRef}
                      type="file"
                      multiple
                      hidden
                      onChange={(event) => {
                        const chosen = event.target.files ? Array.from(event.target.files) : [];
                        event.target.value = "";
                        if (chosen.length) void uploadOfficialFiles(chosen);
                      }}
                    />
                  </Suspense>
                </aside>
                <div className="task-create-fields">
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
                  <div className="task-create-ai">
                    <button
                      type="button"
                      className="task-create-ai-button"
                      disabled={aiBusy || taskActionBusy || !writable || !hasOfficialRefs}
                      title={
                        hasOfficialRefs ? "打开 AI 生成，可调整提示词" : "先在左侧选择正式文件"
                      }
                      onClick={() => {
                        setTaskActionError("");
                        setAiOpen(true);
                      }}
                    >
                      {aiBusy ? "正在生成…" : aiWait > 0 ? `${aiWait} 秒后再试` : "AI生成"}
                    </button>
                    <span className="task-create-ai-note">
                      根据左侧已选文件起草标题、目标和约束
                    </span>
                  </div>
                  {taskActionError ? (
                    <p className="task-create-error" role="alert">
                      {taskActionError}
                    </p>
                  ) : null}
                  <TextField
                    label="标题"
                    value={taskCreateTitle}
                    onChange={(event) => setTaskCreateTitle(event.target.value)}
                    maxLength={240}
                  />
                  <TextAreaField
                    label="任务目标与验收标准"
                    rows={6}
                    value={taskCreateGoal}
                    onChange={(event) => setTaskCreateGoal(event.target.value)}
                    maxLength={20000}
                  />
                  <TextAreaField
                    label="约束（可选）"
                    rows={5}
                    value={taskCreateConstraints}
                    onChange={(event) => setTaskCreateConstraints(event.target.value)}
                    maxLength={20000}
                  />
                </div>
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
      {aiOpen ? (
        <TaskDraftAiDialog
          prompt={aiPrompt}
          busy={aiBusy}
          waitSeconds={aiWait}
          error={taskActionError}
          onPromptChange={setAiPrompt}
          onClose={() => {
            if (!aiBusy) setAiOpen(false);
          }}
          onGenerate={() => void generateBrief()}
        />
      ) : null}
      {aiBusy ? <LogoLoading label="正在起草任务…" /> : null}
    </>
  );
}
