# Donorbook — Windows Dev Environment Setup
# Run from the repo root: powershell -ExecutionPolicy Bypass -File scripts\setup.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Donorbook — Dev Environment Setup" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# ── 1. Check Node.js ──────────────────────────────────────────────────────────
Write-Host "[1/5] Checking Node.js..." -ForegroundColor Yellow
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js not found. Download from: https://nodejs.org" -ForegroundColor Red
    exit 1
}
$nodeVersion = (node --version 2>&1).ToString().Trim()
$major = [int]($nodeVersion -replace '^v(\d+)\..*', '$1')
if ($major -lt 18) {
    Write-Host "ERROR: Node.js $nodeVersion found but v18+ is required." -ForegroundColor Red
    Write-Host "Download from: https://nodejs.org" -ForegroundColor Red
    exit 1
}
Write-Host "OK: Node.js $nodeVersion" -ForegroundColor Green

# ── 2. Check npm ──────────────────────────────────────────────────────────────
Write-Host "[2/5] Checking npm..." -ForegroundColor Yellow
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: npm not found. Reinstall Node.js from: https://nodejs.org" -ForegroundColor Red
    exit 1
}
$npmVersion = (npm --version 2>&1).ToString().Trim()
Write-Host "OK: npm $npmVersion" -ForegroundColor Green

# ── 3. Check .env files ───────────────────────────────────────────────────────
Write-Host "[3/5] Checking environment files..." -ForegroundColor Yellow

if (-not (Test-Path ".env")) {
    Write-Host "ERROR: .env not found. Copy .env.example to .env and fill in values." -ForegroundColor Red
    exit 1
}
$envContent = Get-Content ".env" -Raw
if ($envContent -match "PASTE_YOUR") {
    Write-Host "ERROR: .env still has placeholder values. Fill in your Supabase keys." -ForegroundColor Red
    exit 1
}
Write-Host "OK: .env found and configured" -ForegroundColor Green

if (-not (Test-Path ".env.local")) {
    Write-Host "ERROR: .env.local not found. Create it with SUPABASE_SERVICE_ROLE_KEY=..." -ForegroundColor Red
    exit 1
}
$envLocalContent = Get-Content ".env.local" -Raw
if ($envLocalContent -match "PASTE_YOUR") {
    Write-Host "ERROR: .env.local still has placeholder value. Add your Supabase service role key." -ForegroundColor Red
    exit 1
}
Write-Host "OK: .env.local found and configured" -ForegroundColor Green

# ── 4. Install dependencies (npm creates node_modules/.bin correctly on Windows)
Write-Host "[4/5] Installing dependencies with npm..." -ForegroundColor Yellow
$ErrorActionPreference = "Continue"
npm install
$npmExitCode = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($npmExitCode -ne 0) {
    Write-Host "ERROR: npm install failed." -ForegroundColor Red
    exit 1
}
Write-Host "OK: Dependencies installed" -ForegroundColor Green

# ── 5. Verify vite binary ─────────────────────────────────────────────────────
Write-Host "[5/5] Verifying vite binary..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules\.bin\vite.cmd")) {
    Write-Host "ERROR: vite binary not found in node_modules\.bin" -ForegroundColor Red
    exit 1
}
Write-Host "OK: vite binary ready" -ForegroundColor Green

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "  Setup complete! Starting dev server" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "App will be available at: http://localhost:3000" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host ""

npm run dev
