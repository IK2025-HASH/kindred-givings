@echo off
REM GiveWell Platform — Regression Suite Launcher (Windows)
REM Usage: run.bat [BASE_URL]
REM Example: run.bat http://localhost:5173

cd /d "%~dp0"

if not "%1"=="" set BASE_URL=%1

echo.
echo =========================================
echo  GiveWell Regression Suite
echo =========================================
echo.

python runner.py
