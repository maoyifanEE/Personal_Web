@echo off
setlocal

if /I "%~1"=="--help" goto :usage
if /I "%~1"=="/?" goto :usage
if not "%~1"=="" goto :usage_error

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-shared-dev.ps1"
exit /b %ERRORLEVEL%

:usage
echo Personal_Web shared remote development stop
echo Usage: stop-shared-dev.bat
exit /b 0

:usage_error
echo Unknown argument: %~1
echo Usage: stop-shared-dev.bat
exit /b 2
