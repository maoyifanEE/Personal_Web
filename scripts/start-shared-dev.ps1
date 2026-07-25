param(
  [switch]$KeepSession,
  [switch]$DryRun,
  [switch]$ValidateOnly,
  [string]$SecretPath,
  [string]$FakeSshExe,
  [switch]$TestMode,
  [switch]$TestSyntheticProcesses,
  [switch]$TestSkipPreflights,
  [switch]$TestSkipBrowser,
  [string]$TestContractPath,
  [int]$TestBackendPort = 8000,
  [int]$TestFrontendPort = 4173,
  [string]$TestScenario
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

function Assert-ArrayOfUniqueStrings {
  param([object]$Value, [string]$Name)
  if ($null -eq $Value -or $Value.GetType().Name -notmatch 'Object\[\]') {
    throw "contract_invalid"
  }
  $seen = @{}
  foreach ($item in @($Value)) {
    if ($null -eq $item -or -not ($item -is [string]) -or [string]::IsNullOrWhiteSpace($item)) {
      throw "contract_invalid"
    }
    if ($seen.ContainsKey($item)) {
      throw "contract_invalid"
    }
    $seen[$item] = $true
  }
}

function Assert-NoAliasCycles {
  param([object]$Aliases)
  foreach ($start in @($Aliases.PSObject.Properties.Name)) {
    $seen = @{}
    $current = $start
    while ($Aliases.PSObject.Properties.Name -contains $current) {
      if ($seen.ContainsKey($current)) {
        throw "contract_invalid"
      }
      $seen[$current] = $true
      $current = [string]$Aliases.$current
    }
  }
}

function Load-SecretContract {
  param([string]$RepoRoot, [string]$ContractPath)
  $path = if ($ContractPath) { (Resolve-Path -LiteralPath $ContractPath).Path } else { Join-Path $RepoRoot "config\shared-dev-secret-contract.json" }
  $contract = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
  if ($contract.schemaVersion -ne 1) {
    throw "contract_invalid"
  }
  Assert-ArrayOfUniqueStrings -Value $contract.requiredKeys -Name "requiredKeys"
  Assert-ArrayOfUniqueStrings -Value $contract.optionalKeys -Name "optionalKeys"
  if ($null -eq $contract.deprecatedAliases -or $contract.deprecatedAliases.GetType().Name -notmatch 'PSCustomObject') {
    throw "contract_invalid"
  }
  $required = @($contract.requiredKeys)
  $optional = @($contract.optionalKeys)
  foreach ($key in $required) {
    if ($optional -contains $key) {
      throw "contract_invalid"
    }
  }
  $allowed = @{}
  foreach ($key in @($required + $optional)) {
    $allowed[$key] = $true
  }
  foreach ($aliasName in @($contract.deprecatedAliases.PSObject.Properties.Name)) {
    $target = [string]$contract.deprecatedAliases.$aliasName
    if (-not $allowed.ContainsKey($aliasName) -or -not $allowed.ContainsKey($target) -or $aliasName -eq $target) {
      throw "contract_invalid"
    }
  }
  Assert-NoAliasCycles -Aliases $contract.deprecatedAliases
  foreach ($key in @("expectedDatabaseName", "expectedDatabaseUser", "expectedDatabaseSshAlias", "expectedDatabaseSshUser", "expectedMediaSshAlias", "expectedMediaSshUser", "expectedRemoteMediaRoot")) {
    if ($null -eq $contract.$key -or -not ($contract.$key -is [string]) -or [string]::IsNullOrWhiteSpace([string]$contract.$key)) {
      throw "contract_invalid"
    }
  }
  if ($contract.expectedDatabaseName -ne "personal_web_shared_dev" -or
      $contract.expectedDatabaseUser -ne "personal_web_shared_dev_app" -or
      $contract.expectedDatabaseSshAlias -ne "personal-web-shared-db" -or
      $contract.expectedDatabaseSshUser -ne "personal-web-db-tunnel" -or
      $contract.expectedMediaSshAlias -ne "personal-web-shared-media" -or
      $contract.expectedMediaSshUser -ne "personal-web-dev" -or
      $contract.expectedRemoteMediaRoot -ne "/srv/personal-web/shared-dev/homepage") {
    throw "contract_invalid"
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

function Invoke-LauncherLogRetention {
  param([string]$LogDir)
  $root = (Resolve-Path -LiteralPath $LogDir).Path
  $repo = (Resolve-Path -LiteralPath $repoRoot).Path
  if (-not $root.StartsWith($repo, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "launcher_log_root_invalid"
  }
  $cutoff = (Get-Date).AddDays(-7)
  $patterns = @("start-shared-dev-*.log", "stop-shared-dev-*.log", "launcher-temp-*.log")
  $removed = 0
  foreach ($pattern in $patterns) {
    Get-ChildItem -LiteralPath $root -Filter $pattern -File -ErrorAction SilentlyContinue |
      Where-Object { ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0 -and $_.LastWriteTime -lt $cutoff } |
      ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
        $removed += 1
      }
  }
  Write-SharedLog "Launcher log retention completed; removed $removed file(s)"
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

function Start-ManagedProcess {
  param(
    [string]$FilePath,
    [string]$WorkingDirectory,
    [string[]]$Arguments
  )
  return Start-Process -FilePath $FilePath -WorkingDirectory $WorkingDirectory -ArgumentList $Arguments -WindowStyle Hidden -PassThru
}

function Wait-ForVerifiedListener {
  param(
    [object]$Record,
    [int]$TimeoutSeconds
  )
  for ($i = 0; $i -lt $TimeoutSeconds; $i += 1) {
    $status = Test-ProcessRecord -Record $Record -RequireListener
    if ($status -eq "gone_clean" -or $status -eq "gone_port_reused") {
      throw "Expected process exited before listener verification"
    }
    if ($status -eq "wildcard_listener") {
      throw "Refusing wildcard tunnel listener"
    }
    if ($status -eq "identity_mismatch" -or $status -eq "listener_owned_by_other" -or $status -eq "listener_ambiguous") {
      throw "Expected process listener ownership could not be verified"
    }
    if ($status -eq "verified") {
      Write-SharedLog ("{0} listener verified" -f [string]$Record.role)
      return
    }
    Start-Sleep -Seconds 1
  }
  throw "Timed out waiting for verified listener"
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
  param([string]$BackendDir, [string]$PythonExecutable, [int]$Port, [switch]$Synthetic)
  if ($Synthetic) {
    return Start-ManagedProcess -FilePath $PythonExecutable -WorkingDirectory $BackendDir -Arguments @("-m", "http.server", ([string]$Port), "--bind", "127.0.0.1")
  }
  Start-ManagedProcess -FilePath $PythonExecutable -WorkingDirectory $BackendDir -Arguments @(
    "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", ([string]$Port)
  )
}

function Start-DirectFrontend {
  param([string]$RepoRoot, [string]$PythonExecutable, [int]$Port, [switch]$Synthetic)
  if ($Synthetic) {
    return Start-ManagedProcess -FilePath $PythonExecutable -WorkingDirectory $RepoRoot -Arguments @((Join-Path $RepoRoot "scripts\local_static_server.py"), "--host", "127.0.0.1", "--port", ([string]$Port), "--root", $RepoRoot)
  }
  Start-ManagedProcess -FilePath $PythonExecutable -WorkingDirectory $RepoRoot -Arguments @(
    (Join-Path $RepoRoot "scripts\local_static_server.py"), "--host", "127.0.0.1", "--port", ([string]$Port), "--root", $RepoRoot
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

function New-ProjectMutexName {
  param([string]$RepoRoot)
  $normalized = (Resolve-Path -LiteralPath $RepoRoot).Path.ToLowerInvariant()
  $bytes = [System.Text.Encoding]::UTF8.GetBytes("personal-web-shared-remote:" + $normalized)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $hash = [System.BitConverter]::ToString($sha.ComputeHash($bytes)).Replace("-", "").ToLowerInvariant()
  return "Local\PersonalWebSharedRemote-$hash"
}

function Acquire-LauncherMutex {
  param([string]$Name)
  $created = $false
  $mutex = [System.Threading.Mutex]::new($false, $Name, [ref]$created)
  try {
    if ($mutex.WaitOne([TimeSpan]::FromSeconds(5))) {
      return $mutex
    }
    $mutex.Dispose()
    throw "launcher_mutex_busy"
  } catch [System.Threading.AbandonedMutexException] {
    Write-SharedLog "Recovered abandoned launcher mutex"
    return $mutex
  }
}

function New-ProcessRecord {
  param([System.Diagnostics.Process]$Process, [string]$Executable, [int]$Port, [string]$Role, [bool]$ListenerRequired = $true)
  $Process.Refresh()
  return [ordered]@{
    pid = $Process.Id
    startTimeUtc = $Process.StartTime.ToUniversalTime().ToString("o")
    executable = $Executable
    port = $Port
    localAddress = "127.0.0.1"
    role = $Role
    listenerRequired = $ListenerRequired
  }
}

function Test-ProcessRecord {
  param([object]$Record, [switch]$RequireListener)
  if (-not $Record -or -not $Record.pid -or -not $Record.startTimeUtc -or -not $Record.executable -or -not $Record.port) {
    return "invalid"
  }
  $processId = [int]$Record.pid
  $port = [int]$Record.port
  $current = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if (-not $current) {
    $listeners = @(Get-PortListeners -Port $port)
    if ($listeners.Count -eq 0) {
      return "gone_clean"
    }
    return "gone_port_reused"
  }
  if ($current.StartTime.ToUniversalTime().ToString("o") -ne [string]$Record.startTimeUtc) {
    return "identity_mismatch"
  }
  try {
    if ($current.MainModule.FileName -ne [string]$Record.executable) {
      return "identity_mismatch"
    }
  } catch {
    return "identity_mismatch"
  }
  $listeners = @(Get-PortListeners -Port $port)
  $wildcard = @($listeners | Where-Object { $_.LocalAddress -ne "127.0.0.1" })
  if ($wildcard.Count -gt 0) {
    return "wildcard_listener"
  }
  $owned = @($listeners | Where-Object { $_.OwningProcess -eq $processId -and $_.LocalAddress -eq "127.0.0.1" })
  $other = @($listeners | Where-Object { $_.OwningProcess -ne $processId -and $_.LocalAddress -eq "127.0.0.1" })
  if ($other.Count -gt 0) {
    if ($other.Count -eq 1) {
      $listenerPid = [int]$other[0].OwningProcess
      $listenerProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$listenerPid" -ErrorAction SilentlyContinue
      if ($listenerProcess -and [int]$listenerProcess.ParentProcessId -eq $processId) {
        if ($Record -is [System.Collections.Specialized.OrderedDictionary]) {
          $Record["listenerPid"] = $listenerPid
        }
        return "verified"
      }
    }
    return "listener_owned_by_other"
  }
  if ($RequireListener -and $owned.Count -ne 1) {
    return "listener_missing"
  }
  if ($owned.Count -gt 1) {
    return "listener_ambiguous"
  }
  return "verified"
}

function Stop-VerifiedRecord {
  param([object]$Record, [switch]$RequireListener)
  $status = Test-ProcessRecord -Record $Record -RequireListener:$RequireListener
  if ($status -eq "gone_clean") {
    return "already_gone"
  }
  if ($status -ne "verified" -and $status -ne "listener_missing") {
    Write-SharedLog ("Cleanup refused for {0}: {1}" -f [string]$Record.role, $status)
    return "refused"
  }
  $targetPid = if ($Record.listenerPid) { [int]$Record.listenerPid } else { [int]$Record.pid }
  Stop-Process -Id $targetPid -Force
  if ($targetPid -ne [int]$Record.pid) {
    Stop-Process -Id ([int]$Record.pid) -Force -ErrorAction SilentlyContinue
  }
  for ($i = 0; $i -lt 10; $i += 1) {
    $closedStatus = Test-ProcessRecord -Record $Record -RequireListener:$false
    if ($closedStatus -eq "gone_clean") {
      return "stopped"
    }
    Start-Sleep -Seconds 1
  }
  Write-SharedLog ("Cleanup timeout for {0}" -f [string]$Record.role)
  return "timeout"
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
    $status = Test-ProcessRecord -Record $record -RequireListener
    if ($status -eq "gone_clean") {
      continue
    }
    if ($status -ne "verified") {
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
Invoke-LauncherLogRetention -LogDir $launcherLogDir
$statePath = Join-Path $runtimeDir "shared-session-state.json"
$backendDir = Join-Path $repoRoot "backend"
$backendPython = (Join-Path $backendDir ".venv\Scripts\python.exe")
$backendPort = if ($TestMode -and $TestSyntheticProcesses) { $TestBackendPort } else { 8000 }
$frontendPort = if ($TestMode -and $TestSyntheticProcesses) { $TestFrontendPort } else { 4173 }
$baseHomepageUrl = "http://127.0.0.1:${frontendPort}/"
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
if ($TestContractPath -and -not $TestMode) {
  throw "contract_path_requires_test_mode"
}
if (-not (Test-Path -LiteralPath $SecretPath)) {
  throw "Shared-development secret file was not found"
}

$contract = Load-SecretContract -RepoRoot $repoRoot -ContractPath $TestContractPath
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

Assert-PortFree -Port $backendPort -Name "Backend"
Assert-PortFree -Port $frontendPort -Name "Frontend"
Assert-PortFree -Port $localPort -Name "Shared tunnel"

if ($ValidateOnly -or $DryRun) {
  Write-SharedLog "Validation/dry-run completed without launching processes or writing shared state"
  return
}

$createdTunnel = $null
$backendProcess = $null
$frontendProcess = $null
$createdRecords = @()
$stateWrittenByThisRun = $false
$launcherMutex = $null
try {
  $launcherMutex = Acquire-LauncherMutex -Name (New-ProjectMutexName -RepoRoot $repoRoot)
  Ensure-BackendVenv -BackendDir $backendDir -BackendPython $backendPython
  $managedPython = (Resolve-Path -LiteralPath $backendPython).Path
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
  $tunnelRecord = New-ProcessRecord -Process $createdTunnel -Executable $tunnelExecutable -Port $localPort -Role "database tunnel"
  $createdRecords += $tunnelRecord
  Write-SharedLog "Database tunnel process started"
  if ($TestScenario -eq "tunnel_exit_before_listener") { throw "Synthetic tunnel exited before listener" }
  Wait-ForVerifiedListener -Record $tunnelRecord -TimeoutSeconds 20

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

  if ($TestScenario -eq "database_preflight_fail") { throw "Running read-only shared database preflight failed" }
  if ($TestScenario -eq "sftp_preflight_fail") { throw "Running read-only shared SFTP preflight failed" }

  $backendProcess = Start-DirectBackend -BackendDir $backendDir -PythonExecutable $managedPython -Port $backendPort -Synthetic:($TestMode -and $TestSyntheticProcesses)
  $backendRecord = New-ProcessRecord -Process $backendProcess -Executable $managedPython -Port $backendPort -Role "backend"
  $createdRecords += $backendRecord
  if ($TestScenario -eq "backend_exit_before_listener") { throw "Synthetic backend exited before listener" }
  Wait-ForVerifiedListener -Record $backendRecord -TimeoutSeconds 20
  $backendAccepted = if ($TestMode -and $TestSyntheticProcesses) { @(200, 401, 403, 404) } else { @(200, 401, 403) }
  if ($TestScenario -eq "backend_readiness_timeout" -or -not (Wait-ForUrl -Name "Backend" -Uris @("http://127.0.0.1:${backendPort}/api/health", "http://127.0.0.1:${backendPort}/api/auth/me") -TimeoutSeconds 60 -AcceptedStatusCodes $backendAccepted)) {
    throw "Backend readiness failed"
  }
  $frontendProcess = Start-DirectFrontend -RepoRoot $repoRoot -PythonExecutable $managedPython -Port $frontendPort -Synthetic:($TestMode -and $TestSyntheticProcesses)
  $frontendRecord = New-ProcessRecord -Process $frontendProcess -Executable $managedPython -Port $frontendPort -Role "frontend"
  $createdRecords += $frontendRecord
  if ($TestScenario -eq "frontend_exit_before_listener") { throw "Synthetic frontend exited before listener" }
  Wait-ForVerifiedListener -Record $frontendRecord -TimeoutSeconds 20
  if ($TestScenario -eq "frontend_readiness_timeout" -or -not (Wait-ForUrl -Name "Frontend" -Uris @($baseHomepageUrl) -TimeoutSeconds 30)) {
    throw "Frontend readiness failed"
  }
  if ($TestScenario -eq "frontend_no_store_failure" -or -not (Test-FrontendNoStore -Uri $baseHomepageUrl)) {
    throw "Frontend no-store verification failed"
  }

  if ((Test-ProcessRecord -Record $tunnelRecord -RequireListener) -ne "verified" -or
      (Test-ProcessRecord -Record $backendRecord -RequireListener) -ne "verified" -or
      (Test-ProcessRecord -Record $frontendRecord -RequireListener) -ne "verified") {
    throw "Final process verification failed"
  }
  $state = [ordered]@{
    schemaVersion = $sessionSchemaVersion
    repositoryRoot = $repoRoot
    profile = "shared_remote"
    createdAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    dbTunnel = $tunnelRecord
    backend = $backendRecord
    frontend = $frontendRecord
  }
  $state.dbTunnel["localPort"] = $localPort
  $state.dbTunnel["alias"] = [string]$secret["SHARED_DEV_SSH_ALIAS"]
  if ($TestScenario -eq "state_serialization_failure") { throw "Synthetic state serialization failed" }
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
  $cleanupResults = @()
  foreach ($record in @($createdRecords | Sort-Object { if ($_.role -eq "frontend") { 0 } elseif ($_.role -eq "backend") { 1 } else { 2 } })) {
    $cleanupResults += Stop-VerifiedRecord -Record $record -RequireListener:([bool]$record.listenerRequired)
  }
  if ($cleanupResults -contains "refused" -or $cleanupResults -contains "timeout") {
    Write-SharedLog "High severity: launcher cleanup needs manual review"
  }
  Get-ChildItem -LiteralPath $runtimeDir -Filter "shared-session-state.json.*.tmp" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue
  Get-ChildItem -LiteralPath $runtimeDir -Filter "synthetic-*.py" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue
  if ($stateWrittenByThisRun -and (Test-Path -LiteralPath $statePath)) {
    Remove-Item -LiteralPath $statePath -Force
  }
  throw
} finally {
  if ($launcherMutex) {
    $launcherMutex.ReleaseMutex()
    $launcherMutex.Dispose()
  }
  Get-ChildItem -LiteralPath $runtimeDir -Filter "synthetic-*.py" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue
}
