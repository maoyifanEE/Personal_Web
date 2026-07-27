$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$shortcutScript = Join-Path $repoRoot "scripts\create-shared-launch-shortcut.ps1"

Write-Host ""
Write-Host "Creating Personal Web work handoff and shared development desktop shortcut..."
Write-Host ""

try {
  & $shortcutScript
  if (-not $?) {
    throw "Shared shortcut script failed"
  }

  Write-Host ""
  Write-Host "Shortcut created successfully."
  Write-Host "Double-click Personal Web on the Desktop to synchronize work, then start shared-remote development."
  Write-Host "If the project folder moves, rerun install-shared-shortcut.bat."
  Write-Host ""
} catch {
  Write-Host ""
  Write-Host "Shortcut creation failed."
  Write-Host $_.Exception.Message
  Write-Host "Please send a screenshot of this window to ChatGPT."
  Write-Host ""
  exit 1
}
