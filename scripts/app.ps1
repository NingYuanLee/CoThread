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
$envFile = Join-Path $projectRoot '.env'
Push-Location $projectRoot
try {
$databaseInfoJson = 'import { resolveDatabaseTarget, resolveTargetDatabaseUrl } from "./server/database-policy.js"; const target = resolveDatabaseTarget(); const url = new URL(resolveTargetDatabaseUrl()); console.log(JSON.stringify({ target, host: url.hostname, port: url.port || "3306", database: url.pathname.slice(1) }))' | & node "--env-file=$envFile" --input-type=module
if ($LASTEXITCODE -ne 0) { throw '无法读取数据库连接配置，请检查 COTHREAD_DB_TARGET 与对应数据库变量' }
$databaseInfo = $databaseInfoJson | ConvertFrom-Json
Write-Host "数据库目标：$($databaseInfo.target) / $($databaseInfo.host):$($databaseInfo.port)/$($databaseInfo.database)"
$localDatabase = if ($databaseInfo.host -eq '127.0.0.1' -and $databaseInfo.port -eq '3307') { 'local' } else { 'remote' }
} finally {
  Pop-Location
}
if ($localDatabase -eq 'local') {
  & (Join-Path $PSScriptRoot 'mysql.ps1') start
}
New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot '.local') | Out-Null
$arguments = @("--env-file=`"$envFile`"", "`"$entry`"", '--production')
$process = Start-Process -FilePath (Get-Command node).Source -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectRoot '.local/app.log') -RedirectStandardError (Join-Path $projectRoot '.local/app-error.log')
$process.Id | Set-Content -LiteralPath $pidFile
Write-Host '应用已在后台启动，默认地址 http://localhost:3100；日志位于 .local/app.log。'
