param(
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if (-not $OutputPath) {
  $desktop = [Environment]::GetFolderPath("Desktop")
  $OutputPath = Join-Path $desktop "Personal_Web_Local_Start.cmd"
}

$launcherDirectory = Split-Path $OutputPath -Parent
if ($launcherDirectory) {
  New-Item -ItemType Directory -Force -Path $launcherDirectory | Out-Null
}

$content = @"
@echo off
setlocal
cd /d "$repoRoot"
call "$repoRoot\start-local-dev.bat" %*
"@

$content | Out-File -FilePath $OutputPath -Encoding ascii

Write-Host "Portable Personal_Web launcher created:"
Write-Host $OutputPath
Write-Host ""
Write-Host "Embedded repository path:"
Write-Host $repoRoot
