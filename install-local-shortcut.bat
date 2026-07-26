@echo off
setlocal

set "REPO_ROOT=%~dp0"
set "INSTALLER=%REPO_ROOT%install-shared-shortcut.bat"

echo Personal_Web desktop shortcut default is now shared-remote development.
echo This compatibility installer will create Personal Web.lnk for start-shared-dev.bat.
echo Local development remains available manually through start-local-dev.bat.
echo.

if not exist "%INSTALLER%" (
  echo Failed to create shared development shortcut.
  echo Missing installer:
  echo %INSTALLER%
  echo.
  echo Please send a screenshot of this window to ChatGPT.
  echo.
  pause
  exit /b 1
)

call "%INSTALLER%"

if errorlevel 1 (
  echo.
  echo Failed to create shared development shortcut.
  echo Please send a screenshot of this window to ChatGPT.
  echo.
  pause
  exit /b 1
)

pause
