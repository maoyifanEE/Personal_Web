param()

$ErrorActionPreference = "Stop"

$TaskName = "Personal_Web Shared Backup Pull"
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$pullScript = Join-Path $repoRoot "scripts\pull-shared-dev-backup.ps1"
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

function Write-RemovalLog {
  param([string]$Message)
  Write-Host "[Personal_Web backup task removal] $Message"
}

function Get-NormalizedPath {
  param([string]$Path)
  if (-not $Path) { return "" }
  return [System.IO.Path]::GetFullPath($Path).TrimEnd("\")
}

function Test-LegacyTaskOwnedByRepository {
  param([object]$Task)
  if (-not $Task) { return $false }
  if ([string]$Task.TaskName -ne $TaskName) { return $false }
  if (-not $Task.Actions -or @($Task.Actions).Count -ne 1) { return $false }
  $action = @($Task.Actions)[0]
  if ([string]$action.Execute -ne "powershell.exe") { return $false }
  if ((Get-NormalizedPath ([string]$action.WorkingDirectory)) -ne (Get-NormalizedPath $repoRoot)) { return $false }
  $expectedFile = [regex]::Escape($pullScript)
  if ([string]$action.Arguments -notmatch "^-NoProfile -ExecutionPolicy Bypass -File `"$expectedFile`"$") { return $false }
  if (-not $Task.Principal) { return $false }
  if ([string]$Task.Principal.UserId -ne $currentUser) { return $false }
  if ([string]$Task.Principal.RunLevel -ne "Limited") { return $false }
  $logonType = [string]$Task.Principal.LogonType
  if ($logonType -notin @("Interactive", "InteractiveToken", "3")) { return $false }
  return $true
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-RemovalLog "Legacy task is absent."
  exit 0
}

if (-not (Test-LegacyTaskOwnedByRepository -Task $task)) {
  throw "legacy_task_ownership_mismatch"
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-RemovalLog "Legacy repository-owned backup pull task removed."
