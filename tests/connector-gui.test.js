import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const guiPath = new URL("../connector/gui.ps1", import.meta.url);
const mainPath = new URL("../connector/main.cjs", import.meta.url);
const buildPath = new URL("../scripts/build-connector.mjs", import.meta.url);

test("connector GUI uses independent project, task, and log tabs", async () => {
  const gui = await readFile(guiPath, "utf8");

  assert.deepEqual(
    [...gui.matchAll(/<TabItem Header="([^"]+)"/g)].map((match) => match[1]),
    ["项目", "任务", "记录"],
  );
  assert.doesNotMatch(gui, /<ScrollViewer\b/);
  assert.match(gui, /x:Name="ProjectGrid"[^>]*Grid\.Row="1"/);
  assert.match(gui, /x:Name="TaskGrid"[^>]*Grid\.Row="1"/);
  assert.match(gui, /x:Name="LogText"[^>]*Grid\.Row="1"/);
});

test("connector task target stays on one row and opens a detail dialog", async () => {
  const gui = await readFile(guiPath, "utf8");

  assert.match(gui, /<Setter Property="RowHeight" Value="44"\/>/);
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
  assert.match(gui, /PauseTaskButton[^>]+Background="#FFF6DF"/);
  assert.match(gui, /EndTaskButton[^>]+Background="#A85B50"/);
  assert.match(gui, /RetryTaskButton[^>]+Background="#EEF4F8"/);
});

test("project connection state and action are visually distinct", async () => {
  const gui = await readFile(guiPath, "utf8");

  assert.match(gui, /Text="\{Binding connectionText\}"/);
  assert.match(gui, /connectionText=\$\(if\(\$bound\)\{'已连接'\}else\{'未连接'\}\)/);
  assert.match(gui, /actionText=\$\(if\(\$bound\)\{'关闭连接'\}else\{'开启连接'\}\)/);
  assert.match(gui, /actionBackground=\$\(if\(\$bound\)\{'#F8ECE9'\}else\{'#527A55'\}\)/);
  assert.match(gui, /ToggleProjectButton[^>]+Background="\{Binding actionBackground\}"/);
});

test("project folders support direct paths and Explorer search", async () => {
  const gui = await readFile(guiPath, "utf8");

  assert.match(gui, /x:Name="ProjectRootInput"/);
  assert.match(gui, /Text="\{Binding root, Mode=TwoWay, UpdateSourceTrigger=PropertyChanged\}"/);
  assert.match(gui, /New-Object Microsoft\.Win32\.OpenFileDialog/);
  assert.match(gui, /\$picker\.ValidateNames = \$false/);
  assert.match(gui, /\$picker\.ShowDialog\(\$window\)/);
  assert.doesNotMatch(gui, /System\.Windows\.Forms\.FolderBrowserDialog/);
});

test("connector build pins a verified Windows-compatible runtime", async () => {
  const build = await readFile(buildPath, "utf8");

  assert.match(build, /compatibilityNodeVersion = "v22\.23\.2"/);
  assert.match(build, /compatibilityNodeSha256 = "[a-f0-9]{64}"/);
  assert.match(build, /https:\/\/nodejs\.org\/dist\/\$\{compatibilityNodeVersion\}\/win-x64\/node\.exe/);
  assert.match(build, /run\(nodeExecutable, \["--experimental-sea-config"/);
  assert.match(build, /copyFile\(nodeExecutable, exe\)/);
  assert.match(build, /for \(let attempt = 1; attempt <= 5; attempt\+\+\)/);
});

test("connector persists startup diagnostics and surfaces fatal errors", async () => {
  const main = await readFile(mainPath, "utf8");

  assert.match(main, /const logPath = path\.join\(appDir, "connector\.log"\)/);
  assert.match(main, /fs\.appendFileSync\(logPath/);
  assert.match(main, /function showFatalError\(error\)/);
  assert.match(main, /gui\.once\("error"/);
  assert.match(main, /main\(\)\.catch\(\(error\) => \{ showFatalError\(error\)/);
});

test("missing prerequisites offer guided installation without requiring Node", async () => {
  const [gui, main] = await Promise.all([
    readFile(guiPath, "utf8"),
    readFile(mainPath, "utf8"),
  ]);

  assert.match(gui, /x:Name="InstallGitButton" Content="安装 Git"/);
  assert.match(gui, /x:Name="InstallCodexButton" Content="安装 Codex"/);
  assert.match(gui, /Send-Command 'installPrerequisite' @\{ name='git' \}/);
  assert.match(main, /winget\.exe.*Git\.Git/);
  assert.match(main, /https:\/\/git-scm\.com\/download\/win/);
  assert.match(main, /https:\/\/chatgpt\.com\/download\//);
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
  assert.match(main, /本机环境检测完成：Git \$\{gitStatus\}；Codex CLI \$\{codexStatus\}/);
  assert.match(main, /项目列表已刷新，共 \$\{remoteProjects\.length\} 个项目/);
});

test("state refresh races stay silent and Windows 11 is labeled correctly", async () => {
  const [gui, main] = await Promise.all([
    readFile(guiPath, "utf8"),
    readFile(mainPath, "utf8"),
  ]);

  assert.match(gui, /Get-Content[^\r\n]+-ErrorAction Stop \| ConvertFrom-Json -ErrorAction Stop/);
  assert.match(main, /fsp\.copyFile\(temporary, file\)/);
  assert.doesNotMatch(main, /fsp\.rm\(file, \{ force: true \}\)/);
  assert.match(main, /build >= 22000\) return `Windows 11/);
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
  assert.match(gui, /\$ReauthorizeButton\.Visibility = if \(\$state\.paired\)/);
});

test("project and task grids use polished fixed-height rows", async () => {
  const gui = await readFile(guiPath, "utf8");

  assert.match(gui, /<Style TargetType="DataGridColumnHeader">/);
  assert.match(gui, /<Style TargetType="DataGridRow">/);
  assert.match(gui, /Property="IsMouseOver" Value="True"/);
  assert.match(gui, /Header="目标" Width="\*"/);
});

test("taskbar uses stable WPF and Win32 icon paths", async () => {
  const gui = await readFile(guiPath, "utf8");

  assert.match(gui, /\$window\.Icon = \[Windows\.Media\.Imaging\.BitmapFrame\]::Create/);
  assert.match(gui, /New-Object System\.Drawing\.Icon\(\$IconPath, 32, 32\)/);
  assert.match(gui, /New-Object System\.Drawing\.Icon\(\$IconPath, 16, 16\)/);
  assert.match(gui, /SendMessage\(\$handle, 0x0080, \[IntPtr\]1, \$bigWindowIcon\.Handle\)/);
  assert.doesNotMatch(gui, /SetCurrentProcessExplicitAppUserModelID|LoadImage/);
});
