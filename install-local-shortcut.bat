@echo off
setlocal

set "REPO_ROOT=%~dp0"
set "INSTALL_SCRIPT=%REPO_ROOT%scripts\install-local-shortcut.ps1"

if not exist "%INSTALL_SCRIPT%" (
  echo Failed to create shortcut.
  echo Missing script:
  echo %INSTALL_SCRIPT%
  echo.
  echo Please send a screenshot of this window to ChatGPT.
  echo.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_SCRIPT%"

if errorlevel 1 (
  echo.
  echo Failed to create shortcut.
  echo Please send a screenshot of this window to ChatGPT.
  echo.
  pause
  exit /b 1
)

pause
