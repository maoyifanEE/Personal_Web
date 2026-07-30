@echo off
setlocal
cd /d "%~dp0"
title Personal_Web Work Handoff

set "HANDOFF_SCRIPT=%~dp0scripts\work-handoff.ps1"
set "ARG1=%~1"
set "ARG2=%~2"

if /I "%ARG1%"=="--help" goto :usage
if /I "%ARG1%"=="/?" goto :usage

if not "%ARG2%"=="" goto :usage_error

if not exist "%HANDOFF_SCRIPT%" (
  if "%ARG1%"=="" goto :missing_script_ui
  goto :missing_script_cli
)

if "%ARG1%"=="" goto :run_ui
if /I "%ARG1%"=="status" goto :run_status
if /I "%ARG1%"=="sync" goto :run_sync
if /I "%ARG1%"=="sync-keep-session" goto :run_sync_keep_session
if /I "%ARG1%"=="handoff" goto :run_handoff

goto :usage_error

:run_ui
powershell.exe ^
  -NoLogo ^
  -NoProfile ^
  -ExecutionPolicy Bypass ^
  -Sta ^
  -File "%HANDOFF_SCRIPT%" ^
  -Action Ui
set "PS_EXIT=%ERRORLEVEL%"
if not "%PS_EXIT%"=="0" goto :ui_error
exit /b 0

:run_status
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%HANDOFF_SCRIPT%" -Action Status
exit /b %ERRORLEVEL%

:run_sync
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%HANDOFF_SCRIPT%" -Action SyncAndStart
exit /b %ERRORLEVEL%

:run_sync_keep_session
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%HANDOFF_SCRIPT%" -Action SyncAndStart -KeepSession
exit /b %ERRORLEVEL%

:run_handoff
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%HANDOFF_SCRIPT%" -Action EndAndHandoff
exit /b %ERRORLEVEL%

:usage
echo Personal_Web work handoff launcher
echo Usage: work-handoff.bat
echo        work-handoff.bat status
echo        work-handoff.bat sync
echo        work-handoff.bat sync-keep-session
echo        work-handoff.bat handoff
echo        work-handoff.bat --help
exit /b 0

:usage_error
echo Personal_Web work handoff launcher
echo Usage: work-handoff.bat --help
exit /b 2

:ui_error
echo Personal_Web work handoff could not start.
echo Exit code: %PS_EXIT%
echo.
echo Run this command from CMD for more information:
echo work-handoff.bat status
echo.
echo Press any key to close this window.
pause >nul
exit /b %PS_EXIT%

:missing_script_ui
echo Personal_Web work handoff could not start.
echo Required launcher script is missing.
echo.
echo Run this command from CMD for more information:
echo work-handoff.bat status
echo.
echo Press any key to close this window.
pause >nul
exit /b 3

:missing_script_cli
echo Personal_Web work handoff could not start.
echo Required launcher script is missing.
exit /b 3
