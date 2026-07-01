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
  "scripts/stop-local-dev.ps1",
  "scripts/check-source-readability.ps1"
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

function Measure-SourceBytes {
  param(
    [string]$Label,
    [string]$Path,
    [byte[]]$Bytes
  )

  $content = [System.Text.Encoding]::UTF8.GetString($Bytes)
  $lfCount = ($Bytes | Where-Object { $_ -eq 10 }).Count
  $crCount = ($Bytes | Where-Object { $_ -eq 13 }).Count
  $maxLineLength = 0
  $longLineNumbers = New-Object System.Collections.Generic.List[string]
  $lineLimit = Get-MaxAllowedLineLength -Path $Path
  $lines = $content -split "`n"

  for ($index = 0; $index -lt $lines.Count; $index += 1) {
    $lineLength = $lines[$index].TrimEnd("`r").Length
    if ($lineLength -gt $maxLineLength) {
      $maxLineLength = $lineLength
    }
    if ($lineLength -gt $lineLimit) {
      $longLineNumbers.Add(("{0}:{1}" -f ($index + 1), $lineLength))
    }
  }

  Write-Host (
    "{0} {1} | bytes={2} | LF={3} | CR={4} | computedLines={5} | maxLineLength={6}" -f
      $Label,
      $Path,
      $Bytes.Length,
      $lfCount,
      $crCount,
      ($lfCount + 1),
      $maxLineLength
  )

  if ($Bytes.Length -gt 3000 -and $lfCount -lt 30) {
    $failures.Add("$Label $Path appears compressed: bytes=$($Bytes.Length) LF=$lfCount")
  }

  if ($longLineNumbers.Count -gt 0) {
    $sample = ($longLineNumbers | Select-Object -First 10) -join ", "
    $failures.Add("$Label $Path has lines over $lineLimit characters: $sample")
  }
}

function Get-GitObjectBytes {
  param(
    [string]$Revision,
    [string]$Path
  )

  $tempFile = New-TemporaryFile
  try {
    $objectName = "${Revision}:$Path"
    $quotedTemp = $tempFile.FullName.Replace('"', '""')
    cmd /c "git cat-file blob `"$objectName`" > `"$quotedTemp`""
    if ($LASTEXITCODE -ne 0) {
      throw "git cat-file failed for $objectName"
    }
    return [System.IO.File]::ReadAllBytes($tempFile.FullName)
  } finally {
    Remove-Item -Path $tempFile.FullName -Force -ErrorAction SilentlyContinue
  }
}

function Test-ReadableSourceFile {
  param([string]$Path)

  $absolutePath = Join-Path $repoRoot $Path
  if (-not (Test-Path $absolutePath)) {
    Write-Host "MISSING $Path"
    return
  }

  $worktreeBytes = [System.IO.File]::ReadAllBytes((Resolve-Path $absolutePath))
  Measure-SourceBytes -Label "WORKTREE" -Path $Path -Bytes $worktreeBytes

  try {
    $headBytes = Get-GitObjectBytes -Revision "HEAD" -Path $Path
    Measure-SourceBytes -Label "HEAD_OBJECT" -Path $Path -Bytes $headBytes
  } catch {
    Write-Host "HEAD_OBJECT $Path | unavailable: $($_.Exception.Message)"
  }
}

Set-Location $repoRoot
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
