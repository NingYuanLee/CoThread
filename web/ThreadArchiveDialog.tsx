import React, { useEffect, useRef, useState } from "react";
import { DialogClose, ModalBackdrop } from "./dialog-fx";
import { MarkdownDocumentPreview } from "./MarkdownDocumentPreview";
import { UiIcon } from "./ui-icon";
import { api } from "./workspace-api";

type Decision = {
  taskId: string;
  title: string;
  status: string;
  disposition: "retain" | "handoff" | "background";
  reason: string;
  priority?: 1 | 2 | 3;
  suggestion?: ArchiveChoice;
  assigneeUserId?: string;
};
type ArchiveChoice = "archive" | "background" | "task";
type ArchiveItem = {
  title: string;
  detail: string;
  include?: boolean;
  choice?: ArchiveChoice;
  suggestion?: ArchiveChoice;
  priority?: 1 | 2 | 3;
  assigneeUserId?: string;
};
const PRIORITIES = [
  { value: 1 as const, label: "高优先" },
  { value: 2 as const, label: "中优先" },
  { value: 3 as const, label: "低优先" },
];
const CHOICES: { value: ArchiveChoice; label: string }[] = [
  { value: "archive", label: "仅归档" },
  { value: "background", label: "录入新迭代背景" },
  { value: "task", label: "生成新迭代任务" },
];
const itemChoiceOf = (item: ArchiveItem): ArchiveChoice => {
  if (item.choice === "task" || item.choice === "background" || item.choice === "archive")
    return item.choice;
  if (item.include === true) return "task";
  if (item.include === false) return "archive";
  return "archive";
};
const taskChoiceOf = (disposition: string): ArchiveChoice =>
  disposition === "handoff" ? "task" : disposition === "background" ? "background" : "archive";
const dispositionOf = (choice: ArchiveChoice): Decision["disposition"] =>
  choice === "task" ? "handoff" : choice === "background" ? "background" : "retain";
type ArchiveWorkflow = {
  id: string;
  status: "preparing" | "ready" | "failed" | "cancelled" | "completed";
  canManage: boolean;
  conclusion: string;
  taskDecisions: Decision[];
  notes: string;
  nextIteration: {
    title: string;
    background: string;
    goal: string;
    items?: ArchiveItem[];
  };
  error?: string;
  nextThreadId?: string;
  session?: { phase?: string; messages?: { role: string; text: string }[] };
  members?: { id: string; name: string }[];
};
type ArchiveStep = 1 | 2 | 3 | 4 | 5;

const STEPS = ["AI分析整理", "迭代总结审查", "需决策事项", "新迭代承接", "AI操作执行"] as const;

const archiveItemsOf = (value: ArchiveWorkflow) =>
  (value.nextIteration?.items || []).map((item) => ({
    title: item.title || "",
    detail: item.detail || "",
    choice: itemChoiceOf(item),
    suggestion: item.suggestion,
    priority: item.priority,
  }));

export function ThreadArchiveDialog({
  threadId,
  title,
  onClose,
  onChanged,
}: {
  threadId: string;
  title: string;
  onClose: () => void;
  onChanged: (status: "active" | "archived", nextThreadId?: string) => Promise<void>;
}) {
  const [workflow, setWorkflow] = useState<ArchiveWorkflow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<ArchiveWorkflow | null>(null);
  const [createNext, setCreateNext] = useState(false);
  const [step, setStep] = useState<ArchiveStep>(1);
  const [summaryMode, setSummaryMode] = useState<"preview" | "edit">("preview");
  const [reviseOpen, setReviseOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reviseComment, setReviseComment] = useState("");
  const [reviseSession, setReviseSession] = useState<{
    comment: string;
    reply: string;
    pending: boolean;
  } | null>(null);
  const [executeLog, setExecuteLog] = useState<string[]>([]);
  const [detailEdit, setDetailEdit] = useState<{
    kind: "task" | "item";
    index: number;
    title: string;
    text: string;
  } | null>(null);
  const executed = useRef(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pollVersion, setPollVersion] = useState(0);
  const initialized = useRef("");
  const changed = useRef(onChanged);
  changed.current = onChanged;
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const load = async () => {
      try {
        const value: ArchiveWorkflow | null = await api(
          "/threads/" + threadId + "/archive",
          undefined,
          undefined,
          controller.signal,
        );
        if (!alive) return;
        setWorkflow(value);
        setLoaded(true);
        setError("");
        if (
          value &&
          ["ready", "completed"].includes(value.status) &&
          initialized.current !== value.id
        ) {
          initialized.current = value.id;
          const extra = (value.notes || "").trim();
          const conclusion = value.conclusion || "";
          setDraft({
            ...value,
            conclusion:
              extra && !conclusion.includes(extra)
                ? conclusion.trim()
                  ? conclusion.trim() + "\n\n" + extra
                  : extra
                : conclusion,
            notes: "",
            nextIteration: { ...value.nextIteration, items: archiveItemsOf(value) },
          });
          setCreateNext(
            !!value.nextThreadId ||
              value.taskDecisions.some((task) => task.disposition === "handoff") ||
              archiveItemsOf(value).some((item) => item.choice === "task"),
          );
          setStep(value.status === "ready" || value.status === "completed" ? 2 : 1);
        }
        if (value?.status === "preparing") timer = setTimeout(load, 2500);
      } catch (cause) {
        if (!alive) return;
        setError((cause as Error).message);
        timer = setTimeout(load, 5000);
      }
    };
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [threadId, pollVersion]);
  React.useEffect(() => {
    if (
      step === 1 &&
      workflow &&
      ["ready", "completed"].includes(workflow.status) &&
      draft &&
      !reviseSession?.pending
    ) {
      setStep(2);
    }
  }, [step, workflow?.status, draft, reviseSession?.pending]);
  const act = async (action: "cancel" | "retry" | "confirm", withNext = createNext) => {
    if (!workflow || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api(
        "/threads/" + threadId + "/archive/" + action,
        action === "confirm" && draft
          ? {
              workflowId: workflow.id,
              conclusion: draft.conclusion.trim(),
              taskDecisions: draft.taskDecisions.map(
                ({ taskId, disposition, reason, assigneeUserId }) => ({
                  taskId,
                  disposition,
                  reason,
                  ...(assigneeUserId ? { assigneeUserId } : {}),
                }),
              ),
              notes: draft.notes,
              createNextIteration: withNext,
              nextIteration: {
                ...draft.nextIteration,
                items: (draft.nextIteration.items || []).map((item) => ({
                  title: item.title.trim(),
                  detail: item.detail || "",
                  choice: itemChoiceOf(item),
                  ...(item.assigneeUserId ? { assigneeUserId: item.assigneeUserId } : {}),
                })),
              },
            }
          : { workflowId: workflow.id },
      );
      if (action === "retry") {
        initialized.current = "";
        setWorkflow({ ...workflow, status: "preparing", error: undefined });
        setDraft(null);
        setStep(1);
        setPollVersion((value) => value + 1);
      } else {
        await changed.current(action === "cancel" ? "active" : "archived", result?.nextThreadId);
        onClose();
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const ready = workflow?.status === "ready" && !!draft;
  const viewable = !!workflow && ["ready", "completed"].includes(workflow.status) && !!draft;
  const editable = !!workflow?.canManage && !busy && ready;
  const items = draft?.nextIteration.items || [];
  const selected = [
    ...(draft?.taskDecisions.map((task) => taskChoiceOf(task.disposition)) || []),
    ...items.map(itemChoiceOf),
  ];
  const backgroundCount = selected.filter((choice) => choice === "background").length;
  const taskCount = selected.filter((choice) => choice === "task").length;
  const hasDecisions = (draft?.taskDecisions.length || 0) + items.length > 0;
  const needsNext = backgroundCount + taskCount > 0;
  const updateItems = (next: ArchiveItem[]) =>
    setDraft((current) =>
      current ? { ...current, nextIteration: { ...current.nextIteration, items: next } } : current,
    );
  const setTaskChoice = (index: number, choice: ArchiveChoice) => {
    if (!draft) return;
    setDraft({
      ...draft,
      taskDecisions: draft.taskDecisions.map((item, at) =>
        at === index ? { ...item, disposition: dispositionOf(choice) } : item,
      ),
    });
  };
  const nextFieldsReady = !!(
    draft?.nextIteration.title.trim() &&
    draft?.nextIteration.background.trim() &&
    draft?.nextIteration.goal.trim()
  );
  const conclusionReady = !!draft?.conclusion.trim();
  const stepState = (index: number): "current" | "done" | "skipped" | "upcoming" => {
    const number = (index + 1) as ArchiveStep;
    if (number === step) return "current";
    if (!["ready", "completed"].includes(workflow?.status || "") && number > 1) return "skipped";
    if (number < step) return "done";
    return "upcoming";
  };
  const adjustNext = async () => {
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    try {
      const suggested = await api("/threads/" + threadId + "/archive/next-draft", {
        conclusion: draft.conclusion,
        notes: draft.notes || "",
        nextIteration: {
          title: draft.nextIteration.title,
          background: draft.nextIteration.background,
          goal: draft.nextIteration.goal,
        },
        decisions: [
          ...draft.taskDecisions.map((task) => ({
            title: task.title,
            detail: task.reason || "",
            choice: taskChoiceOf(task.disposition),
          })),
          ...items.map((item) => ({
            title: item.title,
            detail: item.detail || "",
            choice: itemChoiceOf(item),
          })),
        ],
      });
      setDraft((current) =>
        current
          ? {
              ...current,
              nextIteration: {
                ...current.nextIteration,
                title: suggested.title || current.nextIteration.title,
                background: suggested.background || current.nextIteration.background,
                goal: suggested.goal || current.nextIteration.goal,
              },
            }
          : current,
      );
      setCreateNext(true);
      setStep(4);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const rankAndOpen = async () => {
    if (!draft || busy) return;
    const missing =
      draft.taskDecisions.some((task) => !task.priority) || items.some((item) => !item.priority);
    if (!missing) {
      setStep(3);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const ranked: {
        decisions?: { key: string; priority?: 1 | 2 | 3; suggestion?: ArchiveChoice }[];
      } = await api("/threads/" + threadId + "/archive/prioritize", {
        conclusion: draft.conclusion,
        decisions: [
          ...draft.taskDecisions.map((task) => ({
            key: "task:" + task.taskId,
            title: task.title,
            detail: task.reason || "",
            kind: "task",
          })),
          ...items.map((item, index) => ({
            key: "item:" + index,
            title: item.title,
            detail: item.detail || "",
            kind: "item",
          })),
        ],
      });
      const byKey = new Map((ranked.decisions || []).map((item) => [item.key, item]));
      setDraft((current) => {
        if (!current) return current;
        return {
          ...current,
          taskDecisions: current.taskDecisions.map((task) => {
            const hit = byKey.get("task:" + task.taskId);
            if (!hit) return task;
            return {
              ...task,
              priority: hit.priority,
              suggestion: hit.suggestion,
              disposition: dispositionOf(hit.suggestion || "archive"),
            };
          }),
          nextIteration: {
            ...current.nextIteration,
            items: (current.nextIteration.items || []).map((item, index) => {
              const hit = byKey.get("item:" + index);
              if (!hit) return item;
              return {
                ...item,
                priority: hit.priority,
                suggestion: hit.suggestion,
                choice: hit.suggestion || item.choice,
              };
            }),
          },
        };
      });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
      setStep(3);
    }
  };
  const goNext = () => {
    if (step === 1) {
      if (workflow?.status === "ready" && !reviseSession?.pending) setStep(2);
      return;
    }
    if (step === 2) {
      if (hasDecisions) void rankAndOpen();
      else setStep(3);
      return;
    }
    if (step === 3) {
      if (!draft) return;
      if (needsNext) void adjustNext();
      else setStep(4);
      return;
    }
    if (step === 4) setStep(5);
  };
  const primaryLabel = (() => {
    if (busy) return "正在处理…";
    if (step === 5 || busy) return "正在执行…";
    if (step === 4) return "确认";
    return "下一步";
  })();
  const primaryDisabled =
    (step === 1 && (workflow?.status !== "ready" || !!reviseSession?.pending)) ||
    (step > 1 && step < 5 && (!editable || !conclusionReady)) ||
    (step === 4 && needsNext && !nextFieldsReady);
  const submitRevise = async () => {
    if (!workflow || !reviseComment.trim() || busy) return;
    const comment = reviseComment.trim();
    setReviseOpen(false);
    setReviseComment("");
    setReviseSession({ comment, reply: "", pending: true });
    setStep(1);
    setBusy(true);
    setError("");
    try {
      const result = await api("/threads/" + threadId + "/archive/revise", {
        workflowId: workflow.id,
        comment,
      });
      setDraft((current) =>
        current ? { ...current, conclusion: result.conclusion || current.conclusion } : current,
      );
      setReviseSession({
        comment,
        reply: result.conclusion || "已按意见修改总结。",
        pending: false,
      });
      setSummaryMode("preview");
    } catch (cause) {
      setError((cause as Error).message);
      setReviseSession({ comment, reply: "", pending: false });
    } finally {
      setBusy(false);
    }
  };
  React.useEffect(() => {
    if (step !== 5 || executed.current || !workflow || !draft) return;
    executed.current = true;
    setExecuteLog([needsNext ? "正在归档本轮并创建承接迭代" : "正在归档本轮"]);
    void act("confirm", needsNext);
  }, [step]);
  return (
    <ModalBackdrop onClose={onClose} enabled={!busy}>
      {(close) => (
        <section
          className="thread-archive-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="thread-archive-title"
        >
          <header className="thread-archive-header">
            <div>
              <span className="eyebrow">项目知识库管理员 · 迭代归档</span>
              <h2 id="thread-archive-title">归档与交接</h2>
              <p>{title}</p>
            </div>
            <DialogClose onClick={close} disabled={busy} label="关闭归档方案" />
          </header>
          {workflow && workflow.status !== "cancelled" && (
            <ol className="archive-steps" aria-label="归档步骤">
              {STEPS.map((label, index) => {
                const state = stepState(index);
                return (
                  <li
                    key={label}
                    className={"archive-step is-" + state}
                    aria-current={state === "current" ? "step" : undefined}
                  >
                    <span className="archive-step-index">{index + 1}</span>
                    <span>{index === 3 && !needsNext ? "确认归档" : label}</span>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="thread-archive-content">
            {step === 1 && (
              <p className="archive-freeze-notice">
                {workflow?.status === "completed" || (loaded && !workflow)
                  ? "本轮已归档，以下为已确认的结论与交接记录。"
                  : "当前迭代已冻结，消息、任务与背景目标暂不能变更。撤回归档后可继续协作。"}
              </p>
            )}
            {!loaded && !error && <p role="status">正在读取归档方案…</p>}
            {loaded && !workflow && <p>此迭代没有新版归档方案，请在历史会话中查看归档结论。</p>}
            {step === 1 && (
              <section className="archive-session" role="status" aria-live="polite">
                <p className="muted">
                  {reviseSession?.pending
                    ? "正在按修改意见重写迭代总结。"
                    : reviseSession
                      ? "已按修改意见重写，可以进入审查。"
                      : workflow?.status === "failed"
                        ? "整理失败，可以重试整理，或撤回归档。"
                        : workflow?.status === "ready" || workflow?.status === "completed"
                          ? "整理已完成，正在进入审查。"
                          : workflow?.session?.phase || "正在整理，会话会随进展更新。"}
                </p>
                <div className="archive-session-log">
                  {(reviseSession
                    ? [
                        { role: "user", text: reviseSession.comment },
                        ...(reviseSession.reply
                          ? [{ role: "assistant", text: reviseSession.reply }]
                          : []),
                      ]
                    : workflow?.session?.messages || []
                  ).map((message, index) => (
                    <article key={index} className={"archive-session-line is-" + message.role}>
                      <small>{message.role === "assistant" ? "知识库管理员" : "整理"}</small>
                      <p>{message.text}</p>
                    </article>
                  ))}
                  {!workflow?.session?.messages?.length && workflow?.status === "preparing" && (
                    <p className="muted">会话尚未写出内容。</p>
                  )}
                </div>
              </section>
            )}
            {workflow?.status === "cancelled" && (
              <p role="status">本次归档已撤回，请关闭窗口返回迭代。</p>
            )}
            {viewable && draft && (
              <div className="archive-step-panel">
                {step === 2 && (
                  <section className="archive-summary-review">
                    <span className="doc-view-mode" role="group" aria-label="总结显示">
                      <button
                        type="button"
                        className={summaryMode === "preview" ? "active" : ""}
                        aria-pressed={summaryMode === "preview"}
                        onClick={() => setSummaryMode("preview")}
                      >
                        <UiIcon name="preview" size={12} />
                        预览
                      </button>
                      <button
                        type="button"
                        className={summaryMode === "edit" ? "active" : ""}
                        aria-pressed={summaryMode === "edit"}
                        onClick={() => setSummaryMode("edit")}
                      >
                        <UiIcon name="edit" size={12} />
                        编辑
                      </button>
                    </span>
                    {summaryMode === "preview" ? (
                      <div className="archive-summary-preview">
                        <MarkdownDocumentPreview
                          mode="preview"
                          text={draft.conclusion || ""}
                          selected={null}
                          filename="迭代总结.md"
                          nativeSourceFrame={null}
                        />
                      </div>
                    ) : (
                      <textarea
                        disabled={!editable}
                        className="archive-summary"
                        rows={8}
                        maxLength={20000}
                        aria-label="迭代总结"
                        value={draft.conclusion}
                        onChange={(e) => setDraft({ ...draft, conclusion: e.target.value })}
                      />
                    )}
                  </section>
                )}
                {step === 3 && (
                  <section>
                    <p className="muted">按高、中、低优先排列。点详情可修改说明。</p>
                    {!hasDecisions && <p className="muted">本轮没有未完成项。</p>}
                    {(() => {
                      const order = PRIORITIES.flatMap((level) => [
                        ...draft.taskDecisions
                          .map((task, index) => ({
                            kind: "task" as const,
                            index,
                            priority: task.priority || 2,
                          }))
                          .filter((task) => task.priority === level.value),
                        ...items
                          .map((item, index) => ({
                            kind: "item" as const,
                            index,
                            priority: item.priority || 2,
                          }))
                          .filter((item) => item.priority === level.value),
                      ]);
                      const numberOf = new Map(
                        order.map((entry, at) => [entry.kind + ":" + entry.index, at + 1]),
                      );
                      return PRIORITIES.map((level) => {
                        const levelTasks = draft.taskDecisions
                          .map((task, index) => ({ task, index }))
                          .filter(({ task }) => (task.priority || 2) === level.value);
                        const levelItems = items
                          .map((item, index) => ({ item, index }))
                          .filter(({ item }) => (item.priority || 2) === level.value);
                        if (!levelTasks.length && !levelItems.length) return null;
                        return (
                          <section key={level.value} className="archive-priority">
                            <h3>{level.label}</h3>
                            <div className="archive-priority-list">
                              {levelTasks.map(({ task, index }) => {
                                const selected = taskChoiceOf(task.disposition);
                                const number = numberOf.get("task:" + index);
                                return (
                                  <article className="archive-decision-card" key={task.taskId}>
                                    <span className="archive-decision-index">{number}.</span>
                                    <div className="archive-decision-main">
                                      <header>
                                        <strong>{task.title}</strong>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setDetailEdit({
                                              kind: "task",
                                              index,
                                              title: number + ". " + task.title,
                                              text: task.reason || "",
                                            })
                                          }
                                        >
                                          详情
                                        </button>
                                      </header>
                                      <div
                                        className="archive-choice"
                                        role="group"
                                        aria-label={task.title}
                                      >
                                        {CHOICES.map((choice, at) => (
                                          <button
                                            key={choice.value}
                                            type="button"
                                            className={
                                              selected === choice.value ? "is-selected" : ""
                                            }
                                            aria-pressed={selected === choice.value}
                                            disabled={!editable}
                                            onClick={() => setTaskChoice(index, choice.value)}
                                          >
                                            <span className="archive-choice-letter">
                                              {["A", "B", "C"][at]}
                                            </span>
                                            <span>{choice.label}</span>
                                            {selected === choice.value ? (
                                              <UiIcon name="check" size={16} />
                                            ) : (
                                              <span className="archive-choice-gap" />
                                            )}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </article>
                                );
                              })}
                              {levelItems.map(({ item, index }) => {
                                const selected = itemChoiceOf(item);
                                const number = numberOf.get("item:" + index);
                                const title = item.title || "未命名";
                                return (
                                  <article className="archive-decision-card" key={"item-" + index}>
                                    <span className="archive-decision-index">{number}.</span>
                                    <div className="archive-decision-main">
                                      <header>
                                        <strong>{title}</strong>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setDetailEdit({
                                              kind: "item",
                                              index,
                                              title: number + ". " + title,
                                              text: item.detail || "",
                                            })
                                          }
                                        >
                                          详情
                                        </button>
                                      </header>
                                      <div
                                        className="archive-choice"
                                        role="group"
                                        aria-label={item.title || "未命名"}
                                      >
                                        {CHOICES.map((choice, at) => (
                                          <button
                                            key={choice.value}
                                            type="button"
                                            className={
                                              selected === choice.value ? "is-selected" : ""
                                            }
                                            aria-pressed={selected === choice.value}
                                            disabled={!editable}
                                            onClick={() =>
                                              updateItems(
                                                items.map((entry, position) =>
                                                  position === index
                                                    ? { ...entry, choice: choice.value }
                                                    : entry,
                                                ),
                                              )
                                            }
                                          >
                                            <span className="archive-choice-letter">
                                              {["A", "B", "C"][at]}
                                            </span>
                                            <span>{choice.label}</span>
                                            {selected === choice.value ? (
                                              <UiIcon name="check" size={16} />
                                            ) : (
                                              <span className="archive-choice-gap" />
                                            )}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </article>
                                );
                              })}
                            </div>
                          </section>
                        );
                      });
                    })()}
                  </section>
                )}
                {step === 4 && !needsNext && (
                  <section>
                    <p className="muted">
                      未完成项都选择了仅归档，不会创建承接迭代。确认后本轮归档完成。
                    </p>
                  </section>
                )}
                {step === 5 && (
                  <section className="archive-session" role="status">
                    <div className="archive-session-log">
                      {executeLog.map((line, index) => (
                        <p key={index}>{line}</p>
                      ))}
                      {!executeLog.length && <p className="muted">正在开始执行。</p>}
                    </div>
                  </section>
                )}
                {step === 4 && needsNext && (
                  <section className="archive-next-fields">
                    <p className="muted">
                      已按前面的选择调整。录入新迭代背景 {backgroundCount} 项，生成新迭代任务{" "}
                      {taskCount} 项。可再改后确认。
                    </p>
                    <label>
                      迭代名称
                      <input
                        disabled={!editable}
                        maxLength={160}
                        value={draft.nextIteration.title}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            nextIteration: { ...draft.nextIteration, title: e.target.value },
                          })
                        }
                      />
                    </label>
                    <label>
                      背景
                      <textarea
                        disabled={!editable}
                        rows={6}
                        maxLength={20000}
                        value={draft.nextIteration.background}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            nextIteration: { ...draft.nextIteration, background: e.target.value },
                          })
                        }
                      />
                    </label>
                    <label>
                      目标
                      <textarea
                        disabled={!editable}
                        rows={3}
                        maxLength={20000}
                        value={draft.nextIteration.goal}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            nextIteration: { ...draft.nextIteration, goal: e.target.value },
                          })
                        }
                      />
                    </label>
                    <div className="archive-assign">
                      <p className="muted">任务清单</p>
                      <table className="archive-assign-table">
                        <thead>
                          <tr>
                            <th className="archive-assign-no">序号</th>
                            <th>任务</th>
                            <th>指派人员</th>
                          </tr>
                        </thead>
                        <tbody>
                          {draft.taskDecisions
                            .filter((task) => task.disposition === "handoff")
                            .map((task, row) => (
                              <tr key={task.taskId}>
                                <td className="archive-assign-no">{row + 1}</td>
                                <td>{task.title}</td>
                                <td>
                                  <select
                                    disabled={!editable}
                                    aria-label={task.title + " 指派人员"}
                                    value={task.assigneeUserId || ""}
                                    onChange={(e) =>
                                      setDraft({
                                        ...draft,
                                        taskDecisions: draft.taskDecisions.map((item) =>
                                          item.taskId === task.taskId
                                            ? { ...item, assigneeUserId: e.target.value }
                                            : item,
                                        ),
                                      })
                                    }
                                  >
                                    <option value="">未指派</option>
                                    {(workflow?.members || []).map((member) => (
                                      <option key={member.id} value={member.id}>
                                        {member.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              </tr>
                            ))}
                          {items
                            .map((item, index) => ({ item, index }))
                            .filter(({ item }) => itemChoiceOf(item) === "task")
                            .map(({ item, index }, row) => (
                              <tr key={"item-" + index}>
                                <td className="archive-assign-no">
                                  {draft.taskDecisions.filter(
                                    (task) => task.disposition === "handoff",
                                  ).length +
                                    row +
                                    1}
                                </td>
                                <td>{item.title || "未命名"}</td>
                                <td>
                                  <select
                                    disabled={!editable}
                                    aria-label={(item.title || "未命名") + " 指派人员"}
                                    value={item.assigneeUserId || ""}
                                    onChange={(e) =>
                                      updateItems(
                                        items.map((entry, at) =>
                                          at === index
                                            ? { ...entry, assigneeUserId: e.target.value }
                                            : entry,
                                        ),
                                      )
                                    }
                                  >
                                    <option value="">未指派</option>
                                    {(workflow?.members || []).map((member) => (
                                      <option key={member.id} value={member.id}>
                                        {member.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {!draft.taskDecisions.some((task) => task.disposition === "handoff") &&
                        !items.some((item) => itemChoiceOf(item) === "task") && (
                          <p className="muted">没有要生成的任务。</p>
                        )}
                    </div>
                  </section>
                )}
              </div>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {workflow && !workflow.canManage && (
              <p className="muted">仅迭代创建人或项目负责人可以撤回或确认归档。</p>
            )}
          </div>
          <footer className="thread-archive-footer">
            {workflow?.canManage && ["preparing", "ready", "failed"].includes(workflow.status) && (
              <button
                className="danger"
                type="button"
                disabled={busy}
                onClick={() => void act("cancel")}
              >
                撤回归档
              </button>
            )}
            {viewable && step === 2 && (
              <button type="button" disabled={busy} onClick={() => setReviseOpen(true)}>
                AI修改
              </button>
            )}
            {viewable && step > 2 && step < 5 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setStep((step - 1) as ArchiveStep)}
              >
                上一步
              </button>
            )}
            {step === 1 &&
              workflow &&
              ["preparing", "failed", "ready"].includes(workflow.status) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPollVersion((value) => value + 1)}
                >
                  刷新
                </button>
              )}
            {step === 1 && workflow?.canManage && workflow.status === "failed" && (
              <button
                className="primary"
                type="button"
                disabled={busy}
                onClick={() => void act("retry")}
              >
                重试整理
              </button>
            )}
            {workflow?.canManage && ready && step > 1 && step < 5 && (
              <button
                className="primary"
                type="button"
                disabled={primaryDisabled || busy}
                onClick={() => (step === 4 ? setConfirmOpen(true) : goNext())}
              >
                {primaryLabel}
              </button>
            )}
            {viewable && !ready && step < 4 && (step < 2 || hasDecisions) && (
              <button type="button" onClick={goNext}>
                下一步
              </button>
            )}
          </footer>
          {confirmOpen && (
            <div className="archive-detail-layer">
              <section
                className="archive-detail-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="archive-confirm-title"
              >
                <header>
                  <h3 id="archive-confirm-title">确认归档</h3>
                  <DialogClose onClick={() => setConfirmOpen(false)} label="关闭确认" />
                </header>
                <p>
                  {needsNext
                    ? "确认后将归档本轮，并创建承接迭代「" +
                      (draft?.nextIteration.title.trim() || "未命名") +
                      "」。此操作不能撤销。"
                    : "确认后将归档本轮，不会创建承接迭代。此操作不能撤销。"}
                </p>
                <footer>
                  <button type="button" onClick={() => setConfirmOpen(false)}>
                    取消
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={busy}
                    onClick={() => {
                      setConfirmOpen(false);
                      setStep(5);
                    }}
                  >
                    确认
                  </button>
                </footer>
              </section>
            </div>
          )}
          {reviseOpen && (
            <div className="archive-detail-layer">
              <section
                className="archive-detail-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="archive-revise-title"
              >
                <header>
                  <h3 id="archive-revise-title">AI修改</h3>
                  <DialogClose onClick={() => setReviseOpen(false)} label="关闭修改意见" />
                </header>
                <label>
                  修改意见
                  <textarea
                    rows={6}
                    maxLength={4000}
                    value={reviseComment}
                    placeholder="说明要改的地方"
                    onChange={(e) => setReviseComment(e.target.value)}
                  />
                </label>
                <footer>
                  <button type="button" onClick={() => setReviseOpen(false)}>
                    取消
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={busy || !reviseComment.trim()}
                    onClick={() => void submitRevise()}
                  >
                    确认修改
                  </button>
                </footer>
              </section>
            </div>
          )}
          {detailEdit && (
            <div className="archive-detail-layer">
              <section
                className="archive-detail-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="archive-detail-title"
              >
                <header>
                  <h3 id="archive-detail-title">{detailEdit.title}</h3>
                  <DialogClose onClick={() => setDetailEdit(null)} label="关闭详情" />
                </header>
                <textarea
                  rows={8}
                  maxLength={2000}
                  disabled={!editable}
                  aria-label={detailEdit.title + " 详情"}
                  value={detailEdit.text}
                  onChange={(e) => setDetailEdit({ ...detailEdit, text: e.target.value })}
                />
                <footer>
                  <button type="button" onClick={() => setDetailEdit(null)}>
                    取消
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={!editable}
                    onClick={() => {
                      if (!draft) return;
                      if (detailEdit.kind === "task") {
                        setDraft({
                          ...draft,
                          taskDecisions: draft.taskDecisions.map((item, at) =>
                            at === detailEdit.index ? { ...item, reason: detailEdit.text } : item,
                          ),
                        });
                      } else {
                        updateItems(
                          items.map((item, at) =>
                            at === detailEdit.index ? { ...item, detail: detailEdit.text } : item,
                          ),
                        );
                      }
                      setDetailEdit(null);
                    }}
                  >
                    保存
                  </button>
                </footer>
              </section>
            </div>
          )}
        </section>
      )}
    </ModalBackdrop>
  );
}
