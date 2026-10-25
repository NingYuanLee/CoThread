const clean = (value) =>
  typeof value === "string"
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
const compact = (value) =>
  value.length > 85 ? value.slice(0, 40) + "…" + value.slice(-40) : value;
function pathLabel(value) {
  const path = clean(value);
  const filename = path.split(/[\\/]/).pop() || path;
  return compact(path.length > 42 && filename !== path ? "…/" + filename : path);
}
// Only classify an unambiguous script invocation. Shell pipelines, inline code,
// modules and compound commands remain commands; never infer a web tool here.
function scriptPath(command) {
  if (/[\r\n;&|<>`$]/.test(command)) return null;
  const tokens = command.match(/"[^"\n]*"|'[^'\n]*'|[^\s"']+/g) || [];
  if (tokens.join(" ") !== command.trim().replace(/\s+/g, " ")) return null;
  const words = tokens.map((x) => x.replace(/^(?:"(.*)"|'(.*)')$/, "$1$2"));
  const runner = (words[0] || "").split(/[\\/]/).pop();
  const extensions = {
    python: /\.pyw?$/i,
    python3: /\.pyw?$/i,
    python2: /\.pyw?$/i,
    node: /\.(?:js|mjs|cjs)$/i,
    bash: /\.sh$/i,
    sh: /\.sh$/i,
    zsh: /\.sh$/i,
    ruby: /\.rb$/i,
    perl: /\.pl$/i,
  };
  if (extensions[runner]) {
    let index = 1;
    if (/^python/.test(runner) && words[index] === "-u") index++;
    return extensions[runner].test(words[index] || "") ? words[index] : null;
  }
  return /^\.?\.?[\\/]/.test(words[0] || "") && /\.(py|js|mjs|cjs|sh|rb|pl)$/i.test(words[0])
    ? words[0]
    : null;
}
export function describeAgentAction(tool, args = {}, result = {}) {
  const version = result.version ? " · v" + result.version : "";
  const file =
    result.filename ||
    (typeof result.path === "string" ? result.path.split(/[\\/]/).pop() : "") ||
    result.title;
  let action = "执行任务",
    object = "",
    isPath = false,
    full;
  switch (tool) {
    case "list_documents":
      action = "查看文档目录";
      break;
    case "manage_document":
      action =
        {
          rename: "重命名文档",
          move: "移动文档",
          delete: args.scope === "version" ? "删除指定版本" : "删除全部版本",
          restore: args.scope === "version" ? "恢复指定版本" : "恢复文档",
        }[args.action] || "整理文档";
      object = args.name || args.versionId || args.artifactId;
      break;
    case "manage_folder":
      action =
        { create: "新建文件夹", rename: "重命名文件夹", move: "移动文件夹", delete: "删除文件夹" }[
          args.action
        ] || "整理文件夹";
      object = args.name || args.folderId;
      break;
    case "list_messages":
      action = "读取消息列表";
      object = result.title || "会话消息";
      break;
    case "read_message":
      action = "读取消息原文";
      object = "指定消息";
      break;
    case "list_members":
      action = "查看成员列表";
      break;
    case "read_member":
      action = "读取成员详情";
      object = result.name || "项目成员";
      break;
    case "search_memory":
      action = "检索项目记忆";
      object = args.query || "项目记忆";
      break;
    case "web_search":
      action = "搜索网页";
      object = args.query || "公开网页";
      break;
    case "web_fetch":
      action = "读取网页";
      object = args.url || result.url || "公开网页";
      break;
    case "thinking":
      action = "思考";
      break;
    case "project_context":
      action = "查看资料";
      object = "项目目录";
      break;
    case "read_iteration":
      action = "读取讨论";
      object = result.title || "迭代讨论";
      break;
    case "read_document":
      action = "读取文件";
      object = file || "项目文档";
      isPath = true;
      break;
    case "record_document_summary":
      action = "记录文档摘要";
      object = result.title || args.versionId || "项目文档";
      break;
    case "list_local_executors":
      action = "查看本地执行器";
      break;
    case "list_project_code_sources":
      action = "查看代码源";
      break;
    case "list_code_refs":
      action = "查看代码分支";
      object = args.remoteId || "代码仓库";
      break;
    case "list_code_tree":
      action = "查看代码目录";
      object = args.path || args.remoteId || "代码仓库";
      break;
    case "read_code_file":
      action = "读取代码文件";
      object = args.path || "代码文件";
      isPath = true;
      break;
    case "child_agent":
      action = "启动子 Agent";
      object = args.taskId || "DSH 子 Agent";
      break;
    case "send_message":
      action = "续接子 Agent";
      object = args.agentId || "DSH 子 Agent";
      break;
    case "interrupt_agent":
      action = "中断子 Agent";
      object = args.agentId || "DSH 子 Agent";
      break;
    case "list_agents":
      action = "查看 AgentTeam";
      object = args.scope || "children";
      break;
    case "post_message":
      action = "发言";
      break;
    case "create_task":
      action = "创建任务";
      object = args.title || args.taskId || "任务";
      break;
    case "update_task":
      action = "更新任务";
      object = args.taskId || "任务";
      break;
    case "reassign_task":
      action = "转交任务";
      object = args.taskId || "任务";
      break;
    case "ask_task_question":
      action = "提出问题";
      break;
    case "report_task":
      action = "交活";
      object = args.taskId || "任务";
      break;
    case "wait_for_updates":
      action = "等待更新";
      break;
    case "finish_turn":
      action = "结束本轮";
      break;
    case "list_project_tasks":
      action = "查看任务";
      break;
    case "inspect_task":
      action = "询问任务进度";
      object = args.taskId || "任务";
      break;
    case "assistant_text":
      action = "正文";
      break;
    case "assistant_final":
      action = "正文";
      break;
    case "participation_judge":
      action = "斟酌参与";
      break;
    case "agent_run":
      action = "运行子 Agent";
      break;
    case "resolve_task_rejection":
      action = args.action === "reopen" ? "重新发起任务" : "确认任务拒绝";
      object = args.taskId || "任务";
      break;
    case "recover_task":
      action = args.action === "cancel" ? "取消任务" : "重新安排任务";
      object = args.taskId || "任务";
      break;
    case "sandbox_read":
      action = "读取文件";
      object = args.path || "工作区文件";
      isPath = true;
      break;
    case "sandbox_write":
      action = "写入文件";
      object = args.path || "工作区文件";
      isPath = true;
      break;
    case "publish_artifact":
      action = "保存文档";
      object = args.path || args.title || "文档";
      isPath = true;
      break;
    case "branch_artifact":
      action = args.target === "new" ? "创建新文档新版" : "创建当前文档新版";
      object = args.versionId || "文档版本";
      break;
    case "sandbox_command": {
      const command = typeof args.command === "string" ? args.command.trim() : "";
      const script = scriptPath(command);
      action = script ? "运行脚本" : "运行命令";
      object = script || command.split(/\r?\n/)[0] || "命令";
      isPath = !!script;
      full = command;
      break;
    }
  }
  object = clean(object);
  const suffix = ["read_document", "publish_artifact"].includes(tool) ? version : "";
  return {
    action,
    target: (isPath ? pathLabel(object) : compact(object)) + suffix,
    full: full || object + suffix,
  };
}
export function formatAgentAction(tool, args = {}, result = {}) {
  const label = describeAgentAction(tool, args, result);
  return label.action + (label.target ? " " + label.target : "");
}

export const LAOWENG_TASK_LABELS = {
  member_memory: "成员发言",
  document_memory: "文档摘要",
  project_document_memory: "文档摘要",
  iteration_document_memory: "文档摘要",
  document_organization: "文档整理（已下线）",
  iteration_archive: "迭代归档",
  thread_archive: "迭代归档",
  project_memory: "项目记忆",
};

export const LAOWENG_MAINTENANCE_TASKS = [
  "member_memory",
  "document_memory",
  "document_organization",
  "iteration_archive",
  "project_memory",
];

export function normalizeLaowengTask(task) {
  if (["document_memory", "project_document_memory", "iteration_document_memory"].includes(task))
    return "document_memory";
  if (task === "thread_archive") return "iteration_archive";
  return task || "";
}

export function laowengTaskLabel(task) {
  return LAOWENG_TASK_LABELS[task] || (task ? String(task) : "");
}

const VISIBLE_AGENT_TEXT = [
  ["dsh-layer/laoweng-tools.mjs", "老翁工具策略"],
  ["server/laoweng-agent.js", "老翁维护"],
  ["COTHREAD_SKILLS_BY_LEVEL.laoweng", "老翁 Skill 配置"],
  ["COTHREAD_SKILLS_BY_LEVEL.xiaoxiang", "小祥 Skill 配置"],
  ["COTHREAD_SKILLS_BY_LEVEL.child_agent", "子 Agent Skill 配置"],
  ["runLaowengTask", "老翁维护任务"],
  ["get_l1_status", "老翁状态"],
  ["list_l1_document_queue", "老翁文档队列"],
  ["list_l1_runs", "老翁维护记录"],
  ["get_l1_logs", "老翁日志"],
  ["retry_l1_task", "重试老翁任务"],
  ["child_agent", "子 Agent 调度"],
  ["cothread-l1-tool-policy", "老翁工具策略"],
  ["cothread-l1-policy", "老翁工具策略"],
  ["dsh-layer/l1-tools.mjs", "老翁工具策略"],
  ["server/l1-agent.js", "老翁维护"],
  ["COTHREAD_SKILLS_BY_LEVEL.l1", "老翁 Skill 配置"],
  ["COTHREAD_SKILLS_BY_LEVEL.l2", "小祥 Skill 配置"],
  ["COTHREAD_SKILLS_BY_LEVEL.l3", "子 Agent Skill 配置"],
  ["runL1Task", "老翁维护任务"],
  ["assist_l2", "辅助任务"],
  ["dsh_l3", "子 Agent 调度"],
  ["l2_session", "小祥"],
  ["l1_session", "老翁"],
];

/** 管理页展示用。现行键是 laoweng、xiaoxiang、child_agent；这里只把历史文本翻成成员名。 */
export function visibleAgentText(value) {
  let text = String(value ?? "");
  for (const [from, to] of VISIBLE_AGENT_TEXT) text = text.split(from).join(to);
  return text;
}
