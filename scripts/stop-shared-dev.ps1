param(
  [switch]$TestMode,
  [string]$TestRuntimeRoot,
  [string]$TestLauncherLogRoot
)

$ErrorActionPreference = "Stop"
$sessionSchemaVersion = 2

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
function Resolve-TestableRoot {
  param(
    [string]$OverridePath,
    [string]$ProductionPath,
    [string]$Name
  )
  $production = [System.IO.Path]::GetFullPath($ProductionPath)
  if (-not $OverridePath) {
    return $production
  }
  if (-not $TestMode) {
    throw "${Name}_requires_test_mode"
  }
  New-Item -ItemType Directory -Force -Path $OverridePath | Out-Null
  $resolved = (Resolve-Path -LiteralPath $OverridePath).Path
  $item = Get-Item -LiteralPath $resolved -ErrorAction Stop
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "${Name}_invalid"
  }
  if ($resolved.Equals($production, [System.StringComparison]::OrdinalIgnoreCase) -or
      $resolved.StartsWith($production + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "${Name}_cannot_use_production_root"
  }
  return $resolved
}

$productionRuntimeDir = Join-Path $repoRoot ".runtime\shared-dev"
$productionLauncherLogDir = Join-Path $repoRoot ".local_logs\launcher"
$runtimeDir = Resolve-TestableRoot -OverridePath $TestRuntimeRoot -ProductionPath $productionRuntimeDir -Name "test_runtime_root"
$statePath = Join-Path $runtimeDir "shared-session-state.json"
$launcherLogDir = Resolve-TestableRoot -OverridePath $TestLauncherLogRoot -ProductionPath $productionLauncherLogDir -Name "test_launcher_log_root"
New-Item -ItemType Directory -Force -Path $launcherLogDir | Out-Null
$stopLogPath = Join-Path $launcherLogDir ("stop-shared-dev-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))

function Write-SharedStopLog {
  param([string]$Message)
  Write-Host "[Personal_Web shared dev stop] $Message"
  Add-Content -Path $stopLogPath -Value "[$((Get-Date).ToString('o'))] $Message" -Encoding utf8
}

function Invoke-LauncherLogRetention {
  param([string]$LogDir)
  $root = (Resolve-Path -LiteralPath $LogDir).Path
  $item = Get-Item -LiteralPath $root -ErrorAction Stop
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
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
  Write-SharedStopLog "Launcher log retention completed; removed $removed file(s)."
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
    $listeners = Get-PortListeners -Port $Port
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
    $port = if ($Record.port) { [int]$Record.port } else { [int]$Record.localPort }
    $listeners = @(Get-PortListeners -Port $port)
    if ($listeners.Count -eq 0) {
      return "gone_clean"
    }
    return "gone_port_reused"
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
    $wildcard = Get-PortListeners -Port $port | Where-Object { $_.LocalAddress -ne "127.0.0.1" } | Select-Object -First 1
    if ($wildcard) {
      return "wildcard_listener"
    }
    if (-not $listener) {
      if ($Record.listenerPid) {
        $childListener = Get-PortListeners -Port $port |
          Where-Object { $_.OwningProcess -eq [int]$Record.listenerPid -and $_.LocalAddress -eq "127.0.0.1" } |
          Select-Object -First 1
        $listenerProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$Record.listenerPid)" -ErrorAction SilentlyContinue
        if ($childListener -and $listenerProcess -and [int]$listenerProcess.ParentProcessId -eq [int]$Record.pid) {
          $childProcess = Get-Process -Id ([int]$Record.listenerPid) -ErrorAction SilentlyContinue
          if (-not $childProcess) {
            return "invalid"
          }
          if ($Record.listenerStartTimeUtc -and $childProcess.StartTime.ToUniversalTime().ToString("o") -ne [string]$Record.listenerStartTimeUtc) {
            return "invalid"
          }
          try {
            if ($Record.listenerExecutable -and $childProcess.MainModule.FileName -ne [string]$Record.listenerExecutable) {
              return "invalid"
            }
          } catch {
            return "invalid"
          }
          if ($Record.listenerParentPid -and [int]$Record.listenerParentPid -ne [int]$Record.pid) {
            return "invalid"
          }
          return "verified"
        }
      }
      return "invalid"
    }
  }
  return "verified"
}

function Stop-VerifiedRecord {
  param([object]$Record, [string]$Name, [switch]$RequireListener)
  $valid = Test-ProcessRecord -Record $Record -RequireListener:$RequireListener
  if ($valid -eq "gone_clean") {
    Write-SharedStopLog "$Name process is already gone and port is clear."
    return "gone_clean"
  }
  if ($valid -eq "gone_port_reused") {
    Write-SharedStopLog "$Name process is gone but the recorded port is in use; manual review required."
    return "refused"
  }
  if ($valid -ne "verified") {
    Write-SharedStopLog "Refusing to stop $Name because identity could not be verified."
    return "refused"
  }
  $targetPid = if ($Record.listenerPid) { [int]$Record.listenerPid } else { [int]$Record.pid }
  Stop-Process -Id $targetPid -Force
  if ($targetPid -ne [int]$Record.pid) {
    Stop-Process -Id ([int]$Record.pid) -Force -ErrorAction SilentlyContinue
  }
  $port = if ($Record.port) { [int]$Record.port } else { [int]$Record.localPort }
  if (-not (Wait-ProcessAndPortClosed -ProcessId ([int]$Record.pid) -Port $port)) {
    Write-SharedStopLog "Refusing to remove state because $Name did not fully stop."
    return "refused"
  }
  Write-SharedStopLog "Stopped verified $Name process."
  return "stopped"
}

Write-SharedStopLog "Stop log: $stopLogPath"
Invoke-LauncherLogRetention -LogDir $launcherLogDir
if (-not (Test-Path -LiteralPath $statePath)) {
  Write-SharedStopLog "No shared session state was found."
  exit 0
}

try {
  $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
} catch {
  Write-SharedStopLog "Shared session state is unreadable; manual review is required."
  exit 2
}

if ($state.schemaVersion -ne $sessionSchemaVersion -or $state.repositoryRoot -ne $repoRoot -or $state.profile -ne "shared_remote") {
  Write-SharedStopLog "Refusing cleanup because session state is not owned by this repository/profile."
  exit 2
}

$results = @()
$results += Stop-VerifiedRecord -Record $state.backend -Name "backend" -RequireListener
$results += Stop-VerifiedRecord -Record $state.frontend -Name "frontend" -RequireListener
$results += Stop-VerifiedRecord -Record $state.dbTunnel -Name "database tunnel" -RequireListener

if ($results -contains "refused") {
  Write-SharedStopLog "Shared session state preserved because at least one process was unverifiable."
  exit 3
}

Remove-Item -LiteralPath $statePath -Force
Write-SharedStopLog "Shared session state removed."
exit 0
