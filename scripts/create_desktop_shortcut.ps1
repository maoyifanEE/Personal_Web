$ErrorActionPreference = "Stop"

# Creates a Windows desktop shortcut that opens the local Personal_Web homepage.
# Recreate the shortcut if this project folder moves, because .lnk files store paths.
# Do not commit the generated Personal_Web.lnk file.

Write-Host "[Personal_Web] Starting desktop shortcut creation..."

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptDirectory "..")
$indexPath = Join-Path $projectRoot "index.html"

Write-Host "[Personal_Web] Script directory: $scriptDirectory"
Write-Host "[Personal_Web] Project root: $($projectRoot.Path)"
Write-Host "[Personal_Web] Homepage path: $indexPath"

if (-not (Test-Path -LiteralPath $indexPath)) {
    Write-Error "[Personal_Web] index.html was not found in the project root."
    exit 1
}

$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "Personal_Web.lnk"

Write-Host "[Personal_Web] Desktop path: $desktopPath"
Write-Host "[Personal_Web] Shortcut path: $shortcutPath"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)

$shortcut.TargetPath = "explorer.exe"
$shortcut.Arguments = "`"$indexPath`""
$shortcut.WorkingDirectory = $projectRoot.Path
$shortcut.Description = "Open Personal_Web homepage"
$shortcut.IconLocation = "explorer.exe,0"
$shortcut.Save()

Write-Host "[Personal_Web] Desktop shortcut created successfully."
