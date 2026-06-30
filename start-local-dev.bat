@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\start-local-dev.ps1"

echo.
echo Press any key to close this launcher window.
pause >nul
