@echo off
setlocal

if /I "%~1"=="--help" goto :usage
if /I "%~1"=="/?" goto :usage

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-shared-dev.ps1" %*
exit /b %ERRORLEVEL%

:usage
echo Personal_Web shared remote development launcher
echo Usage: start-shared-dev.bat [keep-session] [-DryRun] [-ValidateOnly] [-SecretPath path] [-FakeSshExe path]
exit /b 0
