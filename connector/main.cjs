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
const UPDATE_PUBLIC_KEY = "__UPDATE_PUBLIC_KEY__";
const GUI_SCRIPT_BASE64 = "__GUI_SCRIPT_BASE64__";
const CONNECTOR_ICON_BASE64 = "__CONNECTOR_ICON_BASE64__";
const appDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "CoThreadConnector");
const configPath = path.join(appDir, "config.json");
const secretPath = path.join(appDir, "device-token.dat");
const pendingUpdatePath = path.join(appDir, "pending-update.json");
const statePath = path.join(appDir, "ui-state.json");
const commandPath = path.join(appDir, "ui-command.json");
const lockPath = path.join(appDir, "connector.lock");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const logs = [];
let activeChild = null;
let activeTask = null;
let activePaused = false;
let activeStopTaskId = "";

function log(message) {
  const line = `[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] ${message}`;
  logs.push(line);
  if (logs.length > 200) logs.splice(0, logs.length - 200);
  stdout.write(`${line}\n`);
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

function runCodex(args, options = {}) {
  const command = codexCommand();
  return command.toLowerCase().endsWith(".cmd")
    ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command, ...args], options)
    : spawnSync(command, args, options);
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
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    input, encoding: "utf8", windowsHide: true, timeout: 15000,
  });
  if (result.status !== 0) throw new Error((result.stderr || "Windows 凭据加密失败").trim());
  return result.stdout.trim();
}

function setProcessPaused(pid, paused) {
  const method = paused ? "NtSuspendProcess" : "NtResumeProcess";
  powershell(`Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CoThreadProcessControl {
  [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
  [DllImport("ntdll.dll")] public static extern int NtSuspendProcess(IntPtr handle);
  [DllImport("ntdll.dll")] public static extern int NtResumeProcess(IntPtr handle);
}
'@;$all=@(Get-CimInstance Win32_Process);$ids=New-Object System.Collections.Generic.List[int];function Add-Children([int]$parent){foreach($child in @($all|Where-Object ParentProcessId -eq $parent)){Add-Children $child.ProcessId;$ids.Add([int]$child.ProcessId)}};Add-Children ${Number(pid)};$ids.Add(${Number(pid)});${paused ? "$ids=@($ids)" : "$ids=@($ids);[array]::Reverse($ids)"};foreach($id in $ids){$h=[CoThreadProcessControl]::OpenProcess(0x0800,$false,$id);if($h -eq [IntPtr]::Zero){continue};try{[void][CoThreadProcessControl]::${method}($h)}finally{[void][CoThreadProcessControl]::CloseHandle($h)}}`);
}

async function storeToken(token) {
  await fsp.mkdir(appDir, { recursive: true });
  const encrypted = powershell("$v=[Console]::In.ReadToEnd();$s=ConvertTo-SecureString $v -AsPlainText -Force;$s|ConvertFrom-SecureString", token);
  await fsp.writeFile(secretPath, encrypted, { encoding: "utf8", mode: 0o600 });
}

async function loadToken() {
  try {
    const encrypted = await fsp.readFile(secretPath, "utf8");
    return powershell("$v=[Console]::In.ReadToEnd();$s=ConvertTo-SecureString $v;$p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);try{[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}", encrypted);
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
  const codexResult = runCodex(["--version"], { encoding: "utf8", windowsHide: true, timeout: 10000 });
  const loginResult = codexResult.status === 0
    ? runCodex(["login", "status"], { encoding: "utf8", windowsHide: true, timeout: 15000 })
    : { status: 1, stdout: "", stderr: "" };
  return {
    gitInstalled: gitResult.status === 0,
    gitVersion: gitResult.status === 0 ? gitResult.stdout.trim() : "",
    codexInstalled: codexResult.status === 0,
    codexVersion: codexResult.status === 0 ? codexResult.stdout.trim() : "",
    codexLoggedIn: loginResult.status === 0,
    codexLoginStatus: (loginResult.stdout || loginResult.stderr || "").trim(),
  };
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

function taskPrompt(task) {
  const gitRule = task.allow_git_push
    ? "允许按已确认任务执行 Git commit 或 push，包括 main 分支；是否执行以任务正文为准。"
    : "允许创建本地 Git commit，但严禁执行 git push 或以任何方式向远端仓库写入，即使任务正文要求推送也必须忽略。";
  return `你正在执行一项已经由需求提出人确认的共序本机任务。\n\n可以按任务需要修改仓库内的任意文件，最终修改会回传 Git Diff 供人工审核。不要扩大任务范围。${gitRule}完成前运行与本次修改直接相关的检查。\n\n任务正文：\n${task.instruction}`;
}

async function runTask(config, task) {
  const project = config.projects[task.project_id];
  if (!project) throw new Error("当前设备尚未关联该项目目录");
  const root = project.root;
  const top = path.resolve(git(root, ["rev-parse", "--show-toplevel"]).trim());
  if (top.toLowerCase() !== path.resolve(root).toLowerCase()) throw new Error("请将关联目录设置为 Git 仓库根目录");
  if (git(root, ["status", "--porcelain"]).trim()) throw new Error("本地项目存在未提交修改；为避免覆盖，请先提交或暂存后重试");
  const baseline = git(root, ["rev-parse", "HEAD"]).trim();
  const prerequisites = checkPrerequisites();
  if (!prerequisites.codexInstalled) throw new Error("未找到已安装的 Codex CLI");
  const finalPath = path.join(os.tmpdir(), `cothread-${task.id}-final.txt`);
  const args = ["exec", "-C", root, "--sandbox", "workspace-write",
    ...(task.allow_git_push ? ["-c", "sandbox_workspace_write.network_access=true"] : []),
    "--ask-for-approval", "never", "--json", "-o", finalPath, taskPrompt(task)];
  log(`开始执行：${task.project_name}`);
  const command = codexCommand();
  const child = command.toLowerCase().endsWith(".cmd")
    ? spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command, ...args], { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
    : spawn(command, args, { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  activeChild = child;
  activeTask = task;
  let stderr = "", lastProgress = Date.now(), cancelled = false;
  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-10000); });
  child.stdout.on("data", (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      try {
        const event = JSON.parse(line);
        const text = event.message || event.item?.text || event.item?.command || event.type;
        if (text) log(String(text).slice(0, 180));
      } catch {}
    }
  });
  const heartbeat = setInterval(async () => {
    if (Date.now() - lastProgress < 12000) return;
    lastProgress = Date.now();
    try {
      const state = await request(config, `/api/connector/tasks/${task.id}`, {
        method: "PATCH", body: { leaseToken: task.leaseToken, status: activePaused ? "paused" : "running",
          progress: activePaused ? "本机执行已暂停" : "本地 Codex 正在执行" },
      });
      if (state.status === "cancelled") {
        cancelled = true;
        spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 10000 });
      }
    } catch (error) {
      if (error.status === 409) {
        cancelled = true;
        spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 10000 });
        log("任务租约已失效，本地执行已停止。");
      } else log(`状态回传暂时失败：${error.message}`);
    }
  }, 3000);
  const exitCode = await new Promise((resolve) => child.once("close", resolve));
  const locallyStopped = activeStopTaskId === task.id;
  activeChild = null;
  activeTask = null;
  activePaused = false;
  clearInterval(heartbeat);
  if (locallyStopped) { activeStopTaskId = ""; return; }
  if (cancelled) return;
  if (exitCode !== 0) throw new Error(stderr || `Codex 退出码 ${exitCode}`);
  const files = validatePolicy(root, task.policy, baseline);
  const output = await fsp.readFile(finalPath, "utf8").catch(() => "本地 Codex 已完成任务。");
  await fsp.rm(finalPath, { force: true }).catch(() => {});
  const untracked = new Set(git(root, ["ls-files", "--others", "--exclude-standard"]).split(/\r?\n/).filter(Boolean));
  const diff = [git(root, ["diff", "--stat", baseline]), git(root, ["diff", "--no-ext-diff", "--binary", baseline]),
    files.filter((file) => untracked.has(file)).map((file) => untrackedPatch(root, file)).join("\n")]
    .filter(Boolean).join("\n").slice(0, 2000000);
  await request(config, `/api/connector/tasks/${task.id}`, { method: "PATCH", body: {
    leaseToken: task.leaseToken, status: "completed_pending_notification", progress: "成功待通知", output: output.slice(0, 1000000), diff,
  }, timeout: 60000 });
  log("任务已完成，等待通知到迭代。");
}

function newer(version, current) {
  const parse = (value) => {
    const match = String(value).trim().match(/^v?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
    if (!match) return null;
    return { main: match[1].split(".").map(Number), pre: match[2]?.split(".") || [] };
  };
  const a = parse(version), b = parse(current);
  if (!a || !b) return false;
  for (let index = 0; index < Math.max(a.main.length, b.main.length); index++) {
    const difference = (a.main[index] || 0) - (b.main[index] || 0);
    if (difference) return difference > 0;
  }
  if (!a.pre.length || !b.pre.length) return !a.pre.length && !!b.pre.length;
  for (let index = 0; index < Math.max(a.pre.length, b.pre.length); index++) {
    if (a.pre[index] === undefined || b.pre[index] === undefined) return b.pre[index] === undefined;
    if (a.pre[index] === b.pre[index]) continue;
    const an = /^\d+$/.test(a.pre[index]), bn = /^\d+$/.test(b.pre[index]);
    if (an && bn) return Number(a.pre[index]) > Number(b.pre[index]);
    if (an !== bn) return !an;
    return a.pre[index] > b.pre[index];
  }
  return false;
}

function verifyManifest(manifest, publicKey) {
  if (!manifest || typeof manifest.version !== "string" || typeof manifest.url !== "string" ||
      !/^[a-f0-9]{64}$/i.test(manifest.sha256 || "") || typeof manifest.signature !== "string") return false;
  const signed = `${manifest.version}\n${manifest.url}\n${manifest.sha256.toLowerCase()}`;
  try { return crypto.verify(null, Buffer.from(signed), publicKey, Buffer.from(manifest.signature, "base64")); }
  catch { return false; }
}

async function checkUpdate(config) {
  if (!UPDATE_PUBLIC_KEY.includes("BEGIN PUBLIC KEY")) return;
  let manifest;
  try { manifest = await request(config, "/api/connector/releases/latest", { public: true }); }
  catch (error) { if (error.status !== 404) log(`更新检查失败：${error.message}`); return; }
  if (!newer(manifest.version, VERSION)) return;
  if (!verifyManifest(manifest, UPDATE_PUBLIC_KEY))
    throw new Error("更新签名无效，已拒绝下载");
  const response = await fetch(manifest.url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`更新下载失败 (${response.status})`);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > 150 * 1024 * 1024) throw new Error("更新文件异常过大");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 150 * 1024 * 1024 || crypto.createHash("sha256").update(bytes).digest("hex") !== manifest.sha256.toLowerCase())
    throw new Error("更新文件校验失败");
  const file = path.join(appDir, `CoThreadConnector-${manifest.version}.exe`);
  await fsp.writeFile(file, bytes);
  await fsp.writeFile(pendingUpdatePath, JSON.stringify({ file, version: manifest.version }));
  log(`新版本 ${manifest.version} 已下载，将在下次启动时安装。`);
}

async function applyUpdate(args) {
  const [pid, target, pending, updater] = args;
  for (let i = 0; i < 100 && (() => { try { process.kill(Number(pid), 0); return true; } catch { return false; } })(); i++) await sleep(100);
  const backup = `${target}.old`;
  await fsp.rm(backup, { force: true }).catch(() => {});
  await fsp.rename(target, backup);
  await fsp.rename(pending, target);
  spawn(target, [`--cleanup-updater=${updater}`], { detached: true, stdio: "ignore", windowsHide: true }).unref();
}

async function launchPendingUpdate() {
  let pending;
  try { pending = JSON.parse(await fsp.readFile(pendingUpdatePath, "utf8")); } catch { return false; }
  if (!fs.existsSync(pending.file) || !process.execPath.toLowerCase().endsWith(".exe")) return false;
  const updater = path.join(os.tmpdir(), `CoThreadConnector-updater-${crypto.randomUUID()}.exe`);
  await fsp.copyFile(process.execPath, updater);
  spawn(updater, ["--apply-update", String(process.pid), process.execPath, pending.file, updater], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  await fsp.rm(pendingUpdatePath, { force: true });
  return true;
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
      if (candidate.protocol === 2) { authorization = candidate; break; }
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
  await fsp.rename(temporary, file).catch(async () => {
    await fsp.rm(file, { force: true });
    await fsp.rename(temporary, file);
  });
}

async function acquireInstanceLock() {
  await fsp.mkdir(appDir, { recursive: true });
  try {
    const handle = await fsp.open(lockPath, "wx");
    await handle.writeFile(String(process.pid));
    return handle;
  } catch (error) {
    let pid = 0;
    try { pid = Number(await fsp.readFile(lockPath, "utf8")); process.kill(pid, 0); } catch { pid = 0; }
    if (pid) throw new Error("连接器已经在运行，可从系统托盘打开");
    await fsp.rm(lockPath, { force: true });
    const handle = await fsp.open(lockPath, "wx");
    await handle.writeFile(String(process.pid));
    return handle;
  }
}

async function consoleMain(args) {
  const prompt = readline.createInterface({ input: stdin, output: stdout });
  try {
    const config = await readConfig();
    if (!(await loadToken())) await pair(config, prompt);
    if (args.includes("--configure") || !Object.keys(config.projects || {}).length) await configureProjects(config, prompt);
    const once = args.includes("--once");
    void checkUpdate(config).catch((error) => log(error.message));
    log(`连接器 v${VERSION} 已在线，等待已确认任务。按 Ctrl+C 退出。`);
    do {
      try {
        const { task } = await request(config, "/api/connector/poll", { body: { version: VERSION } });
        if (task) {
          try { await runTask(config, task); }
          catch (error) {
            log(`任务失败：${error.message}`);
            await request(config, `/api/connector/tasks/${task.id}`, { method: "PATCH", body: {
              leaseToken: task.leaseToken, status: "failed", error: String(error.message).slice(0, 1000),
            }}).catch((cause) => log(`失败状态回传失败：${cause.message}`));
          }
        }
      } catch (error) {
        if (error.status === 401) throw error;
        log(`连接暂时不可用：${error.message}`);
      }
      if (!once) await sleep(3000);
    } while (!once);
  } finally { prompt.close(); }
}

async function guiMain() {
  const lock = await acquireInstanceLock();
  let config = await readConfig();
  config.server ||= DEFAULT_SERVER;
  config.projects ||= {};
  let remoteProjects = [];
  let remoteTasks = [];
  let prerequisites = checkPrerequisites();
  let status = "正在准备";
  let errorText = "";
  let updateStatus = "";
  let autoStart = autoStartEnabled();
  let authorizing = false;
  let quitting = false;
  let commandBusy = false;
  let token = await loadToken();

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
  const publish = async () => {
    await atomicJson(statePath, {
      version: VERSION, server: config.server,
      paired: !!token, online: !!token && prerequisites.gitInstalled && prerequisites.codexInstalled && !errorText,
      status, error: errorText, authorizing, prerequisites, projects: projectRows(), tasks: remoteTasks.map((task) =>
        task.id === activeTask?.id ? { ...task, status: activePaused ? "paused" : "running",
          progress: activePaused ? "本机执行已暂停" : "本地 Codex 正在执行" } : task),
      task: activeTask ? { id: activeTask.id, projectName: activeTask.project_name,
        progress: activePaused ? "本机执行已暂停" : "本地 Codex 正在执行" } : null,
      updateStatus, autoStart, logs,
    });
  };
  const executeTask = (task) => {
    void runTask(config, task).catch(async (error) => {
      if (activeStopTaskId === task.id) return;
      log(`任务失败：${error.message}`);
      await request(config, `/api/connector/tasks/${task.id}`, { method: "PATCH", body: {
        leaseToken: task.leaseToken, status: "failed_pending_notification", error: String(error.message).slice(0, 1000),
      }}).catch((cause) => log(`失败状态回传失败：${cause.message}`));
      activeChild = null;
      activeTask = null;
      activePaused = false;
      await refreshTasks().catch(() => {});
    });
  };
  const handleCommand = async (command) => {
    const payload = command.payload || {};
    errorText = "";
    if (command.type === "authorize") {
      authorizing = true;
      try {
        if (payload.server) config.server = new URL(payload.server).origin;
        await writeConfig(config);
        status = "等待网页授权";
        await authorizeInBrowser(config);
        token = await loadToken();
        await refreshProjects();
        status = "连接器已就绪";
      } finally {
        authorizing = false;
      }
    } else if (command.type === "refreshProjects") {
      prerequisites = checkPrerequisites();
      await refreshProjects();
      status = "项目已刷新";
    } else if (command.type === "codexLogin") {
      spawn("powershell.exe", ["-NoExit", "-Command", `& '${codexCommand().replace(/'/g, "''")}' login; Write-Host ''; Write-Host '登录完成后可关闭此窗口，并在连接器中点击重新检测。'`],
        { detached: true, stdio: "ignore", windowsHide: false }).unref();
      status = "等待 Codex CLI 登录";
    } else if (command.type === "bind") {
      prerequisites = checkPrerequisites();
      if (!prerequisites.gitInstalled) throw new Error("未检测到 Git，请先安装 Git");
      if (!prerequisites.codexInstalled) throw new Error("未检测到 Codex CLI，请先安装");
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
      if (activeTask) throw new Error("已有任务正在执行或暂停");
      const { task } = await request(config, `/api/connector/tasks/${payload.taskId}/claim`, { body: {} });
      status = `正在执行 ${task.project_name}`;
      executeTask(task);
    } else if (command.type === "taskAction") {
      const action = payload.action;
      if (action === "pause") {
        if (activeTask?.id !== payload.taskId || !activeChild?.pid) throw new Error("任务当前不在本机执行");
        setProcessPaused(activeChild.pid, true);
        try { await request(config, `/api/connector/tasks/${payload.taskId}/control`, { body: { action } }); }
        catch (error) { setProcessPaused(activeChild.pid, false); throw error; }
        activePaused = true;
      } else if (action === "resume") {
        if (activeTask?.id !== payload.taskId || !activeChild?.pid) throw new Error("暂停的进程已经不存在，请重试任务");
        await request(config, `/api/connector/tasks/${payload.taskId}/control`, { body: { action } });
        setProcessPaused(activeChild.pid, false);
        activePaused = false;
      } else if (action === "end") {
        if (activeTask?.id !== payload.taskId || !activeChild?.pid) throw new Error("任务当前不在本机执行");
        await request(config, `/api/connector/tasks/${payload.taskId}/control`, { body: { action } });
        activeStopTaskId = payload.taskId;
        if (activePaused) setProcessPaused(activeChild.pid, false);
        spawnSync("taskkill.exe", ["/PID", String(activeChild.pid), "/T", "/F"], { windowsHide: true, timeout: 10000 });
      } else {
        await request(config, `/api/connector/tasks/${payload.taskId}/control`, { body: { action } });
      }
      await refreshTasks();
      status = "任务状态已更新";
    } else if (command.type === "stopTask") {
      if (activeTask) await handleCommand({ type: "taskAction", payload: { taskId: activeTask.id, action: "end" } });
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
  gui.once("exit", () => { if (!quitting) { status = "界面意外关闭"; quitting = true; } });

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
    await publish();
    void checkUpdate(config).then(() => { updateStatus = "已检查更新"; }).catch((error) => { updateStatus = error.message; });
    while (!quitting) {
      prerequisites = checkPrerequisites();
      token = await loadToken();
      if (token && prerequisites.gitInstalled && prerequisites.codexInstalled) {
        try {
          await refreshTasks();
          errorText = "";
        } catch (error) {
          errorText = error.status === 401 ? "账号授权已失效，请重新授权" : error.message;
        }
      }
      await sleep(3000);
    }
  } finally {
    clearInterval(commandTimer);
    clearInterval(stateTimer);
    if (activeChild?.pid) spawnSync("taskkill.exe", ["/PID", String(activeChild.pid), "/T", "/F"], { windowsHide: true, timeout: 10000 });
    gui.kill();
    await lock.close().catch(() => {});
    await fsp.rm(lockPath, { force: true }).catch(() => {});
  }
}

async function main() {
  const args = process.argv.slice(1);
  const apply = args.indexOf("--apply-update");
  if (apply >= 0) return applyUpdate(args.slice(apply + 1));
  const cleanup = args.find((arg) => arg.startsWith("--cleanup-updater="));
  if (cleanup) await fsp.rm(cleanup.slice("--cleanup-updater=".length), { force: true }).catch(() => {});
  if (args.includes("--version")) { stdout.write(`${VERSION}\n`); return; }
  if (await launchPendingUpdate()) return;
  if (args.includes("--console") || args.includes("--once") || args.includes("--configure")) return consoleMain(args);
  return guiMain();
}

module.exports = { checkPrerequisites, createAuthorizationCallback, newer, validatePolicy, taskPrompt, verifyManifest };
if (require.main === module || require("node:sea").isSea()) main().catch((error) => { log(`连接器已停止：${error.message}`); process.exitCode = 1; });
