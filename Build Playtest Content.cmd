@echo off
setlocal
cd /d "%~dp0"
echo Crows playtest content builder
echo First-time setup installs dependencies into tools\.venv.
echo You need Python 3.10 or newer and an extracted playtest packet.
echo.
if exist "tools\.venv\Scripts\python.exe" (
  "tools\.venv\Scripts\python.exe" tools\build_all.py --interactive
) else (
  where py >nul 2>nul
  if errorlevel 1 (
    python tools\build_all.py --interactive --setup
  ) else (
    py -3 tools\build_all.py --interactive --setup
  )
)
echo.
echo If Python was not found, install Python 3.10 or newer and run this file again.
pause
