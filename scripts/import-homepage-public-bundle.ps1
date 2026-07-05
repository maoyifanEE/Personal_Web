param(
  [Parameter(Mandatory = $true)]
  [string]$BundlePath,

  [switch]$DryRun,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function Write-PublishInfo {
  param([string]$Message)
  Write-Host "[homepage import] $Message"
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

Write-PublishInfo "Starting Homepage/Journey bundle import validation."
Write-PublishInfo "BundlePath: $BundlePath"
if ($DryRun) {
  Write-PublishInfo "DryRun is enabled; database and files will not be modified."
}
if ($Force) {
  Write-PublishInfo "Force is enabled; git or Alembic mismatch warnings may be overridden."
}

$arguments = @(
  "scripts/homepage_publish_bundle.py",
  "import",
  "--bundle-path",
  $BundlePath
)

if ($DryRun) {
  $arguments += "--dry-run"
}
if ($Force) {
  $arguments += "--force"
}

& $python @arguments
if ($LASTEXITCODE -ne 0) {
  throw "Homepage publish bundle import failed with exit code $LASTEXITCODE"
}

Write-PublishInfo "Import command completed."
