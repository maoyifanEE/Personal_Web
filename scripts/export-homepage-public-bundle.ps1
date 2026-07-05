param(
  [switch]$CreateZip,
  [switch]$IncludeHomepageItems
)

$ErrorActionPreference = "Stop"

function Write-PublishInfo {
  param([string]$Message)
  Write-Host "[homepage export] $Message"
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

$pythonCandidates = @(
  (Join-Path $repoRoot "backend\.venv\Scripts\python.exe"),
  "python"
)

$python = $null
foreach ($candidate in $pythonCandidates) {
  if ($candidate -eq "python") {
    $python = $candidate
    break
  }
  if (Test-Path $candidate) {
    $python = $candidate
    break
  }
}

Write-PublishInfo "Starting Homepage/Journey public bundle export from $repoRoot"
Write-PublishInfo "Output will be written under .local_exports, which must remain untracked."

$arguments = @("scripts/homepage_publish_bundle.py", "export")
if ($CreateZip) {
  $arguments += "--create-zip"
}
if ($IncludeHomepageItems) {
  $arguments += "--include-homepage-items"
}

& $python @arguments
if ($LASTEXITCODE -ne 0) {
  throw "Homepage publish bundle export failed with exit code $LASTEXITCODE"
}

Write-PublishInfo "Export completed."
