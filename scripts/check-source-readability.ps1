$ErrorActionPreference = "Stop"

$SourceFiles = @(
  "script.js",
  "auth.js",
  "login.js",
  "hub.js",
  "journey.js",
  "debug-logger.js",
  "debug-log.js",
  "apps/admin-users/admin-users.js",
  "backend/app/core/diagnostics.py",
  "backend/app/api/routes/debug.py",
  "scripts/collect-debug-logs.ps1",
  "scripts/start-local-dev.ps1",
  "scripts/stop-local-dev.ps1"
)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$failures = New-Object System.Collections.Generic.List[string]

function Get-MaxAllowedLineLength {
  param([string]$Path)

  if ($Path -eq "journey.js") {
    return 320
  }

  return 260
}

function Test-ReadableSourceFile {
  param([string]$Path)

  $absolutePath = Join-Path $repoRoot $Path
  if (-not (Test-Path $absolutePath)) {
    Write-Host "MISSING $Path"
    return
  }

  $item = Get-Item $absolutePath
  $lines = Get-Content -Path $absolutePath
  $lineCount = ($lines | Measure-Object -Line).Lines
  $byteCount = $item.Length
  $maxLineLength = 0
  $longLineNumbers = New-Object System.Collections.Generic.List[string]
  $lineLimit = Get-MaxAllowedLineLength -Path $Path

  for ($index = 0; $index -lt $lines.Count; $index += 1) {
    $lineLength = $lines[$index].Length
    if ($lineLength -gt $maxLineLength) {
      $maxLineLength = $lineLength
    }
    if ($lineLength -gt $lineLimit) {
      $longLineNumbers.Add(("{0}:{1}" -f ($index + 1), $lineLength))
    }
  }

  Write-Host "$Path | lines=$lineCount | bytes=$byteCount | maxLineLength=$maxLineLength"

  if ($byteCount -gt 3000 -and $lineCount -lt 30) {
    $failures.Add("$Path appears compressed: bytes=$byteCount lines=$lineCount")
  }

  if ($longLineNumbers.Count -gt 0) {
    $sample = ($longLineNumbers | Select-Object -First 10) -join ", "
    $failures.Add("$Path has lines over $lineLimit characters: $sample")
  }
}

Write-Host "[Personal_Web readability] Repository: $repoRoot"

foreach ($file in $SourceFiles) {
  Test-ReadableSourceFile -Path $file
}

if ($failures.Count -gt 0) {
  Write-Host ""
  Write-Host "SOURCE_READABILITY_CHECK_FAILED"
  foreach ($failure in $failures) {
    Write-Host "* $failure"
  }
  exit 1
}

Write-Host "SOURCE_READABILITY_CHECK_PASS"
