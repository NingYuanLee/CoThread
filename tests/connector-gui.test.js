import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const guiPath = new URL("../connector/gui.ps1", import.meta.url);
const mainPath = new URL("../connector/main.cjs", import.meta.url);
const buildPath = new URL("../scripts/build-connector.mjs", import.meta.url);

test("connector GUI uses project and task tabs with a persistent log pane", async () => {
  const gui = await readFile(guiPath, "utf8");

  assert.deepEqual(
    [...gui.matchAll(/<TabItem Header="([^"]+)"/g)].map((match) => match[1]),
    ["项目", "任务"],
  );
  assert.doesNotMatch(gui, /<TabItem Header="记录"/);
  assert.doesNotMatch(gui, /<ScrollViewer\b/);
  assert.match(gui, /x:Name="ProjectGrid"[^>]*Grid\.Row="1"/);
  assert.match(gui, /x:Name="TaskGrid"[^>]*Grid\.Row="1"/);
  assert.match(gui, /x:Name="BoundProjectsOnlyCheck"[^>]*IsChecked="True"/);
  assert.match(gui, /x:Name="OpenTasksOnlyCheck"[^>]*IsChecked="True"/);
  assert.match(gui, /function Show-FilteredProjects/);
  assert.match(gui, /function Show-FilteredTasks/);
  assert.match(gui, /x:Name="LogText"/);
  assert.match(gui, /<GridSplitter\b/);
  assert.match(gui, /ScrollToVerticalOffset/);
  assert.doesNotMatch(gui, /ScrollToEnd\(\)/);
});

test("connector task target stays on one row and opens a detail dialog", async () => {
  const gui = await readFile(guiPath, "utf8");

  assert.match(gui, /<Setter Property="RowHeight" Value="30"\/>/);
  assert.match(gui, /x:Name="TaskTargetButton"/);
  assert.match(gui, /TextWrapping="NoWrap"/);
  assert.match(gui, /TextTrimming="CharacterEllipsis"/);
  assert.match(gui, /if \(\$button\.Name -eq 'TaskTargetButton'\)/);
  assert.match(gui, /\$detail\.ShowDialog\(\)/);
});

test("connector no longer exposes or checks Codex login", async () => {
  const [gui, main] = await Promise.all([
    readFile(guiPath, "utf8"),
    readFile(mainPath, "utf8"),
  ]);

  assert.doesNotMatch(gui, /CodexLogin|登录 Codex/);
  assert.doesNotMatch(main, /codexLogin|\["login", "status"\]/);
});

test("closing the connector window hides it without ending the tray process", async () => {
  const gui = await readFile(guiPath, "utf8");

  assert.match(gui, /\$eventArgs\.Cancel=\$true; \$window\.Hide\(\)/);
  assert.doesNotMatch(gui, /\$window\.ShowDialog\(\)/);
  assert.match(gui, /\$window\.Show\(\); \[System\.Windows\.Threading\.Dispatcher\]::Run\(\)/);
  assert.match(gui, /\$window\.Dispatcher\.InvokeShutdown\(\)/);
});

test("task statuses and controls use distinct semantic colors", async () => {
  const gui = await readFile(guiPath, "utf8");

  assert.match(gui, /Background="\{Binding statusBackground\}"/);
  assert.match(gui, /statusForeground=\$statusColors\[1\]/);
  assert.match(gui, /StartTaskButton[^>]+Background="#527A55"/);
  assert.match(gui, /ContinueTaskButton[^>]+Background="#527A55"/);
  assert.match(gui, /FinishTaskButton[^>]+Background="#EAF5F2"/);
  assert.match(gui, /FailTaskButton[^>]+Background="#A85B50"/);
  assert.match(gui, /RetryTaskButton[^>]+Background="#EEF4F8"/);
});

test("task controls follow the interactive session lifecycle instead of process pause/end", async () => {
  const [gui, main] = await Promise.all([readFile(guiPath, "utf8"), readFile(mainPath, "utf8")]);

  for (const name of ["StartTaskButton", "ContinueTaskButton", "RetryTaskButton", "FinishTaskButton", "FailTaskButton", "AbandonTaskButton"])
    assert.match(gui, new RegExp(`x:Name="${name}"`));
  assert.doesNotMatch(gui, /PauseTaskButton|EndTaskButton|ResumeTaskButton/);
  assert.match(gui, /Content="开始"/);
  assert.match(gui, /Content="完成并通知"/);
  assert.match(gui, /Content="失败并通知"/);
  assert.match(gui, /Content="放弃并通知"/);
  assert.match(gui, /continueVisibility=\$\(if\(\$status -eq 'paused'/);
  assert.match(gui, /finishVisibility=\$\(if\(\$status -in @\('running','paused'\) -and \[bool\]\$_\.hasLocalRecord\)/);
  assert.match(gui, /paused='会话已关闭'/);
  assert.match(gui, /function Select-AgentKind/);
  assert.match(gui, /function Show-TextDialog/);
  assert.match(gui, /Send-Command 'startTask' @\{ taskId=\$row\.id; agentKind=\$kind \}/);
  assert.match(gui, /Send-Command 'startTask' @\{ taskId=\$row\.id; agentKind=\$kind; retry=\$true \}/);
  assert.match(gui, /Send-Command 'finishTask' @\{ taskId=\$row\.id; summary=\[string\]\$result\.Text; applyToMain=\[bool\]\$result\.Checked \}/);
  assert.match(gui, /同时应用到主仓库/);
  assert.match(gui, /x:Name="ApplyTaskButton"/);
  assert.match(gui, /x:Name="DiscardWorktreeButton"/);
  assert.match(gui, /Send-Command 'applyTask'/);
  assert.match(gui, /Send-Command 'discardWorktree'/);
  assert.match(gui, /Send-Command 'failTask' @\{ taskId=\$row\.id; reason=\$reason \}/);

  assert.match(main, /command\.type === "startTask"/);
  assert.match(main, /已恢复「\$\{row\.name\}」的项目连接/);
  assert.match(main, /开始前先把服务端项目绑定写上/);
  assert.match(main, /command\.type === "finishTask"/);
  assert.match(main, /command\.type === "applyTask"/);
  assert.match(main, /command\.type === "discardWorktree"/);
  assert.match(main, /command\.type === "failTask"/);
  assert.match(main, /status: "completed", output: output\.slice\(0, 1000000\), diff/);
  assert.match(main, /"start", `CoThread 任务 - \$\{agentLabel\(kind\)\}`, "\/wait"/);
  assert.match(main, /entry\.state = "paused";/);
  assert.match(main, /const PAUSED_PROGRESS = "本机会话已关闭，可继续或结案"/);
  assert.match(main, /Date\.now\(\) - \(entry\.pausedHeartbeatAt \|\| 0\) >= 5 \* 60000/);
  assert.match(main, /const tasksPath = path\.join\(appDir, "tasks\.json"\)/);
  assert.match(main, /\["worktree", "add", "-b", branch, dest, "HEAD"\]/);
  assert.doesNotMatch(main, /status", "--porcelain"|未提交修改/);
  assert.doesNotMatch(main, /codexExecArgs|completed_pending_notification|NtSuspendProcess/);
});

test("connector detects three agents and writes their MCP configuration", async () => {
  const [gui, main] = await Promise.all([readFile(guiPath, "utf8"), readFile(mainPath, "utf8")]);

  for (const name of ["CursorStatusText", "CodexStatusText", "ClaudeStatusText", "CursorMcpText", "CodexMcpText", "ClaudeMcpText", "RefreshMcpButton", "ResetMcpButton"])
    assert.match(gui, new RegExp(`x:Name="${name}"`));
  assert.doesNotMatch(gui, /Text="共序 MCP"/);
  assert.match(gui, /x:Name="AgentPanel"/);
  assert.match(gui, /Text="本机 Agent"/);
  assert.match(gui, /开始任务时从已安装的 TUI 中选一个即可/);
  assert.match(gui, /Grid\.Row="1" Grid\.Column="1" Orientation="Horizontal"/);
  assert.match(gui, /function Set-AgentMcpText/);
  assert.match(gui, /MCP 已写入/);
  assert.match(gui, /Send-Command 'installPrerequisite' @\{ name='cursor' \}/);
  assert.match(gui, /Send-Command 'installPrerequisite' @\{ name='claude' \}/);
  assert.match(gui, /Send-Command 'refreshMcp'/);
  // 重置令牌会让旧令牌立即失效，必须先经 MessageBox 确认。
  assert.match(gui, /MessageBox\]::Show\("重置后本账号的旧 MCP 令牌立即失效[\s\S]*?'YesNo', 'Warning'\)\s*\n\s*if \(\$answer -eq 'Yes'\) \{ Send-Command 'resetMcp' \}/);
  assert.match(main, /"\/api\/connector\/mcp-credential\/reset"/);
  assert.match(main, /command\.type === "resetMcp"/);
  assert.match(gui, /\$ProjectPanel\.IsEnabled = \[bool\]\(\$state\.paired -and \$state\.prerequisites\.gitInstalled\)/);
  assert.doesNotMatch(gui, /gitInstalled -and \$anyAgent/);

  assert.match(main, /cursor-agent", "agent\.ps1"/);
  assert.match(main, /const AGENT_KINDS = Object\.keys\(AGENTS\)/);
  assert.match(main, /anyAgentInstalled: installedAgents\.length > 0/);
  assert.match(main, /const environmentReady = \(\) => prerequisites\.gitInstalled;/);
  assert.match(main, /online: !!token && environmentReady\(\) && !errorText/);
  assert.match(main, /"\/api\/connector\/mcp-credential"/);
  assert.match(main, /remaining < 7 \* 86400000/);
  assert.match(main, /\.cursor", "mcp\.json"/);
  assert.match(main, /\["mcp", "enable", MCP_SERVER_NAME\]/);
  assert.match(main, /\.codex", "config\.toml"/);
  assert.match(main, /"setx\.exe", \[MCP_TOKEN_ENV, server\.token\]/);
  assert.match(main, /\["mcp", "add", "--transport", "http", "--scope", "user", MCP_SERVER_NAME, server\.url/);
  assert.doesNotMatch(main, /--approve-mcps/);
});

test("project connection state and action are visually distinct", async () => {
  const gui = await readFile(guiPath, "utf8");

  assert.match(gui, /Text="\{Binding connectionText\}"/);
  assert.match(gui, /connectionText=\$\(if\(\$bound\)\{'已连接'\}else\{'未连接'\}\)/);
  assert.match(gui, /actionText=\$\(if\(\$bound\)\{'关闭连接'\}else\{'开启连接'\}\)/);
  assert.match(gui, /actionBackground=\$\(if\(\$bound\)\{'#F8ECE9'\}else\{'#527A55'\}\)/);
  assert.match(gui, /ToggleProjectButton[^>]+Background="\{Binding actionBackground\}"/);
});

test("project folders support git repo and optional in-repo path", async () => {
  const gui = await readFile(guiPath, "utf8");

  assert.match(gui, /x:Name="ProjectRepoInput"/);
  assert.match(gui, /Text="\{Binding repo, Mode=TwoWay, UpdateSourceTrigger=PropertyChanged\}"/);
  assert.match(gui, /x:Name="ProjectPathInput"/);
  assert.match(gui, /Text="\{Binding projectPath, Mode=TwoWay, UpdateSourceTrigger=PropertyChanged\}"/);
  assert.match(gui, /x:Name="BrowseRepoButton"/);
  assert.match(gui, /x:Name="BrowsePathButton"/);
  assert.match(gui, /Send-Command 'bind' @\{ projectId=\$row\.id; repo=\$row\.repo; projectPath=\$row\.projectPath; allowGitPush=\[bool\]\$row\.allowGitPush \}/);
  assert.match(gui, /独立 Git worktree/);
  assert.match(gui, /New-Object Microsoft\.Win32\.OpenFileDialog/);
  assert.match(gui, /\$picker\.ValidateNames = \$false/);
  assert.match(gui, /\$picker\.ShowDialog\(\$window\)/);
  assert.doesNotMatch(gui, /System\.Windows\.Forms\.FolderBrowserDialog/);
  assert.doesNotMatch(gui, /BrowseProjectButton|ProjectRootInput/);
});

test("connector build pins a verified Windows-compatible runtime", async () => {
  const build = await readFile(buildPath, "utf8");

  assert.match(build, /compatibilityNodeVersion = "v22\.23\.2"/);
  assert.match(build, /compatibilityNodeSha256 = "[a-f0-9]{64}"/);
  assert.match(build, /https:\/\/nodejs\.org\/dist\/\$\{compatibilityNodeVersion\}\/win-x64\/node\.exe/);
  assert.match(build, /run\(nodeExecutable, \["--experimental-sea-config"/);
  assert.match(build, /copyFile\(nodeExecutable, exe\)/);
  assert.match(build, /for \(let attempt = 1; attempt <= 5; attempt\+\+\)/);
  assert.match(build, /async function emptyOutDir/);
  assert.match(build, /请先在托盘退出正在运行的 CoThread Connector/);
});

test("connector has no built-in application distribution path", async () => {
  const [gui, main] = await Promise.all([readFile(guiPath, "utf8"), readFile(mainPath, "utf8")]);

  assert.doesNotMatch(gui, /UpdateText/);
  assert.doesNotMatch(main, /connector\/releases|pending-update|checkUpdate|apply-update|verifyManifest/);
});

test("connector persists startup diagnostics and surfaces fatal errors", async () => {
  const main = await readFile(mainPath, "utf8");

  assert.match(main, /const logPath = path\.join\(appDir, "connector\.log"\)/);
  assert.match(main, /fs\.appendFileSync\(logPath/);
  assert.match(main, /function showFatalError\(error\)/);
  assert.match(main, /gui\.once\("error"/);
  assert.match(main, /gui\.once\("exit"/);
  assert.match(main, /if \(code === 0\) \{ quitting = true; return; \}/);
  assert.match(main, /writeFile\(guiPath, withUtf8Bom\(/);
  assert.match(main, /界面进程意外退出[\s\S]{0,200}showFatalError/);
  assert.match(main, /main\(\)\.catch\(\(error\) => \{ showFatalError\(error\)/);
});

test("missing prerequisites offer guided installation without requiring Node", async () => {
  const [gui, main] = await Promise.all([
    readFile(guiPath, "utf8"),
    readFile(mainPath, "utf8"),
  ]);

  assert.match(gui, /x:Name="InstallGitButton" Content="安装 Git CLI"/);
  assert.match(gui, /x:Name="InstallCodexButton" Content="安装 Codex TUI"/);
  assert.match(gui, /x:Name="InstallCursorButton" Content="安装 Cursor TUI"/);
  assert.match(gui, /x:Name="InstallClaudeButton" Content="安装 Claude Code TUI"/);
  assert.match(gui, /Text="Git CLI"/);
  assert.match(gui, /Text="本机环境"/);
  assert.match(gui, /Text="本机 Agent"/);
  assert.match(gui, /Text="Cursor TUI"/);
  assert.match(gui, /Text="Codex TUI"/);
  assert.match(gui, /Text="Claude Code TUI"/);
  assert.match(gui, /Send-Command 'installPrerequisite' @\{ name='git' \}/);
  assert.match(main, /winget\.exe.*Git\.Git/);
  assert.match(main, /https:\/\/git-scm\.com\/download\/win/);
  assert.match(main, /https:\/\/chatgpt\.com\/download\//);
  assert.match(main, /https:\/\/cursor\.com\/cli/);
});

test("manual environment checks and project refreshes produce records", async () => {
  const [gui, main] = await Promise.all([
    readFile(guiPath, "utf8"),
    readFile(mainPath, "utf8"),
  ]);

  assert.match(gui, /\$CheckButton\.Add_Click\(\{[\s\S]+Send-Command 'checkPrerequisites'[\s\S]+\}\)/);
  assert.match(gui, /\$CheckButton\.Content = '检测中\.\.\.'/);
  assert.match(main, /command\.type === "checkPrerequisites"/);
  assert.match(main, /status = `本机环境已重新检测（\$\{checkedAt\}）`/);
  assert.match(main, /本机环境检测完成：\$\{prerequisiteSummary\(prerequisites\)\}/);
  assert.match(main, /项目列表已刷新，共 \$\{remoteProjects\.length\} 个项目/);
});

test("idle connector skips unchanged UI reloads", async () => {
  const [gui, main] = await Promise.all([readFile(guiPath, "utf8"), readFile(mainPath, "utf8")]);

  assert.match(gui, /Get-Content[^\r\n]+-ErrorAction Stop \| ConvertFrom-Json -ErrorAction Stop/);
  assert.match(main, /fsp\.copyFile\(temporary, file\)/);
  assert.doesNotMatch(main, /fsp\.rm\(file, \{ force: true \}\)/);
  assert.match(main, /build >= 22000\) return `Windows 11/);
  assert.match(main, /if \(text === lastPublished\) return/);
  assert.match(main, /if \(publishState\) await publish\(\)/);
  assert.match(main, /if \(changed \|\| reset \|\| force\) await writeConfig\(config\)/);
  assert.match(main, /Date\.now\(\) - prerequisitesCheckedAt > 5 \* 60000/);
  assert.doesNotMatch(main, /command\.type === "refreshProjects"[\s\S]{0,280}prerequisites = checkPrerequisites\(\)/);
  assert.match(gui, /if \(\$stamp -eq \$script:stateStamp\) \{ return \}/);
  assert.match(gui, /function Set-ControlText/);
  assert.match(gui, /if \(\$view -eq \$script:projectViewSignature\) \{ return \}/);
  assert.match(gui, /if \(\$view -eq \$script:taskViewSignature\) \{ return \}/);
});

test("project and task refresh actions show progress and completion records", async () => {
  const [gui, main] = await Promise.all([readFile(guiPath, "utf8"), readFile(mainPath, "utf8")]);

  assert.match(gui, /x:Name="RefreshButton"[^>]+刷新项目/);
  assert.match(gui, /x:Name="RefreshTaskButton"[^>]+刷新任务/);
  assert.match(gui, /\$RefreshButton\.Content = '刷新中\.\.\.'/);
  assert.match(gui, /\$RefreshTaskButton\.Content = '刷新中\.\.\.'/);
  assert.match(main, /command\.type === "refreshTasks"/);
  assert.match(main, /status = "正在刷新项目"/);
  assert.match(main, /status = "正在刷新任务"/);
  assert.match(main, /任务列表已刷新，共 \$\{remoteTasks\.length\} 个任务/);
});

test("paired users can reopen browser authorization to switch accounts", async () => {
  const gui = await readFile(guiPath, "utf8");

  assert.match(gui, /x:Name="ReauthorizeButton" Content="切换账号"/);
  assert.match(gui, /\$ReauthorizeButton\.Add_Click/);
  assert.match(gui, /Set-ControlVisible \$ReauthorizeButton \(\[bool\]\$state\.paired\)/);
  assert.doesNotMatch(gui, /Text="CoThread 本地连接器"/);
  assert.match(gui, /x:Name="PairButton"[^>]*Content="网页登录并授权"/);
  assert.match(gui, /x:Name="ReauthorizeButton"[^>]*Content="切换账号"/);
  assert.match(gui, /x:Name="StatusText"[^>]*TextTrimming="CharacterEllipsis"/);
  assert.doesNotMatch(gui, /隐藏到托盘|退出连接器|HideButton|ExitButton/);
  assert.match(gui, /Grid\.Row="4"[\s\S]*x:Name="StatusDot"[\s\S]*x:Name="StatusText"/);
});

test("project and task grids use polished fixed-height rows", async () => {
  const gui = await readFile(guiPath, "utf8");

  assert.match(gui, /<Style TargetType="DataGridColumnHeader">/);
  assert.match(gui, /<Style TargetType="DataGridRow">/);
  assert.match(gui, /Property="IsMouseOver" Value="True"/);
  assert.match(gui, /Header="目标" Width="200"/);
  assert.match(gui, /HorizontalScrollBarVisibility" Value="Auto"/);
  assert.match(gui, /x:Name="MainTabs"/);
  assert.match(gui, /function Sync-RefreshButtons/);
});

test("taskbar detaches from powershell.exe with AppUserModelID and window icons", async () => {
  const gui = await readFile(guiPath, "utf8");

  assert.match(gui, /SetCurrentProcessExplicitAppUserModelID/);
  assert.match(gui, /BindProcess\('CoThread\.Connector'\)/);
  assert.match(gui, /SHGetPropertyStoreForWindow/);
  assert.match(gui, /\$window\.Icon = \[Windows\.Media\.Imaging\.BitmapFrame\]::Create/);
  assert.match(gui, /New-Object System\.Drawing\.Icon\(\$IconPath, 256, 256\)/);
  assert.match(gui, /BindWindow\(\$handle, \$bigWindowIcon\.Handle, \$smallWindowIcon\.Handle/);
  assert.match(gui, /\$IconPath \+ ',0'/);
});
