@echo off
setlocal
cd /d "%~dp0"
title Personal_Web

set "START_SCRIPT=%~dp0start-shared-dev.bat"
set "ARG1=%~1"
set "ARG2=%~2"

if not "%ARG2%"=="" goto :usage_error

if /I "%ARG1%"=="--help" goto :usage
if /I "%ARG1%"=="/?" goto :usage

if "%ARG1%"=="" goto :run_shared_dev

goto :usage_error

:run_shared_dev
if not exist "%START_SCRIPT%" goto :missing_start_script
call "%START_SCRIPT%"
set "START_EXIT=%ERRORLEVEL%"
if not "%START_EXIT%"=="0" goto :startup_error
exit /b 0

:usage
echo Personal_Web launcher
echo Usage: work-handoff.bat
echo        work-handoff.bat --help
echo.
echo Starts shared development and opens the local Personal_Web site.
exit /b 0

:usage_error
echo Personal_Web launcher
echo Usage: work-handoff.bat --help
exit /b 2

:startup_error
echo Personal_Web could not start shared development.
echo Exit code: %START_EXIT%
echo.
echo The startup launcher returned a nonzero exit code.
echo.
echo Press any key to close this window.
pause >nul
exit /b %START_EXIT%

:missing_start_script
echo Personal_Web could not start shared development.
echo Required startup launcher is missing.
echo.
echo Press any key to close this window.
pause >nul
exit /b 3
