param(
  [switch]$KeepSession,
  [switch]$DryRun,
  [switch]$ValidateOnly,
  [string]$SecretPath,
  [string]$FakeSshExe,
  [switch]$SimulateDatabasePreflight,
  [switch]$SimulateSftpPreflight
)

$ErrorActionPreference = "Stop"
$script:LauncherLogPath = $null
$allowedSecretKeys = @(
  "SHARED_DEV_SSH_ALIAS",
  "SHARED_DEV_DB_LOCAL_HOST",
  "SHARED_DEV_DB_LOCAL_PORT",
  "SHARED_DEV_DB_REMOTE_HOST",
  "SHARED_DEV_DB_REMOTE_PORT",
  "SHARED_DEV_DB_NAME",
  "SHARED_DEV_DB_USER",
  "SHARED_DEV_DB_PASSWORD",
  "SHARED_DEV_REMOTE_MEDIA_ROOT",
  "SHARED_DEV_MEDIA_SSH_ALIAS",
  "SHARED_DEV_MEDIA_SSH_CONFIG_PATH",
  "SHARED_DEV_MEDIA_REMOTE_ROOT",
  "SHARED_DEV_MEDIA_CACHE_MAX_MB",
  "SHARED_DEV_MEDIA_CACHE_RETENTION_DAYS"
)

function Write-SharedLog {
  param([string]$Message)
  Write-Host "[Personal_Web shared dev] $Message"
  if ($script:LauncherLogPath) {
    Add-Content -Path $script:LauncherLogPath -Value "[$((Get-Date).ToString('o'))] INFO $Message" -Encoding utf8
  }
}

function Read-SharedSecret {
  param([string]$Path)
  $values = @{}
  $lineNumber = 0
  Get-Content -LiteralPath $Path | ForEach-Object {
    $lineNumber += 1
    $raw = [string]$_
    $trimmed = $raw.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      return
    }
    if (-not $raw.Contains("=")) {
      throw "Malformed shared-development secret line $lineNumber"
    }
    $parts = $raw -split "=", 2
    $key = $parts[0].Trim()
    if (-not $key -or $key -match "\s") {
      throw "Malformed shared-development secret key on line $lineNumber"
    }
    if ($allowedSecretKeys -notcontains $key) {
      throw "Unknown shared-development secret key on line $lineNumber"
    }
    if ($values.ContainsKey($key)) {
      throw "Duplicate shared-development secret key on line $lineNumber"
    }
    $values[$key] = $parts[1]
  }
  return $values
}

function Require-SecretKey {
  param([hashtable]$Values, [string]$Key)
  if (-not $Values.ContainsKey($Key) -or [string]::IsNullOrWhiteSpace([string]$Values[$Key])) {
    throw "Missing required shared-development secret key: $Key"
  }
}

function Get-PortListener {
  param([int]$Port)
  try {
    return Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
  } catch {
    return $null
  }
}

function Resolve-OpenSshExe {
  param([string]$FakePath)
  if ($FakePath) {
    return (Resolve-Path -LiteralPath $FakePath).Path
  }
  $candidate = Join-Path $env:WINDIR "System32\OpenSSH\ssh.exe"
  if (Test-Path -LiteralPath $candidate) {
    return $candidate
  }
  $command = Get-Command ssh.exe -ErrorAction SilentlyContinue
  if ($command -and $command.Source) {
    return $command.Source
  }
  throw "OpenSSH ssh.exe was not found"
}

function ConvertTo-UrlComponent {
  param([string]$Value)
  return [System.Uri]::EscapeDataString($Value)
}

function New-DatabaseUrl {
  param([hashtable]$Secret)
  $user = ConvertTo-UrlComponent ([string]$Secret["SHARED_DEV_DB_USER"])
  $password = ConvertTo-UrlComponent ([string]$Secret["SHARED_DEV_DB_PASSWORD"])
  $port = [int]$Secret["SHARED_DEV_DB_LOCAL_PORT"]
  $db = [string]$Secret["SHARED_DEV_DB_NAME"]
  return "postgresql+psycopg://${user}:${password}@127.0.0.1:${port}/${db}"
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeDir = Join-Path $repoRoot ".runtime\shared-dev"
$launcherLogDir = Join-Path $repoRoot ".local_logs\launcher"
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
New-Item -ItemType Directory -Force -Path $launcherLogDir | Out-Null
$script:LauncherLogPath = Join-Path $launcherLogDir ("start-shared-dev-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
$statePath = Join-Path $runtimeDir "tunnel-state.json"
$backendDir = Join-Path $repoRoot "backend"
$backendPython = Join-Path $backendDir ".venv\Scripts\python.exe"
$baseHomepageUrl = "http://127.0.0.1:4173/"
$homepageUrl = if ($KeepSession) { $baseHomepageUrl } else { "${baseHomepageUrl}?devLogout=1" }

Set-Location $repoRoot
Write-SharedLog "Repository: $repoRoot"
Write-SharedLog "Launcher log: $script:LauncherLogPath"
Write-SharedLog "KeepSession: $KeepSession"
Write-SharedLog "DryRun: $DryRun"

if (-not $SecretPath) {
  $SecretPath = Join-Path $env:USERPROFILE ".personal_web\shared-dev-secrets.env"
}
if (-not (Test-Path -LiteralPath $SecretPath)) {
  throw "Shared-development secret file was not found"
}

$secret = Read-SharedSecret -Path $SecretPath
foreach ($key in @(
  "SHARED_DEV_SSH_ALIAS",
  "SHARED_DEV_DB_LOCAL_HOST",
  "SHARED_DEV_DB_LOCAL_PORT",
  "SHARED_DEV_DB_REMOTE_HOST",
  "SHARED_DEV_DB_REMOTE_PORT",
  "SHARED_DEV_DB_NAME",
  "SHARED_DEV_DB_USER",
  "SHARED_DEV_DB_PASSWORD",
  "SHARED_DEV_MEDIA_SSH_ALIAS",
  "SHARED_DEV_MEDIA_SSH_CONFIG_PATH",
  "SHARED_DEV_MEDIA_REMOTE_ROOT"
)) {
  Require-SecretKey -Values $secret -Key $key
}

if ($secret["SHARED_DEV_DB_NAME"] -ne "personal_web_shared_dev") {
  throw "Shared development requires database name personal_web_shared_dev"
}
if (([string]$secret["SHARED_DEV_DB_NAME"]) -match "prod") {
  throw "Refusing to use a production-like database name"
}
if ($secret["SHARED_DEV_DB_LOCAL_HOST"] -ne "127.0.0.1") {
  throw "Shared development database must be reached through local loopback"
}
if ($secret["SHARED_DEV_DB_REMOTE_HOST"] -ne "127.0.0.1" -or [int]$secret["SHARED_DEV_DB_REMOTE_PORT"] -ne 5432) {
  throw "Shared development remote database tunnel target must be 127.0.0.1:5432"
}

$localPort = [int]$secret["SHARED_DEV_DB_LOCAL_PORT"]
$listener = Get-PortListener -Port $localPort
if ($listener) {
  throw "Shared development local tunnel port is already occupied"
}

$sshExe = Resolve-OpenSshExe -FakePath $FakeSshExe
$sshConfigPath = (Resolve-Path -LiteralPath ([string]$secret["SHARED_DEV_MEDIA_SSH_CONFIG_PATH"])).Path
$dbAlias = [string]$secret["SHARED_DEV_SSH_ALIAS"]
$mediaAlias = [string]$secret["SHARED_DEV_MEDIA_SSH_ALIAS"]
if ($dbAlias -eq $mediaAlias) {
  throw "Database and media SSH aliases must be explicit and separate"
}

if ($ValidateOnly) {
  Write-SharedLog "Validation completed without launching SSH, backend or frontend"
  return
}

$tunnelProcess = $null
try {
  $sshArguments = @(
    "-N",
    "-F", $sshConfigPath,
    "-o", "BatchMode=yes",
    "-o", "ExitOnForwardFailure=yes",
    "-o", "PasswordAuthentication=no",
    "-L", ("127.0.0.1:{0}:127.0.0.1:5432" -f $localPort),
    $dbAlias
  )
  if ($DryRun) {
    Write-SharedLog "Dry-run mode: fake tunnel process would be started"
    $tunnelProcess = Get-Process -Id $PID
  } else {
    $tunnelProcess = Start-Process -FilePath $sshExe -ArgumentList $sshArguments -WindowStyle Hidden -PassThru
  }
  $state = [ordered]@{
    pid = $tunnelProcess.Id
    startTimeUtc = $tunnelProcess.StartTime.ToUniversalTime().ToString("o")
    executable = $sshExe
    localPort = $localPort
    alias = $dbAlias
    repoRoot = $repoRoot
    createdBy = "Personal_Web start-shared-dev.ps1"
  }
  $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8
  Write-SharedLog "Tunnel state recorded with sanitized process metadata"

  $env:DATABASE_URL = New-DatabaseUrl -Secret $secret
  $env:PERSONAL_WEB_DATA_PROFILE = "shared_remote"
  $env:HOMEPAGE_MEDIA_STORAGE_BACKEND = "sftp"
  $env:SHARED_DEV_MEDIA_SSH_ALIAS = [string]$secret["SHARED_DEV_MEDIA_SSH_ALIAS"]
  $env:SHARED_DEV_MEDIA_SSH_CONFIG_PATH = [string]$secret["SHARED_DEV_MEDIA_SSH_CONFIG_PATH"]
  $env:SHARED_DEV_MEDIA_REMOTE_ROOT = [string]$secret["SHARED_DEV_MEDIA_REMOTE_ROOT"]
  if ($secret.ContainsKey("SHARED_DEV_MEDIA_CACHE_MAX_MB")) {
    $env:SHARED_DEV_MEDIA_CACHE_MAX_MB = [string]$secret["SHARED_DEV_MEDIA_CACHE_MAX_MB"]
  }
  if ($secret.ContainsKey("SHARED_DEV_MEDIA_CACHE_RETENTION_DAYS")) {
    $env:SHARED_DEV_MEDIA_CACHE_RETENTION_DAYS = [string]$secret["SHARED_DEV_MEDIA_CACHE_RETENTION_DAYS"]
  }

  Write-SharedLog "Shared profile environment prepared in process memory"
  if (-not $SimulateDatabasePreflight) {
    Write-SharedLog "Database identity and Alembic preflight require real shared access and are intentionally not run in this code task"
    throw "Database preflight is disabled unless explicitly simulated"
  }
  Write-SharedLog "Simulated read-only database identity and Alembic preflight passed"
  if (-not $SimulateSftpPreflight) {
    Write-SharedLog "SFTP preflight requires real shared access and is intentionally not run in this code task"
    throw "SFTP preflight is disabled unless explicitly simulated"
  }
  Write-SharedLog "Simulated SFTP preflight passed"
  if ($DryRun) {
    Write-SharedLog "Dry-run completed without backend, frontend, migration or seed"
    return
  }
  if (-not (Test-Path -LiteralPath $backendPython)) {
    throw "Backend virtual environment is missing; start local development once or create backend/.venv"
  }
  Write-SharedLog "Starting backend/frontend is deferred until real shared preflight is enabled"
  Start-Process $homepageUrl
} catch {
  Write-SharedLog ("Startup failed: {0}" -f $_.Exception.Message)
  if ($statePath -and (Test-Path -LiteralPath $statePath) -and $tunnelProcess -and -not $DryRun) {
    try {
      Stop-Process -Id $tunnelProcess.Id -Force -ErrorAction Stop
      Remove-Item -LiteralPath $statePath -Force
      Write-SharedLog "Stopped tunnel created by this failed run"
    } catch {
      Write-SharedLog "Tunnel cleanup after failure could not be completed"
    }
  } elseif ($DryRun -and (Test-Path -LiteralPath $statePath)) {
    Remove-Item -LiteralPath $statePath -Force
  }
  throw
}
