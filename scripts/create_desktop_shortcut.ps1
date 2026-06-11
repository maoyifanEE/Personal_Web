$ErrorActionPreference = "Stop"

# Creates a Windows desktop shortcut that opens the local Personal_Web homepage.
# Recreate the shortcut if this project folder moves, because .lnk files store paths.
# Do not commit the generated Personal_Web.lnk file.

Write-Host "[Personal_Web] Starting desktop shortcut creation..."

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptDirectory "..")
$indexPath = Join-Path $projectRoot "index.html"
$shortcutIconPath = Join-Path $projectRoot "assets\shortcut-icon-current.ico"
$shortcutIconSourcePath = Join-Path $projectRoot "assets\icon.jpg"

Write-Host "[Personal_Web] Script directory: $scriptDirectory"
Write-Host "[Personal_Web] Project root: $($projectRoot.Path)"
Write-Host "[Personal_Web] Homepage path: $indexPath"
Write-Host "[Personal_Web] Shortcut icon source: $shortcutIconSourcePath"
Write-Host "[Personal_Web] Shortcut icon path: $shortcutIconPath"

if (-not (Test-Path -LiteralPath $indexPath)) {
    Write-Error "[Personal_Web] index.html was not found in the project root."
    exit 1
}

if (-not (Test-Path -LiteralPath $shortcutIconPath)) {
    Write-Error "[Personal_Web] Shortcut icon was not found in assets."
    exit 1
}

if (-not (Test-Path -LiteralPath $shortcutIconSourcePath)) {
    Write-Error "[Personal_Web] Shortcut icon source image was not found in assets."
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
$shortcut.IconLocation = $shortcutIconPath
$shortcut.Save()

Write-Host "[Personal_Web] Desktop shortcut created successfully."
