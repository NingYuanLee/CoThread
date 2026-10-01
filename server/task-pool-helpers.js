const L3_DISPATCH_STATUSES = ["pending_assignment", "queued", "running", "waiting"];
const L3_DISPATCH_HINT =
  "任务已定，create_task 会尽量在同一次调用内启动并绑定 L3。见到 execution_agent_id 之前不要对成员说已经派人干活。";

export function parseDocumentRefs(value) {
  if (value == null || value === "") return [];
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed)
    ? [...new Set(parsed.filter((id) => typeof id === "string" && id))]
    : [];
}

export function composeTaskInstruction(task, documents = [], folders = []) {
  const parts = [task.title, "", task.goal];
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

export function withParsedTask(task) {
  if (!task) return task;
  return {
    ...task,
    document_refs: parseDocumentRefs(task.document_refs),
    folder_refs: parseDocumentRefs(task.folder_refs),
  };
}

function isL2OwnResponsibility(task) {
  return (
    task.task_type === "assist_l2" ||
    task.target_type === "l2_session" ||
    task.execution_agent_type === "dsh_l3"
  );
}

export function withL3DispatchGate(task, extra = {}) {
  if (!task) return extra;
  const needsDispatch =
    L3_DISPATCH_STATUSES.includes(task.status) &&
    isL2OwnResponsibility(task) &&
    !task.execution_agent_id;
  return needsDispatch
    ? { ...task, ...extra, needsDispatch: true, started: false, dispatchHint: L3_DISPATCH_HINT }
    : { ...task, ...extra };
}
