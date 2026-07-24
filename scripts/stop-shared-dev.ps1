$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeDir = Join-Path $repoRoot ".runtime\shared-dev"
$statePath = Join-Path $runtimeDir "shared-session-state.json"
$launcherLogDir = Join-Path $repoRoot ".local_logs\launcher"
New-Item -ItemType Directory -Force -Path $launcherLogDir | Out-Null
$stopLogPath = Join-Path $launcherLogDir ("stop-shared-dev-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))

function Write-SharedStopLog {
  param([string]$Message)
  Write-Host "[Personal_Web shared dev stop] $Message"
  Add-Content -Path $stopLogPath -Value "[$((Get-Date).ToString('o'))] $Message" -Encoding utf8
}

function Get-PortListeners {
  param([int]$Port)
  try {
    return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop)
  } catch {
    return @()
  }
}

function Wait-ProcessAndPortClosed {
  param([int]$ProcessId, [int]$Port)
  for ($i = 0; $i -lt 10; $i += 1) {
    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    $listeners = Get-PortListeners -Port $Port | Where-Object { $_.OwningProcess -eq $ProcessId }
    if (-not $process -and @($listeners).Count -eq 0) {
      return $true
    }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Test-ProcessRecord {
  param([object]$Record, [switch]$RequireListener)
  if (-not $Record -or -not $Record.pid -or -not $Record.startTimeUtc -or -not $Record.executable) {
    return "invalid"
  }
  $process = Get-Process -Id ([int]$Record.pid) -ErrorAction SilentlyContinue
  if (-not $process) {
    return "gone"
  }
  if ($process.StartTime.ToUniversalTime().ToString("o") -ne [string]$Record.startTimeUtc) {
    return "invalid"
  }
  try {
    if ($process.MainModule.FileName -ne [string]$Record.executable) {
      return "invalid"
    }
  } catch {
    return "invalid"
  }
  if ($RequireListener) {
    $port = [int]$Record.port
    if (-not $port -and $Record.localPort) {
      $port = [int]$Record.localPort
    }
    $listener = Get-PortListeners -Port $port |
      Where-Object { $_.OwningProcess -eq [int]$Record.pid -and $_.LocalAddress -eq "127.0.0.1" } |
      Select-Object -First 1
    if (-not $listener) {
      return "invalid"
    }
  }
  return "verified"
}

function Stop-VerifiedRecord {
  param([object]$Record, [string]$Name, [switch]$RequireListener)
  $valid = Test-ProcessRecord -Record $Record -RequireListener:$RequireListener
  if ($valid -eq "gone") {
    Write-SharedStopLog "$Name process is already gone."
    return "gone"
  }
  if ($valid -ne "verified") {
    Write-SharedStopLog "Refusing to stop $Name because identity could not be verified."
    return "refused"
  }
  Stop-Process -Id ([int]$Record.pid) -Force
  $port = if ($Record.port) { [int]$Record.port } else { [int]$Record.localPort }
  if (-not (Wait-ProcessAndPortClosed -ProcessId ([int]$Record.pid) -Port $port)) {
    Write-SharedStopLog "Refusing to remove state because $Name did not fully stop."
    return "refused"
  }
  Write-SharedStopLog "Stopped verified $Name process."
  return "stopped"
}

Write-SharedStopLog "Stop log: $stopLogPath"
if (-not (Test-Path -LiteralPath $statePath)) {
  Write-SharedStopLog "No shared session state was found."
  return
}

try {
  $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
} catch {
  Write-SharedStopLog "Shared session state is unreadable; manual review is required."
  return
}

if ($state.schemaVersion -ne 1 -or $state.repositoryRoot -ne $repoRoot -or $state.profile -ne "shared_remote") {
  Write-SharedStopLog "Refusing cleanup because session state is not owned by this repository/profile."
  return
}

$results = @()
$results += Stop-VerifiedRecord -Record $state.backend -Name "backend" -RequireListener
$results += Stop-VerifiedRecord -Record $state.frontend -Name "frontend" -RequireListener
$results += Stop-VerifiedRecord -Record $state.dbTunnel -Name "database tunnel" -RequireListener

if ($results -contains "refused") {
  Write-SharedStopLog "Shared session state preserved because at least one process was unverifiable."
  return
}

Remove-Item -LiteralPath $statePath -Force
Write-SharedStopLog "Shared session state removed."
