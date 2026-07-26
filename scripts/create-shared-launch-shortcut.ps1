param(
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

$shortcutName = "Personal Web.lnk"
$oldLocalShortcutName = "Personal Web Local.lnk"
$shortcutDescription = "Start Personal_Web shared development environment"
$iconLocation = "$env:SystemRoot\System32\shell32.dll,220"

function Write-ShortcutLog {
  param([string]$Message)

  $line = "[Personal_Web shortcut] $Message"
  Write-Host $line
  if ($script:ShortcutLogPath) {
    Add-Content -LiteralPath $script:ShortcutLogPath -Value $line -Encoding utf8
  }
}

function Initialize-ShortcutLog {
  param([string]$RepositoryRoot)

  $logDir = Join-Path $RepositoryRoot ".local_logs\launcher"
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  Get-ChildItem -LiteralPath $logDir -Filter "install-shared-shortcut-*.log" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTimeUtc -lt (Get-Date).ToUniversalTime().AddDays(-7) } |
    Remove-Item -Force -ErrorAction SilentlyContinue
  $script:ShortcutLogPath = Join-Path $logDir ("install-shared-shortcut-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
  New-Item -ItemType File -Path $script:ShortcutLogPath -Force | Out-Null
}

function Get-ResolvedFilePath {
  param([string]$Path)

  if (-not $Path) {
    return ""
  }
  try {
    return (Resolve-Path -LiteralPath $Path -ErrorAction Stop).Path
  } catch {
    return [System.IO.Path]::GetFullPath($Path)
  }
}

function New-ShortcutComObject {
  return New-Object -ComObject WScript.Shell
}

function Read-Shortcut {
  param(
    [__ComObject]$Shell,
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $null
  }
  if ([System.IO.Path]::GetExtension($Path) -ine ".lnk") {
    return $null
  }
  return $Shell.CreateShortcut($Path)
}

function Test-ShortcutMatches {
  param(
    [object]$Shortcut,
    [string]$TargetPath,
    [string]$WorkingDirectory,
    [string]$Arguments = ""
  )

  if (-not $Shortcut) {
    return $false
  }

  $actualTarget = Get-ResolvedFilePath $Shortcut.TargetPath
  $actualWorkingDirectory = Get-ResolvedFilePath $Shortcut.WorkingDirectory
  $expectedTarget = Get-ResolvedFilePath $TargetPath
  $expectedWorkingDirectory = Get-ResolvedFilePath $WorkingDirectory

  return (
    $actualTarget -ieq $expectedTarget -and
    $actualWorkingDirectory -ieq $expectedWorkingDirectory -and
    [string]$Shortcut.Arguments -eq $Arguments
  )
}

function Test-ShortcutBelongsToRepository {
  param(
    [object]$Shortcut,
    [string]$RepositoryRoot,
    [string[]]$AllowedTargets
  )

  if (-not $Shortcut) {
    return $false
  }

  $actualWorkingDirectory = Get-ResolvedFilePath $Shortcut.WorkingDirectory
  $expectedWorkingDirectory = Get-ResolvedFilePath $RepositoryRoot
  if ($actualWorkingDirectory -ine $expectedWorkingDirectory) {
    return $false
  }

  $actualTarget = Get-ResolvedFilePath $Shortcut.TargetPath
  foreach ($target in $AllowedTargets) {
    if ($actualTarget -ieq (Get-ResolvedFilePath $target)) {
      return $true
    }
  }
  return $false
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
Initialize-ShortcutLog -RepositoryRoot $repoRoot

$sharedBatPath = Join-Path $repoRoot "start-shared-dev.bat"
$localBatPath = Join-Path $repoRoot "start-local-dev.bat"

if (-not (Test-Path -LiteralPath $sharedBatPath -PathType Leaf)) {
  throw "start-shared-dev.bat is not a regular file"
}
$sharedBatPath = (Get-Item -LiteralPath $sharedBatPath -ErrorAction Stop).FullName

if (-not (Test-Path -LiteralPath $localBatPath -PathType Leaf)) {
  throw "start-local-dev.bat not found; local fallback must remain available"
}
$localBatPath = (Get-Item -LiteralPath $localBatPath -ErrorAction Stop).FullName

$desktop = [Environment]::GetFolderPath("Desktop")
if (-not $desktop) {
  throw "Desktop folder could not be resolved"
}

if (-not $OutputPath) {
  $OutputPath = Join-Path $desktop $shortcutName
}

$shortcutDirectory = Split-Path -Path $OutputPath -Parent
if (-not $shortcutDirectory) {
  throw "Shortcut output directory could not be resolved"
}
New-Item -ItemType Directory -Force -Path $shortcutDirectory | Out-Null

$shell = New-ShortcutComObject
$oldLocalShortcutPath = Join-Path $desktop $oldLocalShortcutName
$existingShortcut = Read-Shortcut -Shell $shell -Path $OutputPath
$oldLocalShortcut = Read-Shortcut -Shell $shell -Path $oldLocalShortcutPath
$allowedRepoTargets = @($sharedBatPath, $localBatPath)

Write-ShortcutLog "Repository root: $repoRoot"
Write-ShortcutLog "Desktop folder: $desktop"
Write-ShortcutLog "Shortcut path: $OutputPath"
Write-ShortcutLog "Shared launcher target: $sharedBatPath"

if ($existingShortcut) {
  $isAlreadyCorrect = Test-ShortcutMatches -Shortcut $existingShortcut -TargetPath $sharedBatPath -WorkingDirectory $repoRoot -Arguments ""
  $belongsToRepository = Test-ShortcutBelongsToRepository -Shortcut $existingShortcut -RepositoryRoot $repoRoot -AllowedTargets $allowedRepoTargets
  Write-ShortcutLog "Existing Personal Web shortcut already correct: $isAlreadyCorrect"
  Write-ShortcutLog "Existing Personal Web shortcut belongs to repository: $belongsToRepository"
  if (-not $isAlreadyCorrect -and -not $belongsToRepository) {
    throw "Refusing to overwrite unrelated Personal Web.lnk"
  }
}

if ($oldLocalShortcut) {
  $oldLocalMatches = Test-ShortcutMatches -Shortcut $oldLocalShortcut -TargetPath $localBatPath -WorkingDirectory $repoRoot -Arguments ""
  Write-ShortcutLog "Old local shortcut exact match: $oldLocalMatches"
  if ($oldLocalMatches) {
    Remove-Item -LiteralPath $oldLocalShortcutPath -Force
    Write-ShortcutLog "Removed old generated local shortcut: $oldLocalShortcutPath"
  } else {
    Write-ShortcutLog "Preserved nonmatching old local shortcut: $oldLocalShortcutPath"
  }
} else {
  Write-ShortcutLog "Old local shortcut not present"
}

$tempPath = Join-Path $shortcutDirectory ("{0}.{1}.tmp.lnk" -f $shortcutName, [guid]::NewGuid().ToString("N"))
$shortcut = $shell.CreateShortcut($tempPath)
$shortcut.TargetPath = $sharedBatPath
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Arguments = ""
$shortcut.Description = $shortcutDescription
$shortcut.IconLocation = $iconLocation
$shortcut.Save()

$tempShortcut = Read-Shortcut -Shell $shell -Path $tempPath
if (-not (Test-ShortcutMatches -Shortcut $tempShortcut -TargetPath $sharedBatPath -WorkingDirectory $repoRoot -Arguments "")) {
  Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
  throw "Temporary shortcut verification failed"
}

Move-Item -LiteralPath $tempPath -Destination $OutputPath -Force

$verifiedShortcut = Read-Shortcut -Shell $shell -Path $OutputPath
if (-not (Test-ShortcutMatches -Shortcut $verifiedShortcut -TargetPath $sharedBatPath -WorkingDirectory $repoRoot -Arguments "")) {
  throw "Installed shortcut verification failed"
}
if ([string]$verifiedShortcut.Description -ne $shortcutDescription) {
  throw "Installed shortcut description verification failed"
}

Write-ShortcutLog "Target verification: pass"
Write-ShortcutLog "Working-directory verification: pass"
Write-ShortcutLog "Arguments verification: pass"
Write-ShortcutLog "Description verification: pass"
Write-ShortcutLog "Shortcut install success"

Write-Host ""
Write-Host "Personal_Web shared shortcut created:"
Write-Host $OutputPath
Write-Host ""
Write-Host "Target:"
Write-Host $sharedBatPath
Write-Host ""
Write-Host "Working directory:"
Write-Host $repoRoot
Write-Host ""
Write-Host "Arguments:"
Write-Host "(none)"
Write-Host ""
Write-Host "Description:"
Write-Host $shortcutDescription
Write-Host ""
Write-Host "Icon:"
Write-Host $iconLocation
Write-Host ""
Write-Host "You can move the shortcut itself, but if the project folder moves, run install-shared-shortcut.bat again."
