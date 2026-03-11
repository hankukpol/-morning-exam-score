@echo off
setlocal

if /I "%~1"=="--help" goto :help
if /I "%~1"=="/?" goto :help

set "ROOT=%~dp0"
set "APP_DIR=%ROOT%web"
set "ENV_FILE=%APP_DIR%\.env.local"

cd /d "%ROOT%" || (
  echo Failed to enter the repository root.
  exit /b 1
)

for /f "delims=" %%I in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "BRANCH=%%I"
if not defined BRANCH (
  echo Git repository was not detected.
  exit /b 1
)

set "MESSAGE=%~1"
if "%MESSAGE%"=="" set "MESSAGE=deploy: %DATE% %TIME%"

echo [1/3] GitHub push
echo Branch: %BRANCH%
echo Commit message: %MESSAGE%
echo.

git add -A
if errorlevel 1 exit /b %ERRORLEVEL%

git diff --cached --quiet
if errorlevel 1 (
  git commit -m "%MESSAGE%"
  if errorlevel 1 exit /b %ERRORLEVEL%
) else (
  echo No staged changes to commit. Continuing with push.
)

git push origin %BRANCH%
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo [2/3] Supabase deployment
cd /d "%APP_DIR%" || (
  echo Failed to enter the web directory.
  exit /b 1
)

if not exist "%ENV_FILE%" (
  echo Missing %ENV_FILE%
  echo Copy web\.env.example to web\.env.local and fill the database values first.
  exit /b 1
)

call :load_env_file "%ENV_FILE%"
if errorlevel 1 exit /b %ERRORLEVEL%

if "%DATABASE_URL%"=="" (
  echo DATABASE_URL is not configured in web\.env.local.
  exit /b 1
)

if "%DIRECT_URL%"=="" (
  echo DIRECT_URL is not configured in web\.env.local.
  exit /b 1
)

call npx prisma migrate deploy
if errorlevel 1 exit /b %ERRORLEVEL%

if exist "supabase\migrations\202603080002_admin_rls.sql" (
  call npx prisma db execute --file "supabase\migrations\202603080002_admin_rls.sql" --schema "prisma\schema.prisma"
  if errorlevel 1 exit /b %ERRORLEVEL%
)

echo.
echo [3/3] Vercel deployment

if not exist ".vercel\project.json" (
  echo Missing web\.vercel\project.json.
  echo Run ^`vercel link^` in the web directory first.
  exit /b 1
)

set "USERPROFILE=%CD%"
set "HOME=%CD%"

call npx --yes vercel --prod --yes
exit /b %ERRORLEVEL%

:load_env_file
for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$path = '%~1';" ^
  "Get-Content -LiteralPath $path | ForEach-Object {" ^
  "  if (-not $_) { return }" ^
  "  if ($_.Trim().StartsWith('#')) { return }" ^
  "  if ($_ -match '^\s*([^=]+)=(.*)$') {" ^
  "    $name = $matches[1].Trim();" ^
  "    $value = $matches[2].Trim();" ^
  "    if ($value.StartsWith('\"') -and $value.EndsWith('\"')) { $value = $value.Substring(1, $value.Length - 2) }" ^
  "    Write-Output ('set ' + $name + '=' + $value)" ^
  "  }" ^
  "}"`) do %%I
exit /b 0

:help
echo Usage: deploy.bat [commit-message]
echo.
echo This script runs:
echo   1. git add, commit, push
echo   2. Prisma migration deploy to Supabase
echo   3. Vercel production deploy
echo.
echo Requirements:
echo   1. Git push permission is available
echo   2. web\.env.local contains DATABASE_URL and DIRECT_URL
echo   3. web\.vercel\project.json already exists
echo   4. Vercel CLI login is already completed
exit /b 0
