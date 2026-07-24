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

function Test-ProcessRecord {
  param([object]$Record, [switch]$RequireListener)
  if (-not $Record -or -not $Record.pid -or -not $Record.startTimeUtc -or -not $Record.executable) {
    return $false
  }
  $process = Get-Process -Id ([int]$Record.pid) -ErrorAction SilentlyContinue
  if (-not $process) {
    return "gone"
  }
  if ($process.StartTime.ToUniversalTime().ToString("o") -ne [string]$Record.startTimeUtc) {
    return $false
  }
  try {
    if ($process.MainModule.FileName -ne [string]$Record.executable) {
      return $false
    }
  } catch {
    return $false
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
      return $false
    }
  }
  return $true
}

function Stop-VerifiedRecord {
  param([object]$Record, [string]$Name, [switch]$RequireListener)
  $valid = Test-ProcessRecord -Record $Record -RequireListener:$RequireListener
  if ($valid -eq "gone") {
    Write-SharedStopLog "$Name process is already gone."
    return "gone"
  }
  if ($valid -ne $true) {
    Write-SharedStopLog "Refusing to stop $Name because identity could not be verified."
    return "refused"
  }
  Stop-Process -Id ([int]$Record.pid) -Force
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
  Write-SharedStopLog "Shared session state is unreadable; removing stale state."
  Remove-Item -LiteralPath $statePath -Force
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
