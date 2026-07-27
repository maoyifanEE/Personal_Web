@echo off
setlocal

set "REPO_ROOT=%~dp0"
cd /d "%REPO_ROOT%"

if "%~1"=="" goto run_default
if /I "%~1"=="keep-session" if "%~2"=="" goto run_keep
if /I "%~1"=="--help" if "%~2"=="" goto show_help
if /I "%~1"=="/?" if "%~2"=="" goto show_help
goto invalid_arguments

:run_default
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO_ROOT%scripts\start-local-dev.ps1"
goto finish

:run_keep
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO_ROOT%scripts\start-local-dev.ps1" -KeepSession
goto finish

:show_help
echo Personal_Web local development launcher
echo Usage: start-local-dev.bat [keep-session]
echo        start-local-dev.bat --help
exit /b 0

:invalid_arguments
echo Unknown or unsupported argument: %~1
echo Usage: start-local-dev.bat [keep-session]
echo        start-local-dev.bat --help
exit /b 2

:finish
echo.
echo Press any key to close this launcher window.
pause >nul
