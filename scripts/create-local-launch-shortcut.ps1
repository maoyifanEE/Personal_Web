param(
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$batPath = Join-Path $repoRoot "start-local-dev.bat"

if (-not (Test-Path $batPath)) {
  throw "start-local-dev.bat not found at $batPath"
}

if (-not $OutputPath) {
  $desktop = [Environment]::GetFolderPath("Desktop")
  $OutputPath = Join-Path $desktop "Personal Web Local.lnk"
}

$shortcutDirectory = Split-Path $OutputPath -Parent
if ($shortcutDirectory) {
  New-Item -ItemType Directory -Force -Path $shortcutDirectory | Out-Null
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($OutputPath)
$shortcut.TargetPath = $batPath
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Description = "Start Personal_Web local development environment"
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,220"
$shortcut.Save()

Write-Host "Personal_Web local shortcut created:"
Write-Host $OutputPath
Write-Host ""
Write-Host "Target:"
Write-Host $batPath
Write-Host ""
Write-Host "Working directory:"
Write-Host $repoRoot
