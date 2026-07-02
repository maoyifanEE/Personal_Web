@echo off
setlocal

set "REPO_ROOT=%~dp0"
cd /d "%REPO_ROOT%"

if /I "%~1"=="keep-session" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO_ROOT%scripts\start-local-dev.ps1" -KeepSession
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO_ROOT%scripts\start-local-dev.ps1" %*
)

echo.
echo Press any key to close this launcher window.
pause >nul
