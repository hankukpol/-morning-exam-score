@echo off
setlocal

if /I "%~1"=="--help" goto :help
if /I "%~1"=="/?" goto :help

set "ROOT=%~dp0"
cd /d "%ROOT%web" || (
  echo Failed to enter the web directory.
  exit /b 1
)

set "USERPROFILE=%CD%"
set "HOME=%CD%"
set "PORT=%~1"

if "%PORT%"=="" set "PORT=3000"

echo Starting Next.js dev server in "%CD%"
echo URL: http://localhost:%PORT%
echo Press Ctrl+C to stop.

call npm run dev -- --port %PORT%
exit /b %ERRORLEVEL%

:help
echo Usage: run-local-dev.bat [port]
echo.
echo Examples:
echo   run-local-dev.bat
echo   run-local-dev.bat 3001
exit /b 0
