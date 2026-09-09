param([ValidateSet('start','stop')][string]$Action = 'start')
$ErrorActionPreference = 'Stop'
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
"@ | Set-Content -LiteralPath $config -Encoding ascii
}
$initialized = Test-Path -LiteralPath (Join-Path $data 'mysql')
if (!$initialized) {
  & $mysqld "--defaults-file=$config" --initialize-insecure
  if ($LASTEXITCODE -ne 0) { throw 'MySQL initialization failed' }
}
$alreadyRunning = Get-NetTCPConnection -LocalPort 3307 -State Listen -ErrorAction SilentlyContinue
if (!$alreadyRunning) { Start-Process -FilePath $mysqld -ArgumentList "`"--defaults-file=$config`"" -WindowStyle Hidden }
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  if (Get-NetTCPConnection -LocalPort 3307 -State Listen -ErrorAction SilentlyContinue) { $ready = $true; break }
  Start-Sleep -Seconds 1
}
if (!$ready) { throw 'MySQL 未能启动，请检查 .local/mysql-data/mysql-error.log' }
if (!(Test-Path -LiteralPath $client)) {
  Push-Location $projectRoot
  try { node --env-file=.env scripts/mysql-bootstrap.js; if ($LASTEXITCODE -ne 0) { throw 'MySQL bootstrap failed' } }
  finally { Pop-Location }
}
Write-Host 'MySQL 已运行于 127.0.0.1:3307，数据位于项目 .local/mysql-data。'
