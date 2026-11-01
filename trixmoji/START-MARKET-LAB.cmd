@echo off
setlocal
cd /d "%~dp0"
echo TRIXMOJI MARKET LAB - LOCAL FAKE ETH ONLY
echo Open http://127.0.0.1:8895 after the server starts.
echo Do not connect a real wallet or send real assets.
if not exist node_modules (
  call npm ci --ignore-scripts
  if errorlevel 1 exit /b 1
)
call npm run sandbox
pause
