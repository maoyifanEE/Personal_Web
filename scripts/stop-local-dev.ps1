$ErrorActionPreference = "Stop"

$ports = @(8000, 4173)

Write-Host "[Personal_Web local dev] Looking for listeners on ports: $($ports -join ', ')"

try {
  $connections = Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction Stop
} catch {
  Write-Host "Could not query TCP listeners with Get-NetTCPConnection."
  Write-Host "Please close the Backend and Frontend PowerShell windows manually."
  return
}

$processIds = $connections |
  Select-Object -ExpandProperty OwningProcess -Unique |
  Where-Object { $_ -and $_ -gt 0 }

if (-not $processIds) {
  Write-Host "No local development listeners found on ports 8000 or 4173."
  return
}

Write-Host "Processes listening on local development ports:"
foreach ($processId in $processIds) {
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($process) {
    Write-Host "PID $processId - $($process.ProcessName)"
  } else {
    Write-Host "PID $processId - process not found by Get-Process"
  }
}

foreach ($processId in $processIds) {
  try {
    Stop-Process -Id $processId -Force
    Write-Host "Stopped PID $processId"
  } catch {
    Write-Host ("Failed to stop PID {0}: {1}" -f $processId, $_.Exception.Message)
  }
}
