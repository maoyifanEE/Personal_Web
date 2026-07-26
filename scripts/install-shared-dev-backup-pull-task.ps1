param(
  [ValidateSet("Install", "Uninstall")]
  [string]$Action = "Install"
)

$ErrorActionPreference = "Stop"

$TaskName = "Personal_Web Shared Backup Pull"
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$pullScript = Join-Path $repoRoot "scripts\pull-shared-dev-backup.ps1"

if (-not (Test-Path -LiteralPath $pullScript -PathType Leaf)) {
  throw "pull_script_missing"
}

function Test-ExistingTaskBelongsToRepository {
  param($Task)

  foreach ($taskAction in $Task.Actions) {
    if ([string]$taskAction.Execute -match "powershell" -and [string]$taskAction.Arguments -like "*$pullScript*") {
      return $true
    }
  }
  return $false
}

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($Action -eq "Uninstall") {
  if ($existing) {
    if (-not (Test-ExistingTaskBelongsToRepository -Task $existing)) {
      throw "existing_task_unrelated"
    }
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  }
  Write-Host "Personal_Web shared backup pull task removed or already absent."
  exit 0
}

if ($existing -and -not (Test-ExistingTaskBelongsToRepository -Task $existing)) {
  throw "existing_task_unrelated"
}

$escapedScript = $pullScript.Replace('"', '\"')
$argument = "-NoProfile -ExecutionPolicy Bypass -File `"$escapedScript`""
$taskAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argument -WorkingDirectory $repoRoot
$dailyTrigger = New-ScheduledTaskTrigger -Daily -At 10:00
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries:$false -WakeToRun:$false
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$definition = New-ScheduledTask -Action $taskAction -Trigger @($dailyTrigger, $logonTrigger) -Settings $settings -Principal $principal

if ($existing) {
  Register-ScheduledTask -TaskName $TaskName -InputObject $definition -Force | Out-Null
  Write-Host "Personal_Web shared backup pull task updated."
} else {
  Register-ScheduledTask -TaskName $TaskName -InputObject $definition | Out-Null
  Write-Host "Personal_Web shared backup pull task installed."
}
