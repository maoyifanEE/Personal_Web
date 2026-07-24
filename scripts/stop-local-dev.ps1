$ErrorActionPreference = "Stop"

$ports = @(8000, 4173)
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$sharedStopScript = Join-Path $repoRoot "scripts\stop-shared-dev.ps1"
$launcherLogDir = Join-Path $repoRoot ".local_logs\launcher"
New-Item -ItemType Directory -Force -Path $launcherLogDir | Out-Null
$stopLogPath = Join-Path $launcherLogDir ("stop-local-dev-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))

function Write-StopLog {
  param([string]$Message)
  Write-Host $Message
  Add-Content -Path $stopLogPath -Value "[$((Get-Date).ToString('o'))] $Message" -Encoding utf8
}

function Stop-LocalDevPortListeners {
  Write-StopLog "[Personal_Web local dev] Looking for listeners on ports: $($ports -join ', ')"
  try {
    $connections = Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction Stop
  } catch {
    Write-StopLog "Could not query TCP listeners with Get-NetTCPConnection."
    Write-StopLog "Please close the Backend and Frontend PowerShell windows manually if they are running."
    return
  }

  $processIds = $connections |
    Select-Object -ExpandProperty OwningProcess -Unique |
    Where-Object { $_ -and $_ -gt 0 }

  if (-not $processIds) {
    Write-StopLog "No local development listeners found on ports 8000 or 4173."
    return
  }

  Write-StopLog "Processes listening on local development ports:"
  foreach ($processId in $processIds) {
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($process) {
      Write-StopLog "PID $processId - $($process.ProcessName)"
    } else {
      Write-StopLog "PID $processId - process not found by Get-Process"
    }
  }

  foreach ($processId in $processIds) {
    try {
      Stop-Process -Id $processId -Force
      Write-StopLog "Stopped PID $processId"
    } catch {
      Write-StopLog ("Failed to stop PID {0}: {1}" -f $processId, $_.Exception.Message)
    }
  }
}

function Stop-VerifiedSharedTunnel {
  param([string]$StatePath)

  if (-not (Test-Path -LiteralPath $StatePath)) {
    Write-StopLog "No shared development tunnel state was found."
    return
  }
  try {
    $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
  } catch {
    Write-StopLog "Shared development tunnel state is unreadable; removing stale state file."
    Remove-Item -LiteralPath $StatePath -Force
    return
  }
  if ($state.createdBy -ne "Personal_Web start-shared-dev.ps1" -or $state.repoRoot -ne $repoRoot) {
    Write-StopLog "Refusing to stop tunnel: state record is not owned by this project."
    return
  }

  $tunnelPid = [int]$state.pid
  $expectedPort = [int]$state.localPort
  $expectedExe = [string]$state.executable
  $process = Get-Process -Id $tunnelPid -ErrorAction SilentlyContinue
  if (-not $process) {
    Write-StopLog "Shared development tunnel process is gone; removing stale state."
    Remove-Item -LiteralPath $StatePath -Force
    return
  }
  if ($process.StartTime.ToUniversalTime().ToString("o") -ne [string]$state.startTimeUtc) {
    Write-StopLog "Refusing to stop tunnel: process start time does not match state."
    return
  }
  try {
    $actualExe = $process.MainModule.FileName
  } catch {
    Write-StopLog "Refusing to stop tunnel: executable path could not be verified."
    return
  }
  if ($actualExe -ne $expectedExe) {
    Write-StopLog "Refusing to stop tunnel: executable path does not match state."
    return
  }
  try {
    $listener = Get-NetTCPConnection -LocalPort $expectedPort -State Listen -ErrorAction Stop |
      Where-Object { $_.OwningProcess -eq $tunnelPid -and $_.LocalAddress -eq "127.0.0.1" } |
      Select-Object -First 1
  } catch {
    $listener = $null
  }
  if (-not $listener) {
    Write-StopLog "Refusing to stop tunnel: loopback listener ownership could not be verified."
    return
  }

  Stop-Process -Id $tunnelPid -Force
  Remove-Item -LiteralPath $StatePath -Force
  Write-StopLog "Stopped verified shared development tunnel PID $tunnelPid on port $expectedPort."
}

Write-StopLog "[Personal_Web local dev] Stop log: $stopLogPath"
Stop-LocalDevPortListeners
if (Test-Path -LiteralPath $sharedStopScript) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $sharedStopScript
}
