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
  return compact(
    path.length > 42 && filename !== path ? "…/" + filename : path,
  );
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
  return /^\.?\.?[\\/]/.test(words[0] || "") &&
    /\.(py|js|mjs|cjs|sh|rb|pl)$/i.test(words[0])
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
    case "sandbox_command": {
      const command =
        typeof args.command === "string" ? args.command.trim() : "";
      const script = scriptPath(command);
      action = script ? "运行脚本" : "运行命令";
      object = script || command.split(/\r?\n/)[0] || "命令";
      isPath = !!script;
      full = command;
      break;
    }
  }
  object = clean(object);
  const suffix = ["read_document", "publish_artifact"].includes(tool)
    ? version
    : "";
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
