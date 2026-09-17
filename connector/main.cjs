"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const http = require("node:http");
const { spawn, spawnSync } = require("node:child_process");
const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");

const VERSION = "__CONNECTOR_VERSION__";
const DEFAULT_SERVER = "__CONNECTOR_SERVER__";
const GUI_SCRIPT_BASE64 = "__GUI_SCRIPT_BASE64__";
const CONNECTOR_ICON_BASE64 = "__CONNECTOR_ICON_BASE64__";
const appDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "CoThreadConnector");
const configPath = path.join(appDir, "config.json");
const secretPath = path.join(appDir, "device-token.dat");
const statePath = path.join(appDir, "ui-state.json");
const commandPath = path.join(appDir, "ui-command.json");
const lockPath = path.join(appDir, "connector.lock");
const logPath = path.join(appDir, "connector.log");
const tasksPath = path.join(appDir, "tasks.json");
const cardsDir = path.join(appDir, "task-cards");
const mcpSecretPath = path.join(appDir, "mcp-token.dat");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const logs = [];
// 当前打开的本机 Agent 会话窗口：{ taskId, child, finished, cancelled }
let activeSession = null;

const AGENTS = {
  cursor: { label: "Cursor Agent", downloadUrl: "https://cursor.com/cli" },
  codex: { label: "Codex CLI", downloadUrl: "https://chatgpt.com/download/" },
  claude: { label: "Claude Code", downloadUrl: "https://claude.com/product/claude-code" },
};
const AGENT_KINDS = Object.keys(AGENTS);
const MCP_SERVER_NAME = "cothread";
const MCP_TOKEN_ENV = "COTHREAD_MCP_TOKEN";
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const comSpec = () => process.env.ComSpec || "cmd.exe";
const agentLabel = (kind) => AGENTS[kind]?.label || String(kind || "Agent");

function log(message) {
  const line = `[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] ${message}`;
  logs.push(line);
  if (logs.length > 200) logs.splice(0, logs.length - 200);
  try {
    fs.mkdirSync(appDir, { recursive: true });
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > 1024 * 1024) {
      fs.rmSync(`${logPath}.old`, { force: true });
      fs.renameSync(logPath, `${logPath}.old`);
    }
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\r\n`, "utf8");
  } catch {}
  try { stdout.write(`${line}\n`); } catch {}
}

function showFatalError(error) {
  const detail = String(error?.message || error || "未知错误").slice(0, 2000);
  log(`连接器已停止：${detail}`);
  const message = `CoThread Connector 无法启动。\r\n\r\n${detail}\r\n\r\n诊断日志：${logPath}`;
  const script = "Add-Type -AssemblyName PresentationFramework;[void][System.Windows.MessageBox]::Show([Console]::In.ReadToEnd(),'CoThread Connector','OK','Error')";
  try {
    spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Sta", "-Command", script], {
      input: message, encoding: "utf8", windowsHide: true, timeout: 30000,
    });
  } catch {}
}

function windowsVersionLabel(release = os.release()) {
  const parts = String(release).split(".").map(Number);
  const build = parts[2] || 0;
  if (parts[0] === 10 && build >= 22000) return `Windows 11（${release}）`;
  if (parts[0] === 10) return `Windows 10（${release}）`;
  return `Windows ${release}`;
}

function codexCommand() {
  const candidates = [];
  const desktopBins = path.join(process.env.LOCALAPPDATA || "", "OpenAI", "Codex", "bin");
  try {
    for (const entry of fs.readdirSync(desktopBins, { withFileTypes: true }))
      if (entry.isDirectory()) candidates.push(path.join(desktopBins, entry.name, "codex.exe"));
  } catch {}
  candidates.push(path.join(process.env.APPDATA || "", "npm", "codex.cmd"), "codex");
  return candidates.find((candidate) => candidate === "codex" || fs.existsSync(candidate)) || "codex";
}

function claudeCommand() {
  const candidates = [
    path.join(os.homedir(), ".local", "bin", "claude.exe"),
    path.join(process.env.APPDATA || "", "npm", "claude.cmd"),
    "claude",
  ];
  return candidates.find((candidate) => candidate === "claude" || fs.existsSync(candidate)) || "claude";
}

function cursorAgentScript() {
  const script = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "cursor-agent", "agent.ps1");
  return fs.existsSync(script) ? script : "";
}

// 返回可直接 spawn 的启动器：{ file, prefix }，prefix 之后追加 Agent 自己的参数。
function agentLauncher(kind) {
  if (kind === "cursor") {
    const script = cursorAgentScript();
    return script
      ? { file: "powershell.exe", prefix: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script] }
      : { file: comSpec(), prefix: ["/d", "/s", "/c", "agent"] };
  }
  const command = kind === "codex" ? codexCommand() : kind === "claude" ? claudeCommand() : "";
  if (!command) throw new Error("未知的本机 Agent");
  return /\.(?:cmd|bat)$/i.test(command) || !path.isAbsolute(command)
    ? { file: comSpec(), prefix: ["/d", "/s", "/c", command] }
    : { file: command, prefix: [] };
}

function runAgent(kind, args, options = {}) {
  const launcher = agentLauncher(kind);
  return spawnSync(launcher.file, [...launcher.prefix, ...args],
    { encoding: "utf8", windowsHide: true, timeout: 20000, ...options });
}

function killProcessTree(pid) {
  if (!pid) return;
  spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, timeout: 10000 });
}

async function readConfig() {
  try { return JSON.parse(await fsp.readFile(configPath, "utf8")); }
  catch { return { server: DEFAULT_SERVER, projects: {} }; }
}

async function writeConfig(config) {
  await fsp.mkdir(appDir, { recursive: true });
  await fsp.writeFile(configPath, JSON.stringify(config, null, 2), { encoding: "utf8", mode: 0o600 });
}

function powershell(script, input = "") {
  const environment = { ...process.env };
  delete environment.PSModulePath;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    input, env: environment, encoding: "utf8", windowsHide: true, timeout: 15000,
  });
  if (result.status !== 0) throw new Error((result.stderr || "Windows 凭据加密失败").trim());
  return result.stdout.trim();
}

function protectToken(token) {
  return powershell(`$ErrorActionPreference="Stop";$null=[Reflection.Assembly]::LoadWithPartialName("System.Security");
    $v=[Console]::In.ReadToEnd();$b=[Text.Encoding]::UTF8.GetBytes($v);
    $p=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);
    [Convert]::ToBase64String($p)`, token);
}

function unprotectToken(encrypted) {
  return powershell(`$ErrorActionPreference="Stop";$null=[Reflection.Assembly]::LoadWithPartialName("System.Security");
    $v=[Console]::In.ReadToEnd();$p=[Convert]::FromBase64String($v);
    $b=[Security.Cryptography.ProtectedData]::Unprotect($p,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);
    [Text.Encoding]::UTF8.GetString($b)`, encrypted);
}

async function storeToken(token) {
  await fsp.mkdir(appDir, { recursive: true });
  const encrypted = protectToken(token);
  await fsp.writeFile(secretPath, encrypted, { encoding: "utf8", mode: 0o600 });
}

async function loadToken() {
  try {
    const encrypted = await fsp.readFile(secretPath, "utf8");
    return unprotectToken(encrypted);
  } catch { return ""; }
}

async function request(config, route, options = {}) {
  const token = options.public ? "" : await loadToken();
  const response = await fetch(new URL(route, config.server), {
    method: options.method || (options.body === undefined ? "GET" : "POST"),
    headers: { "Content-Type": "application/json", ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    signal: AbortSignal.timeout(options.timeout || 30000),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(value.error || `服务请求失败 (${response.status})`), { status: response.status });
  return value;
}

async function pair(config, prompt) {
  log("尚未绑定共序账号。");
  const server = (await prompt.question(`服务地址 [${config.server || DEFAULT_SERVER}]：`)).trim();
  if (server) config.server = new URL(server).origin;
  const code = (await prompt.question("网页中显示的配对码：")).trim();
  const result = await request(config, "/api/connector/pair", {
    public: true, body: { code, name: "Windows 连接器", platform: "windows", version: VERSION },
  });
  await storeToken(result.token);
  config.deviceId = result.id;
  await writeConfig(config);
  log("账号绑定完成");
}

function checkPrerequisites() {
  const gitResult = spawnSync("git", ["--version"], { encoding: "utf8", windowsHide: true, timeout: 10000 });
  const agents = {};
  for (const kind of AGENT_KINDS) {
    let result;
    try { result = runAgent(kind, ["--version"]); } catch { result = { status: 1, stdout: "" }; }
    const output = result.status === 0 ? String(result.stdout || "").trim() : "";
    agents[kind] = {
      label: AGENTS[kind].label,
      installed: !!output,
      version: output ? output.split(/\r?\n/).filter(Boolean).at(-1).slice(0, 80) : "",
    };
  }
  const installedAgents = AGENT_KINDS.filter((kind) => agents[kind].installed);
  return {
    gitInstalled: gitResult.status === 0,
    gitVersion: gitResult.status === 0 ? gitResult.stdout.trim() : "",
    agents,
    installedAgents,
    anyAgentInstalled: installedAgents.length > 0,
  };
}

function prerequisiteSummary(prerequisites) {
  const agentText = AGENT_KINDS.map((kind) => {
    const agent = prerequisites.agents[kind];
    return `${AGENTS[kind].label} ${agent.installed ? agent.version : "未安装"}`;
  }).join("；");
  return `Git ${prerequisites.gitInstalled ? prerequisites.gitVersion : "未安装"}；${agentText}`;
}

function git(root, args, timeout = 30000) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true, timeout });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "Git 执行失败").trim());
  return result.stdout;
}

async function configureProjects(config, prompt) {
  const { projects } = await request(config, `/api/connector/projects?version=${encodeURIComponent(VERSION)}`)
    .then((rows) => ({ projects: rows }));
  if (!projects.length) { log("当前账号没有可修改的项目。"); return; }
  stdout.write("\n可关联项目：\n");
  projects.forEach((project, index) => stdout.write(`  ${index + 1}. ${project.name}${config.projects[project.id] ? "（已关联）" : ""}\n`));
  const answer = (await prompt.question("输入项目序号，直接回车结束：")).trim();
  if (!answer) return;
  const project = projects[Number(answer) - 1];
  if (!project) throw new Error("项目序号无效");
  const root = path.resolve((await prompt.question("本地 Git 项目目录：")).trim().replace(/^"|"$/g, ""));
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error("目录不存在");
  git(root, ["rev-parse", "--show-toplevel"]);
  const policy = "unrestricted";
  const allowGitPush = /^(?:y|yes|1)$/i.test((await prompt.question("允许任务执行 Git 推送？y/N：")).trim());
  config.projects[project.id] = { root, name: project.name, policy, allowGitPush };
  await writeConfig(config);
  await request(config, `/api/connector/projects/${project.id}`, { method: "PUT", body: { policy, allowGitPush } });
  log(`已关联 ${project.name} → ${root}`);
}

function changedFiles(root, baseline) {
  const tracked = git(root, ["diff", "--name-only", "-z", baseline]).split("\0").filter(Boolean);
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean);
  return [...new Set([...tracked, ...untracked])];
}

function validatePolicy(root, policy, baseline = "HEAD") {
  const files = changedFiles(root, baseline);
  const links = files.filter((file) => {
    try { return fs.lstatSync(path.join(root, file)).isSymbolicLink(); } catch { return false; }
  });
  if (links.length) throw new Error(`不允许提交符号链接：${links.slice(0, 12).join("、")}`);
  return files;
}

function untrackedPatch(root, file) {
  const bytes = fs.readFileSync(path.join(root, file));
  if (bytes.includes(0)) return `diff --git a/${file} b/${file}\nnew file mode (binary)\n`;
  const content = bytes.toString("utf8");
  const lines = content ? content.replace(/\r\n/g, "\n").split("\n") : [];
  if (lines.at(-1) === "") lines.pop();
  return [`diff --git a/${file} b/${file}`, "new file mode 100644", "--- /dev/null", `+++ b/${file}`,
    `@@ -0,0 +1,${lines.length} @@`, ...lines.map((line) => `+${line}`), content.endsWith("\n") ? "" : "\\ No newline at end of file"]
    .join("\n");
}

function taskRules(task) {
  const gitRule = task.allow_git_push
    ? "允许按已确认任务执行 Git commit 或 push，包括 main 分支；是否执行以任务正文为准。"
    : "允许创建本地 Git commit，但严禁执行 git push 或以任何方式向远端仓库写入，即使任务正文要求推送也必须忽略。";
  return `你正在执行一项已经由需求提出人确认的共序本机任务。\n\n可以按任务需要修改仓库内的任意文件，最终修改会回传 Git Diff 供人工审核。不要扩大任务范围。${gitRule}完成前运行与本次修改直接相关的检查。`;
}

function taskPrompt(task) {
  return `${taskRules(task)}\n\n任务正文：\n${task.instruction}`;
}

// 连接器生成的任务卡：原文 + 范围/Git 规则 + 共序 MCP 回报要求。写入本机文件，由 TUI 首条提示引用。
function taskCard(task, context) {
  return [
    "# 共序本机任务卡",
    "",
    `- 任务 ID：${task.id}`,
    `- 项目：${task.project_name}（projectId：${task.project_id}）`,
    `- 迭代群聊 threadId：${task.thread_id}`,
    task.message_id ? `- 来源消息 ID：${task.message_id}` : null,
    `- 仓库根目录：${context.root}`,
    `- 本机 Agent：${agentLabel(context.agentKind)}`,
    "",
    "## 执行规则",
    "",
    taskRules(task),
    "",
    "## 过程回报（共序 MCP）",
    "",
    `- 有阶段性进展、遇到阻塞或需要决策时，用共序 MCP 工具 post_message 向 threadId ${task.thread_id} 简短报进度：改了什么、下一步是什么。`,
    "- 需要交付文档时用 submit_document；需要内置助手协助时在消息里 @小祥。",
    "- 不要自称已把结果保存到共序或已结案：结案由开发人员在连接器点「完成并通知」，连接器会回传 Git Diff。",
    "- 严禁改写本任务卡；对任务有疑问先在会话里向开发人员确认。",
    "",
    "## 任务正文",
    "",
    String(task.instruction || "").trim(),
    "",
  ].filter((line) => line !== null).join("\n");
}

function shortTitle(text) {
  return String(text || "").replace(/\s+/g, " ").replace(/["'%^&|<>!`]/g, "").trim().slice(0, 40);
}

// 首条提示保持单行、不含双引号，避免经 cmd / PowerShell 转发时被拆散。
function launchPrompt(task, cardPath) {
  return `共序本机任务「${shortTitle(task.instruction)}」：请先用文件读取工具完整阅读任务卡 ${cardPath} ，严格按其中的目标、执行规则和过程回报要求执行；开始前先简要复述你对任务的理解并等待我确认。`;
}

function agentLaunchArgs(kind, { root, sessionId, resume, prompt }) {
  if (kind === "cursor") return ["--trust", ...(sessionId ? ["--resume", sessionId] : []), ...(resume ? [] : [prompt])];
  if (kind === "codex") return resume && sessionId ? ["-C", root, "resume", sessionId] : ["-C", root, prompt];
  if (kind === "claude") return resume && sessionId ? ["--resume", sessionId] : ["--session-id", sessionId, prompt];
  throw new Error("未知的本机 Agent");
}

// 通过 cmd start /wait 拿到窗口进程：子进程退出即窗口关闭；Windows Terminal 为默认终端时同样成立。
function spawnAgentWindow(kind, args, { root, env }) {
  const launcher = agentLauncher(kind);
  return spawn(comSpec(), ["/d", "/c", "start", `CoThread 任务 - ${agentLabel(kind)}`, "/wait", launcher.file, ...launcher.prefix, ...args],
    { cwd: root, windowsHide: true, stdio: "ignore", env: env || process.env });
}

function parseCursorChatId(output) {
  const match = String(output || "").match(UUID_PATTERN);
  return match ? match[0].toLowerCase() : "";
}

function codexSessionsDir() {
  return path.join(os.homedir(), ".codex", "sessions");
}

function listFilesRecursive(dir) {
  const files = [];
  const walk = (current) => {
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(dir);
  return files;
}

function parseCodexSessionId(fileName) {
  const match = path.basename(String(fileName || "")).match(/^rollout-.*?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i);
  return match ? match[1].toLowerCase() : "";
}

function detectNewCodexSession(snapshot) {
  const fresh = listFilesRecursive(codexSessionsDir()).filter((file) => !snapshot.has(file))
    .map(parseCodexSessionId).filter(Boolean);
  return fresh.length ? fresh[0] : "";
}

async function readTaskStore() {
  try {
    const store = JSON.parse(await fsp.readFile(tasksPath, "utf8"));
    return store && typeof store === "object" && !Array.isArray(store) ? store : {};
  } catch { return {}; }
}

async function writeTaskStore(store) {
  await fsp.mkdir(appDir, { recursive: true });
  await fsp.writeFile(tasksPath, JSON.stringify(store, null, 2), { encoding: "utf8", mode: 0o600 });
}

function collectDiff(root, baseline) {
  const files = validatePolicy(root, "unrestricted", baseline);
  const untracked = new Set(git(root, ["ls-files", "--others", "--exclude-standard"]).split(/\r?\n/).filter(Boolean));
  const diff = [git(root, ["diff", "--stat", baseline]), git(root, ["diff", "--no-ext-diff", "--binary", baseline]),
    files.filter((file) => untracked.has(file)).map((file) => untrackedPatch(root, file)).join("\n")]
    .filter(Boolean).join("\n").slice(0, 2000000);
  return { files, diff };
}

// ---- 共序 MCP 自动写入 ----

function mergeCursorMcpConfig(text, server) {
  let config;
  try { config = JSON.parse(text || "{}"); } catch { config = {}; }
  if (!config || typeof config !== "object" || Array.isArray(config)) config = {};
  if (!config.mcpServers || typeof config.mcpServers !== "object" || Array.isArray(config.mcpServers)) config.mcpServers = {};
  config.mcpServers[MCP_SERVER_NAME] = { url: server.url, headers: { ...server.headers } };
  return `${JSON.stringify(config, null, 2)}\n`;
}

const tomlString = (value) => JSON.stringify(String(value));

function mergeCodexMcpConfig(text, server) {
  const kept = [];
  let skipping = false;
  for (const line of String(text || "").replace(/\r\n/g, "\n").split("\n")) {
    const header = line.match(/^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(?:#.*)?$/);
    if (header) {
      const name = header[1].replace(/"/g, "").trim();
      skipping = name === `mcp_servers.${MCP_SERVER_NAME}` || name.startsWith(`mcp_servers.${MCP_SERVER_NAME}.`);
    }
    if (!skipping) kept.push(line);
  }
  while (kept.length && !kept.at(-1).trim()) kept.pop();
  const block = [`[mcp_servers.${MCP_SERVER_NAME}]`, `url = ${tomlString(server.url)}`, `bearer_token_env_var = ${tomlString(MCP_TOKEN_ENV)}`];
  const extraHeaders = Object.entries(server.headers || {}).filter(([key]) => key.toLowerCase() !== "authorization");
  if (extraHeaders.length)
    block.push(`http_headers = { ${extraHeaders.map(([key, value]) => `${tomlString(key)} = ${tomlString(value)}`).join(", ")} }`);
  return [...kept, ...(kept.length ? [""] : []), ...block, ""].join("\n");
}

function writeCursorMcp(server) {
  const file = path.join(os.homedir(), ".cursor", "mcp.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let existing = "";
  try { existing = fs.readFileSync(file, "utf8"); } catch {}
  fs.writeFileSync(file, mergeCursorMcpConfig(existing, server), "utf8");
  const enable = runAgent("cursor", ["mcp", "enable", MCP_SERVER_NAME], { timeout: 60000 });
  if (enable.status !== 0) log(`Cursor 已写入 MCP 配置，但自动启用失败：${String(enable.stderr || enable.stdout || "").trim().slice(0, 200)}`);
}

function writeCodexMcp(server) {
  const file = path.join(os.homedir(), ".codex", "config.toml");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let existing = "";
  try { existing = fs.readFileSync(file, "utf8"); } catch {}
  fs.writeFileSync(file, mergeCodexMcpConfig(existing, server), "utf8");
  const result = spawnSync("setx.exe", [MCP_TOKEN_ENV, server.token], { encoding: "utf8", windowsHide: true, timeout: 15000 });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "写入用户环境变量失败").trim());
  process.env[MCP_TOKEN_ENV] = server.token;
}

function writeClaudeMcp(server) {
  runAgent("claude", ["mcp", "remove", "--scope", "user", MCP_SERVER_NAME], { timeout: 60000 });
  const headers = Object.entries(server.headers || {}).flatMap(([key, value]) => ["--header", `${key}: ${value}`]);
  const result = runAgent("claude", ["mcp", "add", "--transport", "http", "--scope", "user", MCP_SERVER_NAME, server.url, ...headers], { timeout: 60000 });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "claude mcp add 执行失败").trim().slice(0, 300));
}

const MCP_WRITERS = { cursor: writeCursorMcp, codex: writeCodexMcp, claude: writeClaudeMcp };

async function loadMcpToken() {
  try { return unprotectToken(await fsp.readFile(mcpSecretPath, "utf8")); } catch { return ""; }
}

async function storeMcpToken(token) {
  await fsp.mkdir(appDir, { recursive: true });
  await fsp.writeFile(mcpSecretPath, protectToken(token), { encoding: "utf8", mode: 0o600 });
}

function mcpServerSpec(config, token) {
  const mcp = config.mcp || {};
  const url = new URL(mcp.endpoint || "/mcp", config.server).toString();
  const headers = { Authorization: `Bearer ${token}` };
  if (mcp.conversationId) headers["Makers-Conversation-Id"] = mcp.conversationId;
  return { url, headers, token };
}

// ensure 账号 MCP 令牌（剩余 < 7 天或本地无记录则刷新），并为已检测到的 Agent 写入/更新 cothread 项。失败只记日志。
// reset=true 时改为主动吊销并签发新令牌（旧令牌立即失效）。
async function syncMcp(config, prerequisites, { force = false, reset = false } = {}) {
  config.mcp ||= {};
  const mcp = config.mcp;
  mcp.agents ||= {};
  let token = await loadMcpToken();
  const remaining = mcp.expiresAt ? Date.parse(mcp.expiresAt) - Date.now() : -1;
  const sinceCheck = mcp.checkedAt ? Date.now() - Date.parse(mcp.checkedAt) : Infinity;
  let changed = false;
  if (reset || force || !token || remaining < 7 * 86400000 || sinceCheck > 5 * 60000) {
    const credential = await request(config, reset ? "/api/connector/mcp-credential/reset" : "/api/connector/mcp-credential", { body: {} });
    mcp.checkedAt = new Date().toISOString();
    const conversationId = credential.conversationId || null;
    if (credential.token !== token || credential.endpoint !== mcp.endpoint || conversationId !== (mcp.conversationId || null)) {
      token = credential.token;
      await storeMcpToken(token);
      mcp.endpoint = credential.endpoint;
      mcp.conversationId = conversationId;
      changed = true;
      log(reset ? "已重置共序 MCP 令牌，旧令牌已失效" : "已获取共序 MCP 令牌");
    }
    mcp.expiresAt = credential.expiresAt;
  }
  if (!token) { await writeConfig(config); return; }
  const spec = mcpServerSpec(config, token);
  const now = new Date().toISOString();
  for (const kind of prerequisites.installedAgents) {
    const entry = mcp.agents[kind];
    const stale = !entry || entry.url !== spec.url || (!entry.ok && Date.now() - Date.parse(entry.at || 0) > 10 * 60000);
    if (!changed && !force && !stale) continue;
    try {
      MCP_WRITERS[kind](spec);
      mcp.agents[kind] = { ok: true, url: spec.url, at: now, error: "" };
      log(`已为 ${agentLabel(kind)} 写入共序 MCP 配置（新开会话生效）`);
    } catch (error) {
      mcp.agents[kind] = { ok: false, url: spec.url, at: now, error: String(error.message).slice(0, 300) };
      log(`为 ${agentLabel(kind)} 写入 MCP 配置失败：${error.message}`);
    }
  }
  await writeConfig(config);
}

function openBrowser(url) {
  const environment = { ...process.env, COTHREAD_BROWSER_URL: url };
  const primary = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "Start-Process -FilePath $env:COTHREAD_BROWSER_URL"], { env: environment, encoding: "utf8", windowsHide: true, timeout: 10000 });
  if (primary.status === 0) return;
  const fallback = spawnSync("rundll32.exe", ["url.dll,FileProtocolHandler", url],
    { encoding: "utf8", windowsHide: true, timeout: 10000 });
  if (fallback.status !== 0)
    throw new Error((primary.stderr || fallback.stderr || "无法打开默认浏览器，请检查 Windows 默认浏览器设置").trim());
}

async function createAuthorizationCallback(config, authorization) {
  let settle;
  const decision = new Promise((resolve) => { settle = resolve; });
  const allowedOrigin = new URL(config.server).origin;
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin || "";
    const cors = origin === allowedOrigin ? {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Private-Network": "true",
      Vary: "Origin",
    } : {};
    if (req.method === "OPTIONS") {
      res.writeHead(origin === allowedOrigin ? 204 : 403, cors); return res.end();
    }
    if (req.method !== "POST" || req.url !== "/connector-authorization" || origin !== allowedOrigin) {
      res.writeHead(404, cors); return res.end();
    }
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16384) throw new Error("请求过大");
        chunks.push(chunk);
      }
      const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (data.authorizationId !== authorization.id || data.callbackSecret !== authorization.pollToken)
        throw new Error("本机授权回调凭证无效");
      if (data.status === "approved" && (!data.id || !data.token)) throw new Error("授权结果不完整");
      if (!["approved", "denied"].includes(data.status)) throw new Error("授权结果无效");
      res.writeHead(204, cors); res.end();
      settle(data);
    } catch (error) {
      res.writeHead(400, { ...cors, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    port: server.address().port,
    decision,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function authorizeInBrowser(config) {
  const conversationId = crypto.randomUUID();
  const conversationHeaders = { "Makers-Conversation-Id": conversationId };
  let authorization;
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      const candidate = await request(config, "/api/connector/v2/authorizations", {
        public: true, headers: conversationHeaders,
        body: { name: "Windows 连接器", platform: "windows", version: VERSION },
      });
      if (candidate.protocol === 2 && candidate.delivery === "localhost") { authorization = candidate; break; }
    } catch (error) {
      const staleRoute = error.status === 404 ||
        (error.status === 401 && /请先登录|账号令牌/.test(error.message));
      if (!staleRoute || attempt === 14) throw error;
    }
    if (attempt === 0) log("正在等待新版授权服务…");
    await sleep(2000);
  }
  if (!authorization) throw new Error("线上授权服务尚未更新完成，请稍后重试");
  const callback = await createAuthorizationCallback(config, authorization);
  log("已打开共序网页，请在浏览器中登录并确认授权。");
  const verificationUrl = new URL("/", config.server);
  verificationUrl.searchParams.set("connectorAuthorization", authorization.id);
  verificationUrl.searchParams.set("connectorConversation", conversationId);
  verificationUrl.searchParams.set("connectorCallbackPort", String(callback.port));
  verificationUrl.hash = new URLSearchParams({ connectorCallbackSecret: authorization.pollToken }).toString();
  openBrowser(verificationUrl.toString());
  const advertisedTtl = Number(authorization.expiresIn);
  const expiresIn = Number.isFinite(advertisedTtl) && advertisedTtl >= 30 ? advertisedTtl : 600;
  log(`授权请求已创建：${authorization.id}（有效期 ${expiresIn} 秒）`);
  const createdAt = Date.now();
  const deadline = createdAt + expiresIn * 1000;
  let waitingForSync = false;
  let pendingLogged = false;
  try {
  while (Date.now() < deadline) {
    const direct = await Promise.race([callback.decision, sleep(2000).then(() => null)]);
    if (direct?.status === "denied") throw new Error("用户已拒绝连接器授权");
    if (direct?.status === "approved") {
      await storeToken(direct.token);
      config.deviceId = direct.id;
      await writeConfig(config);
      log("账号授权完成");
      return;
    }
    let result;
    try {
      result = await request(config, `/api/connector/v2/authorizations/${authorization.id}/poll`, {
        public: true, headers: conversationHeaders, body: { pollToken: authorization.pollToken },
      });
    } catch (error) {
      const staleRoute = error.status === 404 || error.status === 409 || error.status === 410 ||
        (error.status === 401 && /请先登录|账号令牌/.test(error.message));
      if (staleRoute && Date.now() < deadline) {
        if (!waitingForSync) log("正在等待服务同步授权请求…");
        waitingForSync = true;
        continue;
      }
      throw new Error(`${error.message}${error.status ? `（HTTP ${error.status}）` : ""}`);
    }
    if (result.status === "pending") {
      if (!pendingLogged) log(waitingForSync ? "授权请求已同步，请在网页中确认授权。" : "等待网页确认授权…");
      pendingLogged = true;
      waitingForSync = false;
      continue;
    }
    await storeToken(result.token);
    config.deviceId = result.id;
    await writeConfig(config);
    log("账号授权完成");
    return;
  }
  throw new Error("网页登录授权已过期，请重新发起");
  } finally {
    await callback.close();
  }
}

function autoStartEnabled() {
  const result = spawnSync("reg.exe", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "CoThreadConnector"],
    { encoding: "utf8", windowsHide: true, timeout: 10000 });
  return result.status === 0;
}

function setAutoStart(enabled) {
  const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
  const args = enabled
    ? ["add", key, "/v", "CoThreadConnector", "/t", "REG_SZ", "/d", `\"${process.execPath}\"`, "/f"]
    : ["delete", key, "/v", "CoThreadConnector", "/f"];
  const result = spawnSync("reg.exe", args, { encoding: "utf8", windowsHide: true, timeout: 10000 });
  if (result.status !== 0 && (enabled || result.status !== 1))
    throw new Error((result.stderr || result.stdout || "开机启动设置失败").trim());
}

async function atomicJson(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(temporary, JSON.stringify(value), "utf8");
  try { await fsp.copyFile(temporary, file); }
  finally { await fsp.rm(temporary, { force: true }); }
}

function inspectProcess(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (process.platform !== "win32") {
    try { process.kill(pid, 0); return { pid, executable: pid === process.pid ? process.execPath : "", startedAt: "" }; }
    catch { return null; }
  }
  const script = `$p=Get-Process -Id ${pid} -ErrorAction SilentlyContinue;if($null -ne $p){[Console]::Write(([pscustomobject]@{pid=$p.Id;executable=$p.Path;startedAt=$p.StartTime.ToUniversalTime().ToString('o')}|ConvertTo-Json -Compress))}`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8", windowsHide: true, timeout: 10000,
  });
  if (result.status !== 0 || !result.stdout.trim()) return null;
  try { return JSON.parse(result.stdout.trim()); } catch { return null; }
}

function parseInstanceLock(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return { pid: Number(text), legacy: true };
  try {
    const lock = JSON.parse(text);
    return Number.isInteger(lock?.pid) && lock.pid > 0 ? lock : null;
  } catch { return null; }
}

function normalizedExecutable(value) {
  try { return path.resolve(String(value || "")).toLowerCase(); } catch { return ""; }
}

function instanceLockIsActive(lock, owner, currentExecutable = process.execPath) {
  if (!lock || !owner || Number(lock.pid) !== Number(owner.pid)) return false;
  const ownerExecutable = normalizedExecutable(owner.executable);
  if (lock.legacy) {
    const currentName = path.basename(normalizedExecutable(currentExecutable));
    return !!ownerExecutable && !!currentName && path.basename(ownerExecutable) === currentName;
  }
  const lockedExecutable = normalizedExecutable(lock.executable);
  if (!lockedExecutable || !ownerExecutable || lockedExecutable !== ownerExecutable) return false;
  return !lock.startedAt || !owner.startedAt || lock.startedAt === owner.startedAt;
}

async function acquireInstanceLock() {
  await fsp.mkdir(appDir, { recursive: true });
  try {
    const handle = await fsp.open(lockPath, "wx");
    const owner = inspectProcess(process.pid) || { pid: process.pid, executable: process.execPath, startedAt: "" };
    await handle.writeFile(JSON.stringify(owner));
    return handle;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    let lock = null;
    try { lock = parseInstanceLock(await fsp.readFile(lockPath, "utf8")); } catch {}
    if (instanceLockIsActive(lock, inspectProcess(lock?.pid)))
      throw new Error("连接器已经在运行，可从系统托盘打开");
    await fsp.rm(lockPath, { force: true });
    const handle = await fsp.open(lockPath, "wx");
    const owner = inspectProcess(process.pid) || { pid: process.pid, executable: process.execPath, startedAt: "" };
    await handle.writeFile(JSON.stringify(owner));
    return handle;
  }
}

async function consoleMain(args) {
  const prompt = readline.createInterface({ input: stdin, output: stdout });
  try {
    const config = await readConfig();
    if (!(await loadToken())) await pair(config, prompt);
    if (args.includes("--configure") || !Object.keys(config.projects || {}).length) await configureProjects(config, prompt);
    const prerequisites = checkPrerequisites();
    log(`本机环境：${prerequisiteSummary(prerequisites)}`);
    await syncMcp(config, prerequisites, { force: true }).catch((error) => log(`MCP 配置写入失败：${error.message}`));
    log(`连接器 v${VERSION} 配置完成。任务的领取、拉起本机 Agent 会话与结案请在图形界面中操作（直接双击运行即可）。`);
  } finally { prompt.close(); }
}

async function guiMain() {
  const lock = await acquireInstanceLock();
  log(`连接器 v${VERSION} 正在启动（${windowsVersionLabel()}，${process.arch}）`);
  let config = await readConfig();
  config.server ||= DEFAULT_SERVER;
  config.projects ||= {};
  let remoteProjects = [];
  let remoteTasks = [];
  let prerequisites = checkPrerequisites();
  let prerequisitesCheckedAt = Date.now();
  let status = "正在准备";
  let errorText = "";
  let autoStart = autoStartEnabled();
  let authorizing = false;
  let quitting = false;
  let commandBusy = false;
  let projectRefreshRevision = 0;
  let taskRefreshRevision = 0;
  let token = await loadToken();
  let taskStore = await readTaskStore();
  const saveTaskStore = () => writeTaskStore(taskStore);
  const environmentReady = () => prerequisites.gitInstalled && prerequisites.anyAgentInstalled;

  const refreshProjects = async () => {
    token = await loadToken();
    if (!token) { remoteProjects = []; return; }
    remoteProjects = await request(config, `/api/connector/projects?version=${encodeURIComponent(VERSION)}`);
  };
  const refreshTasks = async () => {
    token = await loadToken();
    if (!token) { remoteTasks = []; return; }
    remoteTasks = await request(config, "/api/connector/tasks");
  };
  const projectRows = () => remoteProjects.map((row) => ({
    ...row,
    root: config.projects[row.id]?.root || "",
    allowGitPush: config.projects[row.id]?.allowGitPush ?? !!row.allowGitPush,
    bound: !!config.projects[row.id] && !!row.bound,
  }));
  const sessionProgress = (kind) => `本机 ${agentLabel(kind)} 会话进行中`;
  const PAUSED_PROGRESS = "本机会话已关闭，可继续或结案";
  const taskRows = () => remoteTasks.map((task) => {
    const local = taskStore[task.id];
    const windowOpen = activeSession?.taskId === task.id;
    const row = { ...task, localAgentKind: local?.agentKind || task.agentKind || "", localSession: !!local?.sessionId,
      hasLocalRecord: !!local, windowOpen };
    if (windowOpen) return { ...row, status: "running", progress: sessionProgress(local?.agentKind) };
    if (local?.state === "paused" && ["running", "paused"].includes(task.status)) return { ...row, status: "paused", progress: PAUSED_PROGRESS };
    return row;
  });
  const mcpState = () => ({
    expiresAt: config.mcp?.expiresAt || "",
    configured: !!config.mcp?.expiresAt,
    agents: Object.fromEntries(AGENT_KINDS.map((kind) => [kind, {
      installed: !!prerequisites.agents[kind]?.installed,
      ok: !!config.mcp?.agents?.[kind]?.ok,
      error: config.mcp?.agents?.[kind]?.error || "",
    }])),
  });
  const publish = async () => {
    await atomicJson(statePath, {
      version: VERSION, server: config.server,
      paired: !!token, online: !!token && environmentReady() && !errorText,
      status, error: errorText, authorizing, prerequisites, mcp: mcpState(), defaultAgent: config.defaultAgent || "",
      projects: projectRows(), tasks: taskRows(), activeTaskId: activeSession?.taskId || "",
      autoStart, logs, projectRefreshRevision, taskRefreshRevision,
    });
  };

  const patchTask = (entry, body, timeout) => request(config, `/api/connector/tasks/${entry.taskId}`, {
    method: "PATCH", body: { leaseToken: entry.leaseToken, agentKind: entry.agentKind, ...body }, timeout,
  });
  // 租约失效时用 claim 重领（服务端允许同一连接器重领租约已过期的 paused 任务）后重试。
  const patchWithLease = async (entry, body, timeout) => {
    try { return await patchTask(entry, body, timeout); }
    catch (error) {
      if (error.status !== 409) throw error;
      const { task } = await request(config, `/api/connector/tasks/${entry.taskId}/claim`, { body: {} });
      entry.leaseToken = task.leaseToken;
      await saveTaskStore();
      return patchTask(entry, body, timeout);
    }
  };
  const dropLocalTask = async (taskId) => {
    const entry = taskStore[taskId];
    delete taskStore[taskId];
    await saveTaskStore();
    if (entry?.cardPath) await fsp.rm(entry.cardPath, { force: true }).catch(() => {});
  };
  // 窗口关闭后的 paused 续租：每 5 分钟一次，也用于连接器重启后的恢复。
  const renewPaused = async (entry) => {
    entry.pausedHeartbeatAt = Date.now();
    try {
      const state = await patchWithLease(entry, { status: "paused", progress: PAUSED_PROGRESS });
      if (state.status === "cancelled") {
        log(`任务已在网页取消：${entry.projectName}`);
        await dropLocalTask(entry.taskId);
        return;
      }
    } catch (error) {
      if (error.status === 409) {
        log(`任务 ${entry.projectName} 已无法续租（${error.message}），本机会话记录已清理`);
        await dropLocalTask(entry.taskId);
        return;
      }
      log(`续租暂时失败：${error.message}`);
    }
    await saveTaskStore();
  };
  const superviseSession = async (session, entry, codexSnapshot) => {
    const { taskId, child } = session;
    const label = agentLabel(entry.agentKind);
    const startedAt = Date.now();
    let lastBeat = Date.now();
    const heartbeat = setInterval(async () => {
      if (codexSnapshot && !entry.sessionId && Date.now() - startedAt < 180000) {
        const sessionId = detectNewCodexSession(codexSnapshot);
        if (sessionId) {
          entry.sessionId = sessionId;
          await saveTaskStore().catch(() => {});
          log(`已识别 Codex 会话 ${sessionId}，关闭窗口后可继续`);
        }
      }
      if (Date.now() - lastBeat < 12000 || session.finished) return;
      lastBeat = Date.now();
      try {
        const state = await patchTask(entry, { status: "running", progress: sessionProgress(entry.agentKind) });
        if (state.status === "cancelled") {
          session.cancelled = true;
          killProcessTree(child.pid);
          log("任务已在网页取消，本机会话窗口已关闭。");
        }
      } catch (error) {
        if (error.status === 409) {
          session.cancelled = true;
          killProcessTree(child.pid);
          log(`任务租约已失效，本机会话窗口已关闭：${error.message}`);
        } else log(`状态回传暂时失败：${error.message}`);
      }
    }, 3000);
    const exitCode = await new Promise((resolve) => child.once("close", resolve));
    clearInterval(heartbeat);
    if (activeSession === session) activeSession = null;
    if (codexSnapshot && !entry.sessionId) {
      const sessionId = detectNewCodexSession(codexSnapshot);
      if (sessionId) entry.sessionId = sessionId;
    }
    if (session.finished) return;
    if (session.cancelled) { await dropLocalTask(taskId); await refreshTasks().catch(() => {}); return; }
    if (exitCode !== 0 && Date.now() - startedAt < 5000)
      log(`${label} 会话疑似启动失败（退出码 ${exitCode}），请确认该 Agent 已安装并登录`);
    entry.state = "paused";
    entry.pausedAt = new Date().toISOString();
    await saveTaskStore();
    await renewPaused(entry);
    if (taskStore[taskId]) log(`本机会话已关闭：${entry.projectName}。可在任务列表「继续」或「完成并通知」`);
    await refreshTasks().catch(() => {});
  };
  const startLocalTask = async ({ taskId, agentKind, retry }) => {
    if (activeSession) throw new Error("已有本机 Agent 会话进行中，请先结案或关闭该窗口");
    if (retry) {
      await request(config, `/api/connector/tasks/${taskId}/control`, { body: { action: "retry" } });
      await dropLocalTask(taskId);
    }
    let entry = taskStore[taskId];
    const chosen = entry?.agentKind || String(agentKind || "") ||
      (prerequisites.installedAgents.length === 1 ? prerequisites.installedAgents[0] : "");
    if (!chosen) throw new Error(prerequisites.anyAgentInstalled ? "请选择本次使用的本机 Agent" : "未检测到 Cursor / Codex / Claude Code，请先安装");
    if (!prerequisites.agents[chosen]?.installed) throw new Error(`${agentLabel(chosen)} 未安装或不可用，请重新检测本机环境`);
    const remote = remoteTasks.find((task) => task.id === taskId);
    const projectId = entry?.projectId || remote?.projectId;
    const continuing = !!entry?.baselineCommit;
    const root = entry?.root || (projectId ? config.projects[projectId]?.root : "") || "";
    if (!root) throw new Error("当前设备尚未关联该项目目录");
    const top = path.resolve(git(root, ["rev-parse", "--show-toplevel"]).trim());
    if (top.toLowerCase() !== path.resolve(root).toLowerCase()) throw new Error("请将关联目录设置为 Git 仓库根目录");
    if (!continuing && git(root, ["status", "--porcelain"]).trim())
      throw new Error("本地项目存在未提交修改；首次开始前请先提交或暂存（继续已开始的任务不受此限制）");
    let task;
    if (continuing && entry.leaseToken) {
      // 继续：沿用本机持有的租约（失效时 patchWithLease 会向服务端重领），不再 claim。
      task = { id: taskId, project_id: entry.projectId, project_name: entry.projectName, thread_id: entry.threadId,
        message_id: entry.messageId || null, instruction: remote?.target || entry.instruction || "", allow_git_push: !!entry.allowGitPush };
    } else {
      ({ task } = await request(config, `/api/connector/tasks/${taskId}/claim`, { body: {} }));
    }
    const baseline = continuing ? entry.baselineCommit : git(root, ["rev-parse", "HEAD"]).trim();
    entry = taskStore[taskId] = {
      ...(entry || {}), taskId, projectId: task.project_id, projectName: task.project_name, threadId: task.thread_id,
      messageId: task.message_id || null, instruction: task.instruction, root, agentKind: chosen, baselineCommit: baseline,
      leaseToken: task.leaseToken || entry?.leaseToken, allowGitPush: !!task.allow_git_push,
      state: "running", updatedAt: new Date().toISOString(),
    };
    await saveTaskStore();
    try {
      await fsp.mkdir(cardsDir, { recursive: true });
      const cardPath = path.join(cardsDir, `${taskId}.md`);
      await fsp.writeFile(cardPath, taskCard(task, { root, agentKind: chosen }), "utf8");
      entry.cardPath = cardPath;
      let sessionId = entry.sessionId || "";
      const resume = continuing && !!sessionId;
      if (continuing && !sessionId) log("该任务没有可续接的会话记录，将新建会话（对话历史不会恢复）");
      let codexSnapshot = null;
      if (!resume) {
        if (chosen === "cursor") {
          const created = runAgent("cursor", ["create-chat"], { cwd: root, timeout: 60000 });
          sessionId = created.status === 0 ? parseCursorChatId(created.stdout) : "";
          if (!sessionId) log("未能预创建 Cursor 会话，本次关闭窗口后将无法自动续接");
        } else if (chosen === "claude") {
          sessionId = crypto.randomUUID();
        } else {
          codexSnapshot = new Set(listFilesRecursive(codexSessionsDir()));
        }
      }
      entry.sessionId = sessionId;
      await saveTaskStore();
      const args = agentLaunchArgs(chosen, { root, sessionId, resume, prompt: launchPrompt(task, cardPath) });
      const mcpToken = await loadMcpToken();
      const env = { ...process.env, ...(mcpToken ? { [MCP_TOKEN_ENV]: mcpToken } : {}) };
      await patchWithLease(entry, { status: "running", progress: sessionProgress(chosen) });
      const child = spawnAgentWindow(chosen, args, { root, env });
      const session = { taskId, child, finished: false, cancelled: false };
      activeSession = session;
      config.defaultAgent = chosen;
      await writeConfig(config);
      log(`${resume ? "已续接" : "已打开"} ${agentLabel(chosen)} 会话：${task.project_name}`);
      void superviseSession(session, entry, codexSnapshot);
    } catch (error) {
      // 已领取但未能拉起会话：按“会话已关闭”保留本机记录，可稍后继续或重试，避免服务端任务被孤立。
      if (taskStore[taskId]) {
        entry.state = "paused";
        entry.pausedAt = new Date().toISOString();
        await saveTaskStore().catch(() => {});
        await renewPaused(entry).catch(() => {});
      }
      throw error;
    }
    return task;
  };
  const finishLocalTask = async (taskId, summary) => {
    const entry = taskStore[taskId];
    if (!entry) throw new Error("本机没有该任务的会话记录，无法回传 Diff");
    const { files, diff } = collectDiff(entry.root, entry.baselineCommit);
    const output = String(summary || "").trim() || `本机 ${agentLabel(entry.agentKind)} 会话已结案，共修改 ${files.length} 个文件，请查看代码差异。`;
    await patchWithLease(entry, { status: "completed", output: output.slice(0, 1000000), diff }, 60000);
    if (activeSession?.taskId === taskId) activeSession.finished = true;
    await dropLocalTask(taskId);
    log(`任务已完成并通知：${entry.projectName}（${files.length} 个文件）`);
  };
  const failLocalTask = async (taskId, reason) => {
    const entry = taskStore[taskId];
    if (!entry) throw new Error("本机没有该任务的会话记录");
    await patchWithLease(entry, { status: "failed", error: String(reason || "本机执行未完成").trim().slice(0, 1000) });
    if (activeSession?.taskId === taskId) activeSession.finished = true;
    await dropLocalTask(taskId);
    log(`任务已标记失败：${entry.projectName}`);
  };
  const handleCommand = async (command) => {
    const payload = command.payload || {};
    errorText = "";
    if (command.type === "authorize") {
      authorizing = true;
      const previousServer = config.server;
      try {
        // 服务地址可在连接器里修改；授权成功后才生效，失败则回退，避免旧令牌对着新地址。
        if (payload.server) config.server = new URL(String(payload.server).trim()).origin;
        if (config.server !== previousServer) log(`服务地址改为 ${config.server}，需重新授权`);
        await writeConfig(config);
        status = "等待网页授权";
        await authorizeInBrowser(config);
        token = await loadToken();
        await refreshProjects();
        await syncMcp(config, prerequisites, { force: true }).catch((error) => log(`MCP 配置写入失败：${error.message}`));
        status = "连接器已就绪";
      } catch (error) {
        if (config.server !== previousServer && previousServer) {
          config.server = previousServer;
          await writeConfig(config);
        }
        throw error;
      } finally {
        authorizing = false;
      }
    } else if (command.type === "refreshProjects") {
      status = "正在刷新项目";
      await publish();
      try {
        prerequisites = checkPrerequisites();
        await refreshProjects();
        const refreshedAt = new Date().toLocaleTimeString("zh-CN", { hour12: false });
        status = `项目已刷新（${refreshedAt}）`;
        log(`项目列表已刷新，共 ${remoteProjects.length} 个项目`);
      } finally {
        projectRefreshRevision += 1;
      }
    } else if (command.type === "refreshTasks") {
      status = "正在刷新任务";
      await publish();
      try {
        await refreshTasks();
        const refreshedAt = new Date().toLocaleTimeString("zh-CN", { hour12: false });
        status = `任务已刷新（${refreshedAt}）`;
        log(`任务列表已刷新，共 ${remoteTasks.length} 个任务`);
      } finally {
        taskRefreshRevision += 1;
      }
    } else if (command.type === "checkPrerequisites") {
      status = "正在检测本机环境";
      await publish();
      prerequisites = checkPrerequisites();
      prerequisitesCheckedAt = Date.now();
      const checkedAt = new Date().toLocaleTimeString("zh-CN", { hour12: false });
      status = `本机环境已重新检测（${checkedAt}）`;
      log(`本机环境检测完成：${prerequisiteSummary(prerequisites)}`);
      if (token) await syncMcp(config, prerequisites).catch((error) => log(`MCP 配置写入失败：${error.message}`));
    } else if (command.type === "refreshMcp") {
      if (!token) throw new Error("请先登录并授权账号");
      status = "正在写入共序 MCP 配置";
      await publish();
      await syncMcp(config, prerequisites, { force: true });
      status = "共序 MCP 配置已更新（新开的 Agent 会话生效）";
    } else if (command.type === "resetMcp") {
      if (!token) throw new Error("请先登录并授权账号");
      status = "正在重置共序 MCP 令牌";
      await publish();
      await syncMcp(config, prerequisites, { force: true, reset: true });
      status = "共序 MCP 令牌已重置并重写配置（旧令牌已失效，新开的 Agent 会话生效）";
    } else if (command.type === "installPrerequisite") {
      const name = String(payload.name || "");
      if (name === "git") {
        const winget = spawnSync("winget.exe", ["--version"], { encoding: "utf8", windowsHide: true, timeout: 10000 });
        if (winget.status === 0) {
          spawn("winget.exe", ["install", "--id", "Git.Git", "-e", "--accept-package-agreements", "--accept-source-agreements"],
            { detached: true, stdio: "ignore", windowsHide: false }).unref();
          status = "Git 安装程序已启动，完成后请重新检测";
        } else {
          spawn("explorer.exe", ["https://git-scm.com/download/win"], { detached: true, stdio: "ignore" }).unref();
          status = "已打开 Git 官方下载页面";
        }
      } else if (AGENTS[name]) {
        spawn("explorer.exe", [AGENTS[name].downloadUrl], { detached: true, stdio: "ignore" }).unref();
        status = `已打开 ${agentLabel(name)} 官方页面，安装后请重新检测`;
      } else {
        throw new Error("未知的安装项");
      }
    } else if (command.type === "bind") {
      prerequisites = checkPrerequisites();
      prerequisitesCheckedAt = Date.now();
      if (!prerequisites.gitInstalled) throw new Error("未检测到 Git，请先安装 Git");
      if (!prerequisites.anyAgentInstalled) throw new Error("未检测到 Cursor / Codex / Claude Code，请至少安装一个");
      const root = path.resolve(String(payload.root || "").replace(/^\"|\"$/g, ""));
      if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error("本地目录不存在");
      const top = path.resolve(git(root, ["rev-parse", "--show-toplevel"]).trim());
      if (top.toLowerCase() !== root.toLowerCase()) throw new Error("请选择 Git 仓库根目录");
      const row = remoteProjects.find((item) => item.id === payload.projectId);
      if (!row) throw new Error("项目不存在或账号已失去权限");
      config.projects[row.id] = { root, name: row.name, policy: "unrestricted", allowGitPush: !!payload.allowGitPush };
      await writeConfig(config);
      await request(config, `/api/connector/projects/${row.id}`, { method: "PUT", body: {
        allowGitPush: !!payload.allowGitPush,
      }});
      await refreshProjects();
      status = `${row.name} 已开启连接`;
      log(`${row.name} 已开启连接：${root}`);
    } else if (command.type === "unbind") {
      await request(config, `/api/connector/projects/${payload.projectId}`, { method: "DELETE" });
      delete config.projects[payload.projectId];
      await writeConfig(config);
      await refreshProjects();
      status = "项目连接已关闭";
    } else if (command.type === "updateProject") {
      const row = remoteProjects.find((item) => item.id === payload.projectId);
      const local = config.projects[payload.projectId];
      if (!row || !local) throw new Error("项目尚未开启连接");
      local.allowGitPush = !!payload.allowGitPush;
      await request(config, `/api/connector/projects/${payload.projectId}`, { method: "PUT", body: {
        allowGitPush: local.allowGitPush,
      }});
      await writeConfig(config);
      await refreshProjects();
      status = `${row.name} 的 Git 推送权限已更新`;
    } else if (command.type === "autoStart") {
      setAutoStart(!!payload.enabled);
      autoStart = !!payload.enabled;
      status = payload.enabled ? "已开启开机自动启动" : "已关闭开机自动启动";
    } else if (command.type === "startTask") {
      const task = await startLocalTask({ taskId: String(payload.taskId || ""), agentKind: payload.agentKind, retry: !!payload.retry });
      await refreshTasks().catch(() => {});
      status = `本机 Agent 会话进行中：${task.project_name}`;
    } else if (command.type === "finishTask") {
      await finishLocalTask(String(payload.taskId || ""), payload.summary);
      await refreshTasks().catch(() => {});
      status = "任务已完成并通知到迭代群聊";
    } else if (command.type === "failTask") {
      await failLocalTask(String(payload.taskId || ""), payload.reason);
      await refreshTasks().catch(() => {});
      status = "任务已标记失败";
    } else if (command.type === "taskAction") {
      const action = String(payload.action || "");
      if (!["abandon", "retry", "notify"].includes(action)) throw new Error("不支持的任务操作");
      await request(config, `/api/connector/tasks/${payload.taskId}/control`, { body: { action } });
      if (action === "retry") await dropLocalTask(payload.taskId);
      await refreshTasks();
      status = "任务状态已更新";
    } else if (command.type === "quit") {
      quitting = true;
    }
  };

  await fsp.mkdir(appDir, { recursive: true });
  const guiPath = path.join(appDir, `gui-${VERSION}.ps1`);
  const iconPath = path.join(appDir, "cothread.ico");
  await fsp.writeFile(guiPath, Buffer.from(GUI_SCRIPT_BASE64, "base64"));
  await fsp.writeFile(iconPath, Buffer.from(CONNECTOR_ICON_BASE64, "base64"));
  await fsp.rm(commandPath, { force: true });
  await publish();
  const gui = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Sta", "-File", guiPath,
    "-StatePath", statePath, "-CommandPath", commandPath, "-IconPath", iconPath, "-ParentPid", String(process.pid)],
  { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  gui.stderr.on("data", (chunk) => log(`界面错误：${chunk.toString().trim()}`));
  gui.once("error", (error) => {
    if (!quitting) { status = "界面启动失败"; showFatalError(error); quitting = true; }
  });
  gui.once("exit", (code) => {
    if (!quitting) { status = "界面意外关闭"; log(`界面进程意外退出（代码 ${code ?? "未知"}）`); quitting = true; }
  });

  const commandTimer = setInterval(async () => {
    if (commandBusy) return;
    commandBusy = true;
    try {
      const raw = await fsp.readFile(commandPath, "utf8");
      await fsp.rm(commandPath, { force: true });
      await handleCommand(JSON.parse(raw));
    } catch (error) {
      if (error.code !== "ENOENT") { errorText = error.message; status = "需要处理"; log(error.message); }
    } finally { commandBusy = false; await publish().catch(() => {}); }
  }, 500);
  const stateTimer = setInterval(() => void publish().catch(() => {}), 700);
  try {
    await Promise.all([refreshProjects(), refreshTasks()]).catch((error) => { errorText = error.message; });
    status = token ? "连接器已就绪" : "请登录并授权账号";
    log(`本机环境：${prerequisiteSummary(prerequisites)}`);
    // 连接器重启后：上次仍在 running 的本机记录说明窗口句柄已丢失，一律按“会话已关闭”续租。
    for (const entry of Object.values(taskStore)) {
      if (entry.state === "running") { entry.state = "paused"; entry.pausedAt = new Date().toISOString(); }
      entry.pausedHeartbeatAt = 0;
    }
    await saveTaskStore();
    await publish();
    while (!quitting) {
      if (Date.now() - prerequisitesCheckedAt > 60000) {
        prerequisites = checkPrerequisites();
        prerequisitesCheckedAt = Date.now();
      }
      token = await loadToken();
      if (token && environmentReady()) {
        try {
          await refreshTasks();
          errorText = "";
        } catch (error) {
          errorText = error.status === 401 ? "账号授权已失效，请重新授权" : error.message;
        }
        if (!errorText) {
          for (const entry of Object.values(taskStore)) {
            if (entry.state === "paused" && activeSession?.taskId !== entry.taskId && Date.now() - (entry.pausedHeartbeatAt || 0) >= 5 * 60000)
              await renewPaused(entry);
          }
          await syncMcp(config, prerequisites).catch((error) => log(`MCP 配置检查失败：${error.message}`));
        }
      }
      await sleep(3000);
    }
  } finally {
    clearInterval(commandTimer);
    clearInterval(stateTimer);
    // 退出连接器不关闭开发人员的 Agent 窗口；任务记录保留，下次启动按 paused 续租。
    if (activeSession) {
      const entry = taskStore[activeSession.taskId];
      if (entry) { entry.state = "paused"; entry.pausedAt = new Date().toISOString(); await saveTaskStore().catch(() => {}); }
    }
    try { if (gui.pid && !gui.killed) gui.kill(); } catch {}
    await lock.close().catch(() => {});
    await fsp.rm(lockPath, { force: true }).catch(() => {});
  }
}

async function main() {
  const args = process.argv.slice(1);
  if (args.includes("--version")) { stdout.write(`${VERSION}\n`); return; }
  if (args.includes("--console") || args.includes("--once") || args.includes("--configure")) return consoleMain(args);
  return guiMain();
}

module.exports = {
  AGENTS, agentLaunchArgs, checkPrerequisites, createAuthorizationCallback, instanceLockIsActive, launchPrompt,
  mergeCodexMcpConfig, mergeCursorMcpConfig, parseCodexSessionId, parseCursorChatId, parseInstanceLock, protectToken,
  taskCard, taskPrompt, unprotectToken, validatePolicy, windowsVersionLabel,
};
if (require.main === module || require("node:sea").isSea()) main().catch((error) => { showFatalError(error); process.exitCode = 1; });
