$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$logRoot = Join-Path $repoRoot ".local_logs"
$bundleRoot = Join-Path $logRoot "debug-bundles"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$bundleDir = Join-Path $bundleRoot "personal-web-debug-$timestamp"
$zipPath = "$bundleDir.local-debug.zip"

New-Item -ItemType Directory -Force -Path $bundleDir | Out-Null

function Write-BundleFile {
  param(
    [string]$Name,
    [scriptblock]$Script
  )

  $target = Join-Path $bundleDir $Name
  try {
    & $Script | Out-File -FilePath $target -Encoding utf8
  } catch {
    "Failed to collect ${Name}: $($_.Exception.Message)" | Out-File -FilePath $target -Encoding utf8
  }
}

Write-Host "[Personal_Web debug] Repository: $repoRoot"
Write-Host "[Personal_Web debug] Bundle directory: $bundleDir"

Write-BundleFile -Name "git-status.txt" -Script {
  Set-Location $repoRoot
  git branch --show-current
  git status --short
  git rev-parse HEAD
  git log -5 --oneline
  git diff --stat
}

Write-BundleFile -Name "environment-summary.txt" -Script {
  "CollectedAt=$((Get-Date).ToString('o'))"
  "Computer=$env:COMPUTERNAME"
  "User=$env:USERNAME"
  "PowerShell=$($PSVersionTable.PSVersion)"
  "LogRoot=$logRoot"
}

if (Test-Path $logRoot) {
  Get-ChildItem -Path $logRoot -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notlike "$bundleRoot*" } |
    ForEach-Object {
      $relative = $_.FullName.Substring($logRoot.Length).TrimStart("\", "/")
      $target = Join-Path $bundleDir (Join-Path "logs" $relative)
      New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
      Copy-Item -Path $_.FullName -Destination $target -Force
    }
}

Compress-Archive -Path (Join-Path $bundleDir "*") -DestinationPath $zipPath -Force

Write-Host "[Personal_Web debug] Created bundle:"
Write-Host $zipPath
