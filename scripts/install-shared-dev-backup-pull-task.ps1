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

function Test-InteractiveLogonType {
  param($Value)

  if ($null -eq $Value) {
    return $false
  }
  $text = [string]$Value
  return $text -in @("Interactive", "InteractiveToken", "3")
}

function Test-ExactDailyStartBoundary {
  param([string]$Value)

  if (-not $Value) {
    return $false
  }
  try {
    $parsed = [datetime]::Parse(
      $Value,
      [System.Globalization.CultureInfo]::InvariantCulture,
      [System.Globalization.DateTimeStyles]::NoCurrentDateDefault
    )
  } catch {
    return $false
  }
  return ($parsed.Hour -eq 10 -and
    $parsed.Minute -eq 0 -and
    $parsed.Second -eq 0 -and
    $parsed.Millisecond -eq 0)
}

function Test-TriggerContract {
  param($Task)

  if ($Task.Triggers.Count -ne 2) {
    return $false
  }
  $dailyTriggers = @()
  $logonTriggers = @()
  foreach ($trigger in $Task.Triggers) {
    $className = [string]$trigger.CimClass.CimClassName
    if ($className -eq "MSFT_TaskDailyTrigger") {
      $dailyTriggers += $trigger
      continue
    }
    if ($className -eq "MSFT_TaskLogonTrigger") {
      $logonTriggers += $trigger
      continue
    }
    return $false
  }
  if ($dailyTriggers.Count -ne 1 -or $logonTriggers.Count -ne 1) {
    return $false
  }
  $daily = $dailyTriggers[0]
  $logon = $logonTriggers[0]
  if ($daily.Enabled -ne $true -or $logon.Enabled -ne $true) {
    return $false
  }
  if (-not (Test-ExactDailyStartBoundary -Value ([string]$daily.StartBoundary))) {
    return $false
  }
  if ($daily.DaysInterval -and [int]$daily.DaysInterval -ne 1) {
    return $false
  }
  foreach ($trigger in @($daily, $logon)) {
    if ($trigger.Repetition -and ($trigger.Repetition.Interval -or $trigger.Repetition.Duration)) {
      return $false
    }
  }
  if ($logon.UserId -and [string]$logon.UserId -ne $currentUser) {
    return $false
  }
  return $true
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
  if ($Task.Settings.StartWhenAvailable -ne $true) {
    return $false
  }
  if ($Task.Settings.DisallowStartIfOnBatteries -ne $true) {
    return $false
  }
  if ($Task.Settings.StopIfGoingOnBatteries -ne $false) {
    return $false
  }
  if ($Task.Settings.MultipleInstances -and [string]$Task.Settings.MultipleInstances -ne "IgnoreNew") {
    return $false
  }
  if (-not (Test-InteractiveLogonType -Value $Task.Principal.LogonType)) {
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
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries:$false -WakeToRun:$false -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$definition = New-ScheduledTask -Action $taskAction -Trigger @($dailyTrigger, $logonTrigger) -Settings $settings -Principal $principal

if ($existing) {
  Set-ScheduledTask -TaskName $TaskName -Action $taskAction -Trigger @($dailyTrigger, $logonTrigger) -Settings $settings -Principal $principal | Out-Null
  Write-Host "Personal_Web shared backup pull task updated."
} else {
  Register-ScheduledTask -TaskName $TaskName -InputObject $definition | Out-Null
  Write-Host "Personal_Web shared backup pull task installed."
}

$readBack = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
if (-not (Test-ExistingTaskBelongsToRepository -Task $readBack)) {
  throw "scheduled_task_readback_mismatch"
}
