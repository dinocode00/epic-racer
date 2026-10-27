@echo off
rem Double-click to start Epic Racer (Windows).
rem Uses Node 22+ if installed, otherwise downloads a private copy into .tools\ (no admin needed).
cd /d "%~dp0"
set "NODE="
where node >nul 2>nul && node -e "process.exit(parseInt(process.versions.node) >= 22 ? 0 : 1)" >nul 2>nul && set "NODE=node"
if not defined NODE if exist ".tools\node\node.exe" set "NODE=.tools\node\node.exe"
if not defined NODE (
  echo.
  echo   Epic Racer needs Node.js. Downloading a private copy ^(about 30 MB, one time only^)...
  powershell -NoProfile -ExecutionPolicy Bypass -File tools\get-node.ps1 || goto :failed
  set "NODE=.tools\node\node.exe"
)
"%NODE%" tools\launch.mjs || goto :failed
exit /b 0
:failed
echo.
pause
exit /b 1
