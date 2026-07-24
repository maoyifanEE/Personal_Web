@echo off
setlocal

set "ARGS="

if "%~1"=="" goto :run

:parse
if "%~1"=="" goto :run
if /I "%~1"=="--help" goto :usage
if /I "%~1"=="/?" goto :usage
if /I "%~1"=="keep-session" (
  set "ARGS=%ARGS% -KeepSession"
  shift
  goto :parse
)
echo Unknown argument: %~1
goto :usage_error

:run
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-shared-dev.ps1" %ARGS%
exit /b %ERRORLEVEL%

:usage
echo Personal_Web shared remote development launcher
echo Usage: start-shared-dev.bat [keep-session]
echo        start-shared-dev.bat --help
exit /b 0

:usage_error
echo Personal_Web shared remote development launcher
echo Usage: start-shared-dev.bat [keep-session]
echo        start-shared-dev.bat --help
exit /b 2
