@echo off
setlocal

set "REPO_ROOT=%~dp0"
set "HANDOFF_SCRIPT=%REPO_ROOT%scripts\work-handoff.ps1"
set "ARG1=%~1"
set "ARG2=%~2"
set "PS_ARGS="

if /I "%ARG1%"=="--help" goto :usage
if /I "%ARG1%"=="/?" goto :usage

if not "%ARG2%"=="" goto :usage_error

if not exist "%HANDOFF_SCRIPT%" (
  echo Personal_Web work handoff launcher failed.
  echo Missing script:
  echo %HANDOFF_SCRIPT%
  exit /b 1
)

if "%ARG1%"=="" (
  set "PS_ARGS=-Action Ui"
  goto :run
)
if /I "%ARG1%"=="status" (
  set "PS_ARGS=-Action Status"
  goto :run
)
if /I "%ARG1%"=="sync" (
  set "PS_ARGS=-Action SyncAndStart"
  goto :run
)
if /I "%ARG1%"=="sync-keep-session" (
  set "PS_ARGS=-Action SyncAndStart -KeepSession"
  goto :run
)
if /I "%ARG1%"=="handoff" (
  set "PS_ARGS=-Action EndAndHandoff"
  goto :run
)

goto :usage_error

:run
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HANDOFF_SCRIPT%" %PS_ARGS%
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
