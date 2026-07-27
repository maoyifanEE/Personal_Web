@echo off
setlocal

set "REPO_ROOT=%~dp0"
set "ARG1=%~1"
set "ARG2=%~2"
set "LAUNCHER_EXIT=0"
cd /d "%REPO_ROOT%"

if "%ARG1%"=="" goto run_default
if /I "%ARG1%"=="keep-session" if "%ARG2%"=="" goto run_keep
if /I "%ARG1%"=="--help" if "%ARG2%"=="" goto show_help
if /I "%ARG1%"=="/?" if "%ARG2%"=="" goto show_help
goto invalid_arguments

:run_default
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO_ROOT%scripts\start-local-dev.ps1"
set "LAUNCHER_EXIT=%ERRORLEVEL%"
goto finish

:run_keep
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO_ROOT%scripts\start-local-dev.ps1" -KeepSession
set "LAUNCHER_EXIT=%ERRORLEVEL%"
goto finish

:show_help
echo Personal_Web local development launcher
echo Usage: start-local-dev.bat
echo        start-local-dev.bat keep-session
echo        start-local-dev.bat --help
echo        start-local-dev.bat /?
exit /b 0

:invalid_arguments
echo Unknown or unsupported launcher arguments.
echo Usage: start-local-dev.bat
echo        start-local-dev.bat keep-session
echo        start-local-dev.bat --help
echo        start-local-dev.bat /?
exit /b 2

:finish
echo.
echo Press any key to close this launcher window.
pause >nul
exit /b %LAUNCHER_EXIT%
