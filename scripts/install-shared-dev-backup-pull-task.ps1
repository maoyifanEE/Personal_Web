param(
  [ValidateSet("Install", "Uninstall")]
  [string]$Action = "Install"
)

$ErrorActionPreference = "Stop"

$TaskName = "Personal_Web Shared Backup Pull"
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$pullScript = (Resolve-Path -LiteralPath (Join-Path $repoRoot "scripts\pull-shared-dev-backup.ps1")).Path
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$expectedArguments = "-NoProfile -ExecutionPolicy Bypass -File `"$pullScript`""

function Normalize-ExeName {
  param([string]$Value)

  return [System.IO.Path]::GetFileName($Value).ToLowerInvariant()
}

function Test-TriggerContract {
  param($Task)

  $hasDaily = $false
  $hasLogon = $false
  foreach ($trigger in $Task.Triggers) {
    $triggerText = $trigger.ToString()
    if ($triggerText -match "Daily" -and $triggerText -match "10:00") {
      $hasDaily = $true
    }
    if ($triggerText -match "Logon") {
      $hasLogon = $true
    }
  }
  return $hasDaily -and $hasLogon
}

function Test-ExistingTaskBelongsToRepository {
  param($Task)

  if ($Task.TaskName -ne $TaskName) {
    return $false
  }
  if ($Task.Actions.Count -ne 1) {
    return $false
  }
  $taskAction = $Task.Actions[0]
  if ((Normalize-ExeName $taskAction.Execute) -ne "powershell.exe") {
    return $false
  }
  if ([string]$taskAction.Arguments -ne $expectedArguments) {
    return $false
  }
  if ([System.IO.Path]::GetFullPath([string]$taskAction.WorkingDirectory) -ine [System.IO.Path]::GetFullPath($repoRoot)) {
    return $false
  }
  if ([string]$Task.Principal.UserId -ne $currentUser) {
    return $false
  }
  if ([string]$Task.Principal.RunLevel -ne "Limited") {
    return $false
  }
  if (-not (Test-TriggerContract -Task $Task)) {
    return $false
  }
  if ($Task.Settings.WakeToRun) {
    return $false
  }
  return $true
}

if (-not (Test-Path -LiteralPath $pullScript -PathType Leaf)) {
  throw "pull_script_missing"
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

$taskAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $expectedArguments -WorkingDirectory $repoRoot
$dailyTrigger = New-ScheduledTaskTrigger -Daily -At 10:00
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries:$false -WakeToRun:$false
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$definition = New-ScheduledTask -Action $taskAction -Trigger @($dailyTrigger, $logonTrigger) -Settings $settings -Principal $principal

if ($existing) {
  Register-ScheduledTask -TaskName $TaskName -InputObject $definition | Out-Null
  Write-Host "Personal_Web shared backup pull task updated."
} else {
  Register-ScheduledTask -TaskName $TaskName -InputObject $definition | Out-Null
  Write-Host "Personal_Web shared backup pull task installed."
}
