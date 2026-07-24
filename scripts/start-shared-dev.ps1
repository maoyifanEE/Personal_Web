param(
  [switch]$KeepSession,
  [switch]$DryRun,
  [switch]$ValidateOnly,
  [string]$SecretPath,
  [string]$FakeSshExe
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
  foreach ($requiredKey in $Contract.Required) {
    if (-not $values.ContainsKey($requiredKey) -or [string]::IsNullOrWhiteSpace([string]$values[$requiredKey])) {
      throw "Missing required shared-development secret key: $requiredKey"
    }
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

function Start-BackendWindow {
  param([string]$BackendDir, [string]$BackendPython)
  $command = @"
`$Host.UI.RawUI.WindowTitle = 'Personal_Web Shared Backend 8000'
`$ErrorActionPreference = 'Stop'
& '$BackendPython' -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
"@
  Start-Process powershell.exe -WorkingDirectory $BackendDir -ArgumentList @(
    "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command
  ) -WindowStyle Normal -PassThru
}

function Start-FrontendWindow {
  param([string]$RepoRoot, [string]$BackendPython)
  $command = @"
`$Host.UI.RawUI.WindowTitle = 'Personal_Web Shared Frontend 4173'
& '$BackendPython' (Join-Path '$RepoRoot' 'scripts\local_static_server.py') --host 127.0.0.1 --port 4173 --root '$RepoRoot'
"@
  Start-Process powershell.exe -WorkingDirectory $RepoRoot -ArgumentList @(
    "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command
  ) -WindowStyle Normal -PassThru
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
}

function Write-SessionStateAtomic {
  param([string]$Path, [object]$State)
  $tmpPath = "$Path.tmp"
  $State | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $tmpPath -Encoding utf8
  Move-Item -LiteralPath $tmpPath -Destination $Path -Force
  Write-SharedLog "Shared session state written"
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeDir = Join-Path $repoRoot ".runtime\shared-dev"
$launcherLogDir = Join-Path $repoRoot ".local_logs\launcher"
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
New-Item -ItemType Directory -Force -Path $launcherLogDir | Out-Null
$script:LauncherLogPath = Join-Path $launcherLogDir ("start-shared-dev-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
$statePath = Join-Path $runtimeDir "shared-session-state.json"
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
Assert-TestModeSecretIsSynthetic -ResolvedSecretPath $SecretPath -IsTestMode ($DryRun -or $ValidateOnly -or [bool]$FakeSshExe) -DefaultSecretPath $defaultSecretPath
$secret = Read-SharedSecret -Path $SecretPath -Contract $contract
Validate-SharedSecretValues -Secret $secret -Contract $contract.Raw

$localPort = [int]$secret["SHARED_DEV_DB_LOCAL_PORT"]
$dbSshConfigPath = (Resolve-Path -LiteralPath ([string]$secret["SHARED_DEV_DB_SSH_CONFIG_PATH"])).Path
$mediaSshConfigPath = (Resolve-Path -LiteralPath ([string]$secret["SHARED_DEV_MEDIA_SSH_CONFIG_PATH"])).Path
$sshExe = Resolve-OpenSshExe -FakePath $FakeSshExe

Assert-PortFree -Port 8000 -Name "Backend"
Assert-PortFree -Port 4173 -Name "Frontend"
Assert-PortFree -Port $localPort -Name "Shared tunnel"

if ($ValidateOnly -or $DryRun) {
  Write-SharedLog "Validation/dry-run completed without launching processes or writing shared state"
  return
}

$createdTunnel = $null
$backendWindow = $null
$frontendWindow = $null
try {
  Ensure-BackendVenv -BackendDir $backendDir -BackendPython $backendPython
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
  $createdTunnel = Start-Process -FilePath $sshExe -ArgumentList $sshArguments -WindowStyle Hidden -PassThru
  Write-SharedLog "Database tunnel process started"
  Wait-ForVerifiedListener -Process $createdTunnel -Executable $sshExe -Port $localPort -TimeoutSeconds 20

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

  Invoke-LoggedStep "Running read-only shared database preflight" {
    Push-Location $backendDir
    try { & $backendPython -m app.scripts.check_shared_dev_preflight } finally { Pop-Location }
  }
  Invoke-LoggedStep "Running read-only shared SFTP preflight" {
    Push-Location $backendDir
    try { & $backendPython -m app.scripts.check_shared_dev_sftp_preflight } finally { Pop-Location }
  }

  $backendWindow = Start-BackendWindow -BackendDir $backendDir -BackendPython $backendPython
  if (-not (Wait-ForUrl -Name "Backend" -Uris @("http://127.0.0.1:8000/api/health", "http://127.0.0.1:8000/api/auth/me") -TimeoutSeconds 60 -AcceptedStatusCodes @(200, 401, 403))) {
    throw "Backend readiness failed"
  }
  $frontendWindow = Start-FrontendWindow -RepoRoot $repoRoot -BackendPython $backendPython
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
    dbTunnel = [ordered]@{
      pid = $createdTunnel.Id
      startTimeUtc = $createdTunnel.StartTime.ToUniversalTime().ToString("o")
      executable = $sshExe
      localPort = $localPort
      alias = [string]$secret["SHARED_DEV_SSH_ALIAS"]
    }
    backend = Get-ListenerProcessRecord -Port 8000 -Name "Backend"
    frontend = Get-ListenerProcessRecord -Port 4173 -Name "Frontend"
  }
  Write-SessionStateAtomic -Path $statePath -State $state
  Start-Process $homepageUrl
  Write-SharedLog "Personal_Web shared development is ready"
} catch {
  Write-SharedLog ("Startup failed in sanitized phase: {0}" -f $_.Exception.Message)
  Stop-CreatedProcess -Process $frontendWindow
  Stop-CreatedProcess -Process $backendWindow
  Stop-CreatedProcess -Process $createdTunnel
  Remove-Item -LiteralPath "$statePath.tmp" -Force -ErrorAction SilentlyContinue
  throw
}
