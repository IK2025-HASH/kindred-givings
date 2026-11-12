@echo off
title Donorbook Regression Suite
echo.
echo =========================================
echo  Donorbook -- Regression Test Suite
echo =========================================
echo.

REM ── App target ────────────────────────────────────────────────
set BASE_URL=http://localhost:8080
set GIVING_SLUG=kindred

REM ── Admin credentials ─────────────────────────────────────────
set ADMIN_EMAIL=ilyas@networklogic.uk
set ADMIN_PASSWORD=

REM ── Org user (for J5 / J9) ────────────────────────────────────
set ORG_EMAIL=ilyas@networklogic.uk
set ORG_PASSWORD=

REM ── Support agent (J2 — optional, skip if blank) ──────────────
set AGENT_EMAIL=
set AGENT_PASSWORD=

REM ── New user seed (J3/J4 registration tests) ──────────────────
set NEW_USER_PREFIX=regression
set NEW_USER_DOMAIN=example.com
set NEW_USER_PASS=Test1234!

REM ── Browser options ───────────────────────────────────────────
set BROWSER=chrome
set HEADLESS=false
set SCREENSHOT_ON_FAIL=true

REM ── Check password is set ─────────────────────────────────────
if "%ADMIN_PASSWORD%"=="" (
    echo ERROR: ADMIN_PASSWORD is not set.
    echo Edit run-regression.bat and fill in ADMIN_PASSWORD before running.
    pause
    exit /b 1
)

cd /d "%~dp0\tests\regression"

echo Installing dependencies...
pip install -r requirements.txt --quiet

echo.
echo Starting regression run...
echo Target : %BASE_URL%
echo Admin  : %ADMIN_EMAIL%
echo Browser: %BROWSER% ^(headless=%HEADLESS%^)
echo.

python runner.py

echo.
echo Done. Check tests\regression\reports\ for the HTML report.
pause
