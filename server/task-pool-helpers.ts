const CHILD_DISPATCH_STATUSES = ["pending_assignment", "queued", "running", "waiting"];
const CHILD_DISPATCH_HINT =
  "任务已定，create_task 会尽量在同一次调用内启动并绑定 子 Agent。见到 execution_agent_id 之前不要对成员说已经派人干活。";

/** 任务行里本文件会用到的字段；其余列原样透传。 */
export type TaskRow = {
  title?: unknown;
  goal?: unknown;
  constraints?: unknown;
  document_refs?: unknown;
  folder_refs?: unknown;
  task_type?: string | null;
  target_type?: string | null;
  execution_agent_type?: string | null;
  execution_agent_id?: unknown;
  status?: string | null;
  [column: string]: unknown;
};

/** 引用文档（或文件夹）的最小信息。 */
export type RefItem = {
  id?: string;
  title?: unknown;
  name?: unknown;
  filename?: unknown;
  version?: unknown;
};

/** 把 JSON 列或已解析的数组统一成去重后的字符串数组。 */
export function parseDocumentRefs(value: unknown): string[] {
  if (value == null || value === "") return [];
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed)
    ? [...new Set(parsed.filter((id): id is string => typeof id === "string" && Boolean(id)))]
    : [];
}

export function composeTaskInstruction(
  task: TaskRow,
  documents: RefItem[] = [],
  folders: RefItem[] = [],
): string {
  const parts: unknown[] = [task.title, "", task.goal];
  if (task.constraints) parts.push("", `约束：${task.constraints}`);
  if (folders.length) {
    parts.push("", "引用文件夹：");
    for (const folder of folders) parts.push(`- ${folder.title || folder.name || folder.id}`);
    parts.push(
      "这些是文件夹。读取时请列出其下全部子目录和文件，不要把文件夹展开成有限个文件引用。",
    );
  }
  if (documents.length) {
    parts.push("", "引用文档：");
    for (const doc of documents) {
      const name = doc.title || doc.filename || doc.id;
      parts.push(`- ${name}${doc.version ? ` · v${doc.version}` : ""}`);
    }
  }
  return parts.join("\n");
}

export function withParsedTask(task: TaskRow | null | undefined): TaskRow | null | undefined {
  if (!task) return task;
  return {
    ...task,
    document_refs: parseDocumentRefs(task.document_refs),
    folder_refs: parseDocumentRefs(task.folder_refs),
  };
}

export function isXiaoxiangOwnResponsibility(task: TaskRow): boolean {
  return (
    task.task_type === "assist" ||
    task.target_type === "xiaoxiang" ||
    task.execution_agent_type === "child_agent"
  );
}

/** 补上「要不要派子 Agent」的提示字段。 */
export function withChildDispatchGate(
  task: TaskRow | null | undefined,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  if (!task) return extra;
  const needsDispatch =
    CHILD_DISPATCH_STATUSES.includes(task.status as string) &&
    isXiaoxiangOwnResponsibility(task) &&
    !task.execution_agent_id;
  return needsDispatch
    ? { ...task, ...extra, needsDispatch: true, started: false, dispatchHint: CHILD_DISPATCH_HINT }
    : { ...task, ...extra };
}
