param([ValidateSet('start','stop')][string]$Action = 'start')
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
$projectRoot = Split-Path $PSScriptRoot -Parent
$localRoot = Join-Path $projectRoot '.local'
$mysqlRoot = Join-Path $localRoot 'mysql-8.4.9-winx64'
$mysqld = Join-Path $mysqlRoot 'bin/mysqld.exe'
$mysql = Join-Path $mysqlRoot 'bin/mysql.exe'
$config = Join-Path $localRoot 'my.ini'
$client = Join-Path $localRoot 'mysql-client.ini'
if ($Action -eq 'stop') {
  & (Join-Path $mysqlRoot 'bin/mysqladmin.exe') "--defaults-extra-file=$client" shutdown
  if ($LASTEXITCODE -ne 0) { throw 'MySQL shutdown failed' }
  exit
}
if (!(Test-Path -LiteralPath $mysqld)) {
  New-Item -ItemType Directory -Force $localRoot | Out-Null
  $archive = Join-Path $localRoot 'mysql.zip'
  if (!(Test-Path -LiteralPath $archive)) {
    Invoke-WebRequest 'https://cdn.mysql.com/Downloads/MySQL-8.4/mysql-8.4.9-winx64.zip' -OutFile $archive
  }
  Expand-Archive -LiteralPath $archive -DestinationPath $localRoot -Force
}
$data = Join-Path $localRoot 'mysql-data'
if (!(Test-Path -LiteralPath $config)) {
  $basePath = $mysqlRoot.Replace('\','/')
  $dataPath = $data.Replace('\','/')
  @"
[mysqld]
basedir=$basePath
datadir=$dataPath
bind-address=127.0.0.1
port=3307
mysqlx=0
character-set-server=utf8mb4
collation-server=utf8mb4_0900_ai_ci
max_allowed_packet=32M
log-error=mysql-error.log
binlog_expire_logs_seconds=86400
binlog_expire_logs_auto_purge=ON
log_bin_trust_function_creators=1
"@ | Set-Content -LiteralPath $config -Encoding ascii
}
# Upgrade existing local installations without overriding an explicit retention policy.
$configText = Get-Content -LiteralPath $config -Raw
$missingLogSettings = @()
if ($configText -notmatch '(?m)^\s*binlog[_-]expire[_-]logs[_-]seconds\s*=') {
  $missingLogSettings += 'binlog_expire_logs_seconds=86400'
}
if ($configText -notmatch '(?m)^\s*binlog[_-]expire[_-]logs[_-]auto[_-]purge\s*=') {
  $missingLogSettings += 'binlog_expire_logs_auto_purge=ON'
}
if ($configText -notmatch '(?m)^\s*log[_-]bin[_-]trust[_-]function[_-]creators\s*=') {
  $missingLogSettings += 'log_bin_trust_function_creators=1'
}
if ($missingLogSettings.Count -gt 0) {
  Add-Content -LiteralPath $config -Value ("`r`n[mysqld]`r`n" + ($missingLogSettings -join "`r`n")) -Encoding ascii
}
# Portable install: basedir/datadir must follow the project if the tree is moved.
$expectedBase = $mysqlRoot.Replace('\', '/')
$expectedData = $data.Replace('\', '/')
$configLines = @(Get-Content -LiteralPath $config)
$pathRewritten = $false
for ($n = 0; $n -lt $configLines.Count; $n++) {
  if ($configLines[$n] -match '^\s*basedir\s*=') {
    $next = "basedir=$expectedBase"
    if ($configLines[$n] -ne $next) { $configLines[$n] = $next; $pathRewritten = $true }
  } elseif ($configLines[$n] -match '^\s*datadir\s*=') {
    $next = "datadir=$expectedData"
    if ($configLines[$n] -ne $next) { $configLines[$n] = $next; $pathRewritten = $true }
  }
}
if ($pathRewritten) {
  Set-Content -LiteralPath $config -Value $configLines -Encoding ascii
}
$initialized = Test-Path -LiteralPath (Join-Path $data 'mysql')
if (!$initialized) {
  & $mysqld "--defaults-file=$config" --initialize-insecure
  if ($LASTEXITCODE -ne 0) { throw 'MySQL initialization failed' }
}
function Test-MysqlPort {
  $tcp = New-Object System.Net.Sockets.TcpClient
  try {
    $wait = $tcp.BeginConnect('127.0.0.1', 3307, $null, $null)
    if (-not $wait.AsyncWaitHandle.WaitOne(500, $false)) { return $false }
    $tcp.EndConnect($wait)
    return [bool]$tcp.Connected
  } catch {
    return $false
  } finally {
    $tcp.Dispose()
  }
}
$alreadyRunning = Test-MysqlPort
if (!$alreadyRunning) { Start-Process -FilePath $mysqld -ArgumentList "`"--defaults-file=$config`"" -WindowStyle Hidden }
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  if (Test-MysqlPort) { $ready = $true; break }
  Start-Sleep -Seconds 1
}
if (!$ready) { throw 'MySQL 未能启动，请检查 .local/mysql-data/mysql-error.log' }
if (!(Test-Path -LiteralPath $client)) {
  Push-Location $projectRoot
  try { node --env-file=.env scripts/mysql-bootstrap.js; if ($LASTEXITCODE -ne 0) { throw 'MySQL bootstrap failed' } }
  finally { Pop-Location }
}
Write-Output 'MySQL 已运行于 127.0.0.1:3307，数据位于项目 .local/mysql-data。'
