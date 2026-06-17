@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "TARGET=%SCRIPT_DIR%scripts\verify-self-tests.ps1"

where pwsh >nul 2>nul
if %ERRORLEVEL%==0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%TARGET%" %*
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%TARGET%" %*
)

exit /b %ERRORLEVEL%
