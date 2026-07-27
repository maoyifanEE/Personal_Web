@echo off
setlocal

set "REPO_ROOT=%~dp0"
set "HANDOFF_SCRIPT=%REPO_ROOT%scripts\work-handoff.ps1"

if not exist "%HANDOFF_SCRIPT%" (
  echo Personal_Web work handoff launcher failed.
  echo Missing script:
  echo %HANDOFF_SCRIPT%
  exit /b 1
)

if /I "%~1"=="--help" goto :usage
if /I "%~1"=="/?" goto :usage

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%HANDOFF_SCRIPT%" %*
exit /b %ERRORLEVEL%

:usage
echo Personal_Web work handoff launcher
echo Usage: work-handoff.bat
echo        work-handoff.bat -Action Status
echo        work-handoff.bat -Action EndAndHandoff
echo        work-handoff.bat -Action SyncAndStart
exit /b 0
