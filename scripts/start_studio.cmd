@echo off
setlocal
set "NODE_EXE=%~dp0..\runtime\node\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"
"%NODE_EXE%" --version >nul 2>nul
if errorlevel 1 (
  echo Node.js chua duoc cai. Hay cai Node.js 24 LTS va mo lai.
  pause
  exit /b 1
)
"%NODE_EXE%" "%~dp0launch_studio.js" %*
if errorlevel 1 (
  pause
  exit /b 1
)
endlocal
