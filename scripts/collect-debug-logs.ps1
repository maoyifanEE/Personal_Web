$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$logRoot = Join-Path $repoRoot ".local_logs"
$bundleRoot = Join-Path $logRoot "debug-bundles"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$bundleName = "personal-web-debug-$timestamp"
$bundleDir = Join-Path $bundleRoot $bundleName
$zipPath = Join-Path $bundleRoot "$bundleName.local-debug.zip"
$summaryPath = Join-Path $bundleRoot "${bundleName}_summary.txt"
$maxCopyBytes = 5MB

New-Item -ItemType Directory -Force -Path $bundleDir | Out-Null

function Write-BundleFile {
  param(
    [string]$Name,
    [scriptblock]$Script
  )

  $target = Join-Path $bundleDir $Name
  New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
  try {
    & $Script | Out-File -FilePath $target -Encoding utf8
  } catch {
    "Failed to collect ${Name}: $($_.Exception.Message)" | Out-File -FilePath $target -Encoding utf8
  }
}

function Get-ShortHttpResult {
  param([string]$Uri)

  try {
    $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 3
    $body = $response.Content
    if ($body.Length -gt 1200) {
      $body = $body.Substring(0, 1200) + "...[truncated]"
    }
    return "GET $Uri`nstatus=$([int]$response.StatusCode)`nbody=$body"
  } catch {
    $status = "unavailable"
    $body = $_.Exception.Message
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
      try {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
      } catch {
        $body = $_.Exception.Message
      }
    }
    if ($body.Length -gt 1200) {
      $body = $body.Substring(0, 1200) + "...[truncated]"
    }
    return "GET $Uri`nstatus=$status`nbody=$body"
  }
}

function Copy-SafeLogFiles {
  if (-not (Test-Path $logRoot)) {
    return
  }

  $allowedDirs = @("backend", "frontend", "launcher")
  foreach ($dirName in $allowedDirs) {
    $sourceDir = Join-Path $logRoot $dirName
    if (-not (Test-Path $sourceDir)) {
      continue
    }
    Get-ChildItem -Path $sourceDir -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object {
        $_.Length -le $maxCopyBytes -and
        $_.FullName -notmatch "\\debug-bundles\\" -and
        $_.FullName -notmatch "\\.env$" -and
        $_.FullName -notmatch "\\.venv\\" -and
        $_.FullName -notmatch "\\uploads\\" -and
        $_.FullName -notmatch "\\backups\\" -and
        $_.Extension -notin @(".db", ".sqlite", ".sqlite3", ".png", ".jpg", ".jpeg", ".webp", ".gif")
      } |
      ForEach-Object {
        $relative = $_.FullName.Substring($logRoot.Length).TrimStart("\", "/")
        $target = Join-Path $bundleDir (Join-Path "logs" $relative)
        New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
        Copy-Item -Path $_.FullName -Destination $target -Force
      }
  }
}

Write-Host "[Personal_Web debug] Repository: $repoRoot"
Write-Host "[Personal_Web debug] Bundle directory: $bundleDir"

Write-BundleFile -Name "git-state.txt" -Script {
  Set-Location $repoRoot
  "branch=$(git branch --show-current)"
  "head=$(git rev-parse HEAD)"
  ""
  "status --short:"
  git status --short
  ""
  "log -5:"
  git log -5 --oneline
  ""
  "diff --stat:"
  git diff --stat
}

Write-BundleFile -Name "environment-summary.txt" -Script {
  "CollectedAt=$((Get-Date).ToString('o'))"
  "RepoRoot=$repoRoot"
  "OS=$([System.Environment]::OSVersion.VersionString)"
  "Computer=$env:COMPUTERNAME"
  "PowerShell=$($PSVersionTable.PSVersion)"
  "BackendEnvExists=$(if (Test-Path (Join-Path $repoRoot 'backend\.env')) { 'yes' } else { 'no' })"
  "Python=$(try { python --version 2>&1 } catch { 'unavailable' })"
  "Node=$(try { node --version 2>&1 } catch { 'unavailable' })"
}

Write-BundleFile -Name "ports.txt" -Script {
  foreach ($port in @(8000, 4173)) {
    "Port $port"
    try {
      $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop
      if (-not $listeners) {
        "  no listener"
        continue
      }
      foreach ($listener in $listeners) {
        $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
        if ($process) {
          "  PID $($listener.OwningProcess) - $($process.ProcessName)"
        } else {
          "  PID $($listener.OwningProcess) - stale/unresolvable"
        }
      }
    } catch {
      "  unavailable: $($_.Exception.Message)"
    }
  }
}

Write-BundleFile -Name "backend-http.txt" -Script {
  Get-ShortHttpResult -Uri "http://127.0.0.1:8000/api/health"
  ""
  Get-ShortHttpResult -Uri "http://127.0.0.1:8000/api/auth/me"
  ""
  Get-ShortHttpResult -Uri "http://127.0.0.1:8000/api/debug/status"
}

Write-BundleFile -Name "safe-file-inventory.txt" -Script {
  Set-Location $repoRoot
  git ls-files |
    Where-Object {
      $_ -match "^(index|login|hub|journey|debug-log|debug-logger|auth|script).*|^backend/app/|^scripts/|^docs/|^README.md$"
    } |
    Sort-Object
}

Copy-SafeLogFiles

$summaryLines = @(
  "Personal_Web debug bundle",
  "=========================",
  "CreatedAt=$((Get-Date).ToString('o'))",
  "Repository=$repoRoot",
  "BundleDirectory=$bundleDir",
  "Zip=$zipPath",
  "Summary=$summaryPath",
  "",
  "Included:",
  "* Git state",
  "* Environment summary without .env contents",
  "* Local port listeners for 8000 and 4173",
  "* Backend health/auth/debug status probes without cookies or auth headers",
  "* .local_logs/backend, .local_logs/frontend, and .local_logs/launcher when present",
  "* Safe tracked file inventory",
  "",
  "Intentionally not collected:",
  "* .env contents",
  "* .venv",
  "* database files",
  "* uploads",
  "* backups",
  "* previous debug bundles",
  "* large binary files",
  "* browser profiles",
  "",
  "Please review before sharing."
)

$summaryLines | Out-File -FilePath $summaryPath -Encoding utf8
Copy-Item -Path $summaryPath -Destination (Join-Path $bundleDir "_summary.txt") -Force

Compress-Archive -Path (Join-Path $bundleDir "*") -DestinationPath $zipPath -Force

Write-Host ""
Write-Host "Debug bundle created:"
Write-Host $zipPath
Write-Host ""
Write-Host "Summary:"
Write-Host $summaryPath
Write-Host ""
Write-Host "Please review before sharing."
