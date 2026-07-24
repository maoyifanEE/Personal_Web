param(
  [switch]$KeepSession,
  [switch]$DryRun,
  [switch]$ValidateOnly,
  [string]$SecretPath,
  [string]$FakeSshExe,
  [switch]$TestMode,
  [switch]$TestSyntheticProcesses,
  [switch]$TestSkipPreflights,
  [switch]$TestSkipBrowser
)

$ErrorActionPreference = "Stop"
$script:LauncherLogPath = $null
$sessionSchemaVersion = 1

function Write-SharedLog {
  param([string]$Message)
  Write-Host "[Personal_Web shared dev] $Message"
  if ($script:LauncherLogPath) {
    Add-Content -Path $script:LauncherLogPath -Value "[$((Get-Date).ToString('o'))] INFO $Message" -Encoding utf8
  }
}

function Load-SecretContract {
  param([string]$RepoRoot)
  $path = Join-Path $RepoRoot "config\shared-dev-secret-contract.json"
  $contract = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
  $allowed = @{}
  foreach ($key in @($contract.requiredKeys + $contract.optionalKeys)) {
    $allowed[$key] = $true
  }
  Write-SharedLog "Shared secret contract loaded"
  return [ordered]@{
    Raw = $contract
    Allowed = $allowed
    Required = @($contract.requiredKeys)
  }
}

function Read-SharedSecret {
  param([string]$Path, [hashtable]$Contract)
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
    if (-not $Contract.Allowed.Contains($key)) {
      throw "Unknown shared-development secret key on line $lineNumber"
    }
    if ($values.ContainsKey($key)) {
      throw "Duplicate shared-development secret key on line $lineNumber"
    }
    $values[$key] = $parts[1]
  }
  if ($values.ContainsKey("SHARED_DEV_MEDIA_REMOTE_ROOT")) {
    if ($values.ContainsKey("SHARED_DEV_REMOTE_MEDIA_ROOT")) {
      if ([string]$values["SHARED_DEV_MEDIA_REMOTE_ROOT"] -ne [string]$values["SHARED_DEV_REMOTE_MEDIA_ROOT"]) {
        throw "Conflicting shared-development remote media root aliases"
      }
    } else {
      $values["SHARED_DEV_REMOTE_MEDIA_ROOT"] = $values["SHARED_DEV_MEDIA_REMOTE_ROOT"]
    }
  }
  foreach ($requiredKey in $Contract.Required) {
    if (-not $values.ContainsKey($requiredKey) -or [string]::IsNullOrWhiteSpace([string]$values[$requiredKey])) {
      throw "Missing required shared-development secret key: $requiredKey"
    }
  }
  return $values
}

function Get-PortListeners {
  param([int]$Port)
  try {
    return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop)
  } catch {
    return @()
  }
}

function Assert-PortFree {
  param([int]$Port, [string]$Name)
  if ((Get-PortListeners -Port $Port).Count -gt 0) {
    throw "$Name port is already occupied"
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

function Validate-SharedSecretValues {
  param([hashtable]$Secret, [object]$Contract)
  if ($Secret["SHARED_DEV_SSH_ALIAS"] -ne $Contract.expectedDatabaseSshAlias) {
    throw "Shared database SSH alias is not allowlisted"
  }
  if ($Secret["SHARED_DEV_MEDIA_SSH_ALIAS"] -ne $Contract.expectedMediaSshAlias) {
    throw "Shared media SSH alias is not allowlisted"
  }
  if ($Secret["SHARED_DEV_REMOTE_MEDIA_ROOT"] -ne $Contract.expectedRemoteMediaRoot) {
    throw "Shared remote media root is not allowlisted"
  }
  if ($Secret["SHARED_DEV_DB_NAME"] -ne $Contract.expectedDatabaseName) {
    throw "Shared development database name is not allowlisted"
  }
  if (([string]$Secret["SHARED_DEV_DB_NAME"]) -match "prod") {
    throw "Refusing to use a production-like database name"
  }
  if ($Secret["SHARED_DEV_DB_USER"] -ne $Contract.expectedDatabaseUser) {
    throw "Shared development database role is not allowlisted"
  }
  if ($Secret["SHARED_DEV_DB_LOCAL_HOST"] -ne "127.0.0.1") {
    throw "Shared development database must be reached through local loopback"
  }
  if ($Secret["SHARED_DEV_DB_REMOTE_HOST"] -ne "127.0.0.1" -or [int]$Secret["SHARED_DEV_DB_REMOTE_PORT"] -ne 5432) {
    throw "Shared development remote database tunnel target must be loopback PostgreSQL"
  }
  if ([int]$Secret["SHARED_DEV_DB_LOCAL_PORT"] -lt 1 -or [int]$Secret["SHARED_DEV_DB_LOCAL_PORT"] -gt 65535) {
    throw "Shared development local tunnel port is invalid"
  }
  if ([string]$Secret["SHARED_DEV_SSH_ALIAS"] -eq [string]$Secret["SHARED_DEV_MEDIA_SSH_ALIAS"]) {
    throw "Database and media SSH aliases must be separate"
  }
  Write-SharedLog "Shared database and media secret fields validated"
}

function Resolve-SshAliasConfig {
  param(
    [string]$SshExe,
    [string]$ConfigPath,
    [string]$Alias,
    [switch]$UseSyntheticParser
  )
  $resolved = @{}
  if ($UseSyntheticParser) {
    $inHost = $false
    foreach ($line in Get-Content -LiteralPath $ConfigPath) {
      $trimmed = $line.Trim()
      if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
      if ($trimmed -match '^Host\s+(.+)$') {
        $hosts = $Matches[1].Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries)
        $inHost = $hosts -contains $Alias
        continue
      }
      if ($inHost -and $trimmed -match '^(\S+)\s+(.+)$') {
        $key = $Matches[1].ToLowerInvariant()
        if (-not $resolved.ContainsKey($key)) { $resolved[$key] = @() }
        $resolved[$key] += $Matches[2].Trim()
      }
    }
    return $resolved
  }
  $lines = & $SshExe -G -F $ConfigPath $Alias 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "SSH alias resolution failed"
  }
  foreach ($line in $lines) {
    if ($line -match '^(\S+)\s+(.+)$') {
      $key = $Matches[1].ToLowerInvariant()
      if (-not $resolved.ContainsKey($key)) { $resolved[$key] = @() }
      $resolved[$key] += $Matches[2].Trim()
    }
  }
  return $resolved
}

function Assert-SshAliasSafe {
  param(
    [hashtable]$Resolved,
    [string]$Alias,
    [string]$ExpectedAlias,
    [string]$ExpectedUser
  )
  if ($Alias -ne $ExpectedAlias) {
    throw "SSH alias is not allowlisted"
  }
  $user = @($Resolved["user"])
  $hostName = @($Resolved["hostname"])
  $portValues = @($Resolved["port"])
  $identityFiles = @($Resolved["identityfile"])
  $knownHosts = @($Resolved["userknownhostsfile"])
  if ($user.Count -ne 1 -or $user[0] -ne $ExpectedUser -or $user[0] -eq "root") {
    throw "SSH alias user is not allowlisted"
  }
  if ($hostName.Count -ne 1 -or [string]::IsNullOrWhiteSpace($hostName[0])) {
    throw "SSH alias hostname is invalid"
  }
  if ($portValues.Count -ne 1) {
    throw "SSH alias port is invalid"
  }
  try {
    $port = [int]$portValues[0]
  } catch {
    throw "SSH alias port is invalid"
  }
  if ($port -lt 1 -or $port -gt 65535) {
    throw "SSH alias port is invalid"
  }
  if ($identityFiles.Count -ne 1 -or -not (Test-Path -LiteralPath $identityFiles[0])) {
    throw "SSH alias identity file is invalid"
  }
  if ($knownHosts.Count -ne 1 -or -not (Test-Path -LiteralPath $knownHosts[0])) {
    throw "SSH alias known_hosts file is invalid"
  }
  Write-SharedLog "SSH alias validated"
}

function Assert-TestModeSecretIsSynthetic {
  param([string]$ResolvedSecretPath, [bool]$IsTestMode, [string]$DefaultSecretPath)
  if (-not $IsTestMode) {
    return
  }
  if ((Resolve-Path -LiteralPath $ResolvedSecretPath).Path -eq (Resolve-Path -LiteralPath $DefaultSecretPath -ErrorAction SilentlyContinue).Path) {
    throw "Test-only shared launcher mode cannot use the default protected secret path"
  }
}

function Invoke-LoggedStep {
  param([string]$Name, [scriptblock]$Script)
  Write-SharedLog $Name
  & $Script
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed"
  }
}

function Remove-OldLauncherLogs {
  param([string]$LogDir)
  $cutoff = (Get-Date).AddDays(-7)
  Get-ChildItem -LiteralPath $LogDir -Filter "start-shared-dev-*.log" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    Remove-Item -Force -ErrorAction SilentlyContinue
}

function Ensure-BackendVenv {
  param([string]$BackendDir, [string]$BackendPython)
  if (-not (Test-Path -LiteralPath $BackendPython)) {
    Invoke-LoggedStep "Creating backend virtual environment" {
      python -m venv (Join-Path $BackendDir ".venv")
    }
  }
  Invoke-LoggedStep "Installing backend requirements into project venv" {
    & $BackendPython -m pip install -r (Join-Path $BackendDir "requirements.txt")
  }
}

function Resolve-ManagedPythonLaunch {
  param([string]$BackendPython)
  $baseExecutable = (& $BackendPython -c "import sys; print(getattr(sys, '_base_executable', sys.executable))").Trim()
  $sitePackages = (& $BackendPython -c "import site; print(site.getsitepackages()[0])").Trim()
  if (-not (Test-Path -LiteralPath $baseExecutable)) {
    throw "Managed Python executable was not found"
  }
  if (-not (Test-Path -LiteralPath $sitePackages)) {
    throw "Managed Python site-packages path was not found"
  }
  return [ordered]@{
    Executable = (Resolve-Path -LiteralPath $baseExecutable).Path
    SitePackages = (Resolve-Path -LiteralPath $sitePackages).Path
  }
}

function Set-ManagedPythonEnvironment {
  param([object]$Launch)
  $existingPythonPath = [string]$env:PYTHONPATH
  if ([string]::IsNullOrWhiteSpace($existingPythonPath)) {
    $env:PYTHONPATH = [string]$Launch.SitePackages
  } else {
    $env:PYTHONPATH = "{0};{1}" -f [string]$Launch.SitePackages, $existingPythonPath
  }
  $env:VIRTUAL_ENV = (Resolve-Path -LiteralPath (Join-Path $repoRoot "backend\.venv")).Path
  $env:PATH = "{0};{1}" -f (Join-Path $env:VIRTUAL_ENV "Scripts"), [string]$env:PATH
  Write-SharedLog "Managed Python environment prepared"
}

function Quote-ProcessArgument {
  param([string]$Value)
  if ($Value -notmatch '[\s"]') {
    return $Value
  }
  return '"' + ($Value -replace '\\(?=")', '$0' -replace '"', '\"') + '"'
}

function Start-ManagedProcess {
  param(
    [string]$FilePath,
    [string]$WorkingDirectory,
    [string[]]$Arguments
  )
  $safeId = [guid]::NewGuid().ToString("N")
  $stdoutPath = Join-Path $launcherLogDir ("managed-process-{0}.out.log" -f $safeId)
  $stderrPath = Join-Path $launcherLogDir ("managed-process-{0}.err.log" -f $safeId)
  return Start-Process -FilePath $FilePath -WorkingDirectory $WorkingDirectory -ArgumentList $Arguments -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
}

function Wait-ForVerifiedListener {
  param(
    [System.Diagnostics.Process]$Process,
    [string]$Executable,
    [int]$Port,
    [int]$TimeoutSeconds
  )
  $expectedStart = $Process.StartTime.ToUniversalTime().ToString("o")
  for ($i = 0; $i -lt $TimeoutSeconds; $i += 1) {
    $current = Get-Process -Id $Process.Id -ErrorAction SilentlyContinue
    if (-not $current) {
      throw "Expected process exited before listener verification"
    }
    if ($current.StartTime.ToUniversalTime().ToString("o") -ne $expectedStart) {
      throw "Expected process identity changed before listener verification"
    }
    try {
      if ($current.MainModule.FileName -ne $Executable) {
        throw "Expected process executable mismatch"
      }
    } catch {
      throw "Expected process executable could not be verified"
    }
    $listeners = Get-PortListeners -Port $Port
    $wildcard = @($listeners | Where-Object { $_.LocalAddress -ne "127.0.0.1" })
    if ($wildcard.Count -gt 0) {
      throw "Refusing wildcard tunnel listener"
    }
    $owned = @($listeners | Where-Object { $_.OwningProcess -eq $Process.Id -and $_.LocalAddress -eq "127.0.0.1" })
    if ($owned.Count -eq 1) {
      Write-SharedLog "Tunnel listener verified"
      return
    }
    Start-Sleep -Seconds 1
  }
  throw "Timed out waiting for verified tunnel listener"
}

function Test-UrlReady {
  param([string]$Uri, [int[]]$AcceptedStatusCodes = @(200))
  try {
    $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 2
    return $AcceptedStatusCodes -contains [int]$response.StatusCode
  } catch {
    $statusCode = $null
    if ($_.Exception.Response) {
      $statusCode = $_.Exception.Response.StatusCode
    }
    if ($statusCode) {
      return $AcceptedStatusCodes -contains [int]$statusCode
    }
    return $false
  }
}

function Wait-ForUrl {
  param([string]$Name, [string[]]$Uris, [int]$TimeoutSeconds, [int[]]$AcceptedStatusCodes = @(200))
  for ($i = 0; $i -lt $TimeoutSeconds; $i += 1) {
    foreach ($uri in $Uris) {
      if (Test-UrlReady -Uri $uri -AcceptedStatusCodes $AcceptedStatusCodes) {
        Write-SharedLog "$Name is ready"
        return $true
      }
    }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Test-FrontendNoStore {
  param([string]$Uri)
  try {
    $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -Method Head -TimeoutSec 2
    return ([string]$response.Headers["Cache-Control"]) -match "no-store"
  } catch {
    return $false
  }
}

function Start-DirectBackend {
  param([string]$BackendDir, [string]$PythonExecutable, [switch]$Synthetic)
  if ($Synthetic) {
    return Start-ManagedProcess -FilePath $PythonExecutable -WorkingDirectory $BackendDir -Arguments @("-m", "http.server", "8000", "--bind", "127.0.0.1")
  }
  Start-ManagedProcess -FilePath $PythonExecutable -WorkingDirectory $BackendDir -Arguments @(
    "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"
  )
}

function Start-DirectFrontend {
  param([string]$RepoRoot, [string]$PythonExecutable, [switch]$Synthetic)
  if ($Synthetic) {
    return Start-ManagedProcess -FilePath $PythonExecutable -WorkingDirectory $RepoRoot -Arguments @((Join-Path $RepoRoot "scripts\local_static_server.py"), "--host", "127.0.0.1", "--port", "4173", "--root", $RepoRoot)
  }
  Start-ManagedProcess -FilePath $PythonExecutable -WorkingDirectory $RepoRoot -Arguments @(
    (Join-Path $RepoRoot "scripts\local_static_server.py"), "--host", "127.0.0.1", "--port", "4173", "--root", $RepoRoot
  )
}

function New-SyntheticTcpListenerScript {
  param([string]$RuntimeDir)
  $path = Join-Path $RuntimeDir ("synthetic-listener-{0}.py" -f [guid]::NewGuid().ToString("N"))
  @'
from __future__ import annotations

import socket
import sys
import time

host = "127.0.0.1"
port = int(sys.argv[1])
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((host, port))
    sock.listen(16)
    sock.settimeout(1.0)
    while True:
        try:
            conn, _ = sock.accept()
        except socket.timeout:
            continue
        with conn:
            pass
'@ | Set-Content -LiteralPath $path -Encoding utf8
  return $path
}

function Get-ListenerProcessRecord {
  param([int]$Port, [string]$Name)
  $listener = Get-PortListeners -Port $Port | Where-Object { $_.LocalAddress -eq "127.0.0.1" } | Select-Object -First 1
  if (-not $listener) {
    throw "$Name listener was not found"
  }
  $process = Get-Process -Id $listener.OwningProcess -ErrorAction Stop
  return [ordered]@{
    pid = $process.Id
    startTimeUtc = $process.StartTime.ToUniversalTime().ToString("o")
    executable = $process.MainModule.FileName
    port = $Port
  }
}

function Stop-CreatedProcess {
  param([System.Diagnostics.Process]$Process)
  if (-not $Process) {
    return
  }
  $current = Get-Process -Id $Process.Id -ErrorAction SilentlyContinue
  if (-not $current) {
    return
  }
  if ($current.StartTime.ToUniversalTime().ToString("o") -ne $Process.StartTime.ToUniversalTime().ToString("o")) {
    return
  }
  Stop-Process -Id $Process.Id -Force
  $Process.WaitForExit(10000) | Out-Null
}

function Write-SessionStateAtomic {
  param([string]$Path, [object]$State)
  $tmpPath = "$Path.$PID.$([guid]::NewGuid().ToString('N')).tmp"
  $State | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $tmpPath -Encoding utf8
  Move-Item -LiteralPath $tmpPath -Destination $Path -Force
  Write-SharedLog "Shared session state written"
}

function Get-StateClassification {
  param([string]$Path, [string]$RepoRoot)
  if (-not (Test-Path -LiteralPath $Path)) {
    return "absent"
  }
  try {
    $state = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  } catch {
    return "invalid_or_unverifiable"
  }
  if ($state.schemaVersion -ne 1 -or $state.repositoryRoot -ne $RepoRoot -or $state.profile -ne "shared_remote") {
    return "invalid_or_unverifiable"
  }
  $records = @($state.backend, $state.frontend, $state.dbTunnel)
  $alive = 0
  foreach ($record in $records) {
    if (-not $record -or -not $record.pid -or -not $record.startTimeUtc -or -not $record.executable) {
      return "invalid_or_unverifiable"
    }
    $port = if ($record.port) { [int]$record.port } else { [int]$record.localPort }
    if (-not $port) {
      return "invalid_or_unverifiable"
    }
    $process = Get-Process -Id ([int]$record.pid) -ErrorAction SilentlyContinue
    $listeners = @(Get-PortListeners -Port $port)
    $owned = @($listeners | Where-Object { $_.OwningProcess -eq [int]$record.pid -and $_.LocalAddress -eq "127.0.0.1" })
    $other = @($listeners | Where-Object { $_.OwningProcess -ne [int]$record.pid -or $_.LocalAddress -ne "127.0.0.1" })
    if (-not $process -and $listeners.Count -eq 0) {
      continue
    }
    if (-not $process -or $other.Count -gt 0 -or $owned.Count -ne 1) {
      return "invalid_or_unverifiable"
    }
    if ($process.StartTime.ToUniversalTime().ToString("o") -ne [string]$record.startTimeUtc) {
      return "invalid_or_unverifiable"
    }
    try {
      if ($process.MainModule.FileName -ne [string]$record.executable) {
        return "invalid_or_unverifiable"
      }
    } catch {
      return "invalid_or_unverifiable"
    }
    $alive += 1
  }
  if ($alive -eq 0) {
    return "stale_all_gone"
  }
  if ($alive -eq $records.Count) {
    return "active_verified"
  }
  return "invalid_or_unverifiable"
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeDir = Join-Path $repoRoot ".runtime\shared-dev"
$launcherLogDir = Join-Path $repoRoot ".local_logs\launcher"
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
New-Item -ItemType Directory -Force -Path $launcherLogDir | Out-Null
$script:LauncherLogPath = Join-Path $launcherLogDir ("start-shared-dev-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
Remove-OldLauncherLogs -LogDir $launcherLogDir
$statePath = Join-Path $runtimeDir "shared-session-state.json"
$lockPath = Join-Path $runtimeDir "shared-launch.lock"
$backendDir = Join-Path $repoRoot "backend"
$backendPython = Join-Path $backendDir ".venv\Scripts\python.exe"
$baseHomepageUrl = "http://127.0.0.1:4173/"
$homepageUrl = if ($KeepSession) { $baseHomepageUrl } else { "${baseHomepageUrl}?devLogout=1" }
$defaultSecretPath = Join-Path $env:USERPROFILE ".personal_web\shared-dev-secrets.env"

Set-Location $repoRoot
Write-SharedLog "Repository: $repoRoot"
Write-SharedLog "KeepSession: $KeepSession"
Write-SharedLog "DryRun: $DryRun"
Write-SharedLog "ValidateOnly: $ValidateOnly"

if (-not $SecretPath) {
  $SecretPath = $defaultSecretPath
}
if (-not (Test-Path -LiteralPath $SecretPath)) {
  throw "Shared-development secret file was not found"
}

$contract = Load-SecretContract -RepoRoot $repoRoot
Assert-TestModeSecretIsSynthetic -ResolvedSecretPath $SecretPath -IsTestMode ($DryRun -or $ValidateOnly -or $TestMode -or $TestSyntheticProcesses -or [bool]$FakeSshExe) -DefaultSecretPath $defaultSecretPath
$secret = Read-SharedSecret -Path $SecretPath -Contract $contract
Validate-SharedSecretValues -Secret $secret -Contract $contract.Raw

$localPort = [int]$secret["SHARED_DEV_DB_LOCAL_PORT"]
$dbSshConfigPath = (Resolve-Path -LiteralPath ([string]$secret["SHARED_DEV_DB_SSH_CONFIG_PATH"])).Path
$mediaSshConfigPath = (Resolve-Path -LiteralPath ([string]$secret["SHARED_DEV_MEDIA_SSH_CONFIG_PATH"])).Path
$sshExe = Resolve-OpenSshExe -FakePath $FakeSshExe
Assert-SshAliasSafe -Resolved (Resolve-SshAliasConfig -SshExe $sshExe -ConfigPath $dbSshConfigPath -Alias ([string]$secret["SHARED_DEV_SSH_ALIAS"]) -UseSyntheticParser:$TestMode) -Alias ([string]$secret["SHARED_DEV_SSH_ALIAS"]) -ExpectedAlias $contract.Raw.expectedDatabaseSshAlias -ExpectedUser $contract.Raw.expectedDatabaseSshUser
Assert-SshAliasSafe -Resolved (Resolve-SshAliasConfig -SshExe $sshExe -ConfigPath $mediaSshConfigPath -Alias ([string]$secret["SHARED_DEV_MEDIA_SSH_ALIAS"]) -UseSyntheticParser:$TestMode) -Alias ([string]$secret["SHARED_DEV_MEDIA_SSH_ALIAS"]) -ExpectedAlias $contract.Raw.expectedMediaSshAlias -ExpectedUser $contract.Raw.expectedMediaSshUser

$classification = Get-StateClassification -Path $statePath -RepoRoot $repoRoot
if ($classification -eq "active_verified") {
  throw "A verified shared session is already running; run stop-shared-dev.bat first"
}
if ($classification -eq "stale_all_gone") {
  Remove-Item -LiteralPath $statePath -Force
  Write-SharedLog "Removed stale shared session state"
}
if ($classification -eq "invalid_or_unverifiable") {
  throw "Existing shared session state needs manual review"
}

Assert-PortFree -Port 8000 -Name "Backend"
Assert-PortFree -Port 4173 -Name "Frontend"
Assert-PortFree -Port $localPort -Name "Shared tunnel"

if ($ValidateOnly -or $DryRun) {
  Write-SharedLog "Validation/dry-run completed without launching processes or writing shared state"
  return
}

$createdTunnel = $null
$backendProcess = $null
$frontendProcess = $null
$stateWrittenByThisRun = $false
try {
  $lock = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  Ensure-BackendVenv -BackendDir $backendDir -BackendPython $backendPython
  $pythonLaunch = Resolve-ManagedPythonLaunch -BackendPython $backendPython
  Set-ManagedPythonEnvironment -Launch $pythonLaunch
  $managedPython = [string]$pythonLaunch.Executable
  $sshArguments = @(
    "-N",
    "-F", $dbSshConfigPath,
    "-o", "BatchMode=yes",
    "-o", "ExitOnForwardFailure=yes",
    "-o", "PasswordAuthentication=no",
    "-o", "KbdInteractiveAuthentication=no",
    "-o", "PreferredAuthentications=publickey",
    "-L", ("127.0.0.1:{0}:127.0.0.1:5432" -f $localPort),
    [string]$secret["SHARED_DEV_SSH_ALIAS"]
  )
  $tunnelExecutable = $sshExe
  if ($TestMode -and $TestSyntheticProcesses) {
    $tunnelExecutable = $managedPython
    $syntheticTunnelScript = New-SyntheticTcpListenerScript -RuntimeDir $runtimeDir
    $createdTunnel = Start-ManagedProcess -FilePath $managedPython -WorkingDirectory $repoRoot -Arguments @($syntheticTunnelScript, ([string]$localPort))
  } else {
    $createdTunnel = Start-Process -FilePath $sshExe -ArgumentList $sshArguments -WindowStyle Hidden -PassThru
  }
  Write-SharedLog "Database tunnel process started"
  Wait-ForVerifiedListener -Process $createdTunnel -Executable $tunnelExecutable -Port $localPort -TimeoutSeconds 20

  $env:DATABASE_URL = New-DatabaseUrl -Secret $secret
  $env:PERSONAL_WEB_DATA_PROFILE = "shared_remote"
  $env:HOMEPAGE_MEDIA_STORAGE_BACKEND = "sftp"
  $env:SHARED_DEV_MEDIA_SSH_ALIAS = [string]$secret["SHARED_DEV_MEDIA_SSH_ALIAS"]
  $env:SHARED_DEV_MEDIA_SSH_CONFIG_PATH = $mediaSshConfigPath
  $env:SHARED_DEV_MEDIA_REMOTE_ROOT = [string]$secret["SHARED_DEV_REMOTE_MEDIA_ROOT"]
  if ($secret.ContainsKey("SHARED_DEV_MEDIA_CACHE_MAX_MB")) {
    $env:SHARED_DEV_MEDIA_CACHE_MAX_MB = [string]$secret["SHARED_DEV_MEDIA_CACHE_MAX_MB"]
  }
  if ($secret.ContainsKey("SHARED_DEV_MEDIA_CACHE_RETENTION_DAYS")) {
    $env:SHARED_DEV_MEDIA_CACHE_RETENTION_DAYS = [string]$secret["SHARED_DEV_MEDIA_CACHE_RETENTION_DAYS"]
  }

  if (-not $TestSkipPreflights) {
    Invoke-LoggedStep "Running read-only shared database preflight" {
      Push-Location $backendDir
      try { & $backendPython -m app.scripts.check_shared_dev_preflight } finally { Pop-Location }
    }
    Invoke-LoggedStep "Running read-only shared SFTP preflight" {
      Push-Location $backendDir
      try { & $backendPython -m app.scripts.check_shared_dev_sftp_preflight } finally { Pop-Location }
    }
  }

  $backendProcess = Start-DirectBackend -BackendDir $backendDir -PythonExecutable $managedPython -Synthetic:($TestMode -and $TestSyntheticProcesses)
  Wait-ForVerifiedListener -Process $backendProcess -Executable $managedPython -Port 8000 -TimeoutSeconds 20
  $backendAccepted = if ($TestMode -and $TestSyntheticProcesses) { @(200, 401, 403, 404) } else { @(200, 401, 403) }
  if (-not (Wait-ForUrl -Name "Backend" -Uris @("http://127.0.0.1:8000/api/health", "http://127.0.0.1:8000/api/auth/me") -TimeoutSeconds 60 -AcceptedStatusCodes $backendAccepted)) {
    throw "Backend readiness failed"
  }
  $frontendProcess = Start-DirectFrontend -RepoRoot $repoRoot -PythonExecutable $managedPython -Synthetic:($TestMode -and $TestSyntheticProcesses)
  Wait-ForVerifiedListener -Process $frontendProcess -Executable $managedPython -Port 4173 -TimeoutSeconds 20
  if (-not (Wait-ForUrl -Name "Frontend" -Uris @($baseHomepageUrl) -TimeoutSeconds 30)) {
    throw "Frontend readiness failed"
  }
  if (-not (Test-FrontendNoStore -Uri $baseHomepageUrl)) {
    throw "Frontend no-store verification failed"
  }

  $state = [ordered]@{
    schemaVersion = $sessionSchemaVersion
    repositoryRoot = $repoRoot
    profile = "shared_remote"
    createdAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    dbTunnel = Get-ListenerProcessRecord -Port $localPort -Name "Database tunnel"
    backend = Get-ListenerProcessRecord -Port 8000 -Name "Backend"
    frontend = Get-ListenerProcessRecord -Port 4173 -Name "Frontend"
  }
  $state.dbTunnel["localPort"] = $localPort
  $state.dbTunnel["alias"] = [string]$secret["SHARED_DEV_SSH_ALIAS"]
  Write-SessionStateAtomic -Path $statePath -State $state
  $stateWrittenByThisRun = $true
  if (-not $TestSkipBrowser) {
    try {
      Start-Process $homepageUrl
    } catch {
      Write-SharedLog "Browser open failed nonfatally"
    }
  }
  Write-SharedLog "Personal_Web shared development is ready"
} catch {
  Write-SharedLog ("Startup failed safely: {0}" -f $_.Exception.GetType().Name)
  Stop-CreatedProcess -Process $frontendProcess
  Stop-CreatedProcess -Process $backendProcess
  Stop-CreatedProcess -Process $createdTunnel
  Get-ChildItem -LiteralPath $runtimeDir -Filter "shared-session-state.json.*.tmp" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue
  Get-ChildItem -LiteralPath $runtimeDir -Filter "synthetic-*.py" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue
  if ($stateWrittenByThisRun -and (Test-Path -LiteralPath $statePath)) {
    Remove-Item -LiteralPath $statePath -Force
  }
  throw
} finally {
  if ($lock) {
    $lock.Close()
    Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
  }
  Get-ChildItem -LiteralPath $runtimeDir -Filter "synthetic-*.py" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue
}
