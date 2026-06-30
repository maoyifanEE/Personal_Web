$ErrorActionPreference = "Stop"

$ports = @(8000, 4173)
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$launcherLogDir = Join-Path $repoRoot ".local_logs\launcher"
New-Item -ItemType Directory -Force -Path $launcherLogDir | Out-Null
$stopLogPath = Join-Path $launcherLogDir ("stop-local-dev-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))

function Write-StopLog {
  param([string]$Message)
  Write-Host $Message
  Add-Content -Path $stopLogPath -Value "[$((Get-Date).ToString('o'))] $Message" -Encoding utf8
}

Write-StopLog "[Personal_Web local dev] Looking for listeners on ports: $($ports -join ', ')"
Write-StopLog "[Personal_Web local dev] Stop log: $stopLogPath"

try {
  $connections = Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction Stop
} catch {
  Write-StopLog "Could not query TCP listeners with Get-NetTCPConnection."
  Write-StopLog "Please close the Backend and Frontend PowerShell windows manually."
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
