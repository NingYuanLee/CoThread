param([ValidateSet('start','stop')][string]$Action = 'start')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$entry = Join-Path $projectRoot 'server/index.js'
$pidFile = Join-Path $projectRoot '.local/app.pid'
$existing = $null
if (Test-Path -LiteralPath $pidFile) {
  $appProcessId = [int](Get-Content -LiteralPath $pidFile)
  $candidate = Get-CimInstance Win32_Process -Filter "ProcessId=$appProcessId" -ErrorAction SilentlyContinue
  if ($candidate -and $candidate.CommandLine.Contains($entry)) { $existing = $candidate }
}
if ($Action -eq 'stop') {
  if ($existing) { Stop-Process -Id $existing.ProcessId }
  if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile }
  Write-Host '本项目应用已停止；MySQL 保持运行。'
  exit
}
if ($existing) { Write-Host '本项目应用已经运行。'; exit }
if (!(Test-Path -LiteralPath (Join-Path $projectRoot 'dist/index.html'))) { throw '请先运行 npm run build' }
& (Join-Path $PSScriptRoot 'mysql.ps1') start
$envFile = Join-Path $projectRoot '.env'
$arguments = @("--env-file=`"$envFile`"", "`"$entry`"", '--production')
$process = Start-Process -FilePath (Get-Command node).Source -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectRoot '.local/app.log') -RedirectStandardError (Join-Path $projectRoot '.local/app-error.log')
$process.Id | Set-Content -LiteralPath $pidFile
Write-Host '应用已在后台启动，默认地址 http://localhost:3100；日志位于 .local/app.log。'
