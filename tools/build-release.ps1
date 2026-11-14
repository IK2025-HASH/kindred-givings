# Donorbook Release Build Script
# Builds the app in a CLEAN TEMP CLONE — never touches donorbook-local.
#
# USAGE:
#   .\tools\build-release.ps1 -Version v1.2.0 -RepoUrl https://github.com/YOUR_ORG/donorbook
#
# After running, upload the produced dist.zip to a GitHub Release:
#   GitHub → Releases → New Release → tag vX.Y.Z → attach dist-vX.Y.Z.zip
#
param(
  [string]$Version = "v1.2.3",
  [string]$RepoUrl = "https://github.com/IK2025-HASH/kindred-givings.git",
  [string]$Branch = "app",
  [string]$BuildDir = "C:\temp\donorbook-build"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Donorbook Release Build  |  $Version" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$CloneDir  = "$BuildDir-$Timestamp"
$OutputZip = "$env:USERPROFILE\Desktop\donorbook-dist-$Version.zip"

Write-Host ""
Write-Host "[1/4] Cloning $RepoUrl (branch: $Branch) into $CloneDir ..." -ForegroundColor Yellow
git clone --branch $Branch --single-branch $RepoUrl $CloneDir
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: git clone failed (exit code $LASTEXITCODE)" -ForegroundColor Red
  Read-Host "Press Enter to close"
  exit 1
}
Write-Host "      OK - cloned" -ForegroundColor Green

Write-Host "[2/4] Installing dependencies (npm ci)..." -ForegroundColor Yellow
Push-Location $CloneDir
npm ci --silent
Write-Host "      OK - dependencies installed" -ForegroundColor Green

Write-Host "[3/4] Building app (npm run build) with Node.js server preset..." -ForegroundColor Yellow
$env:NITRO_PRESET = "node-server"
npm run build
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: Build failed (exit code $LASTEXITCODE)" -ForegroundColor Red
  Read-Host "Press Enter to close"
  exit 1
}
Write-Host "      OK - build complete (.output/ ready)" -ForegroundColor Green

Write-Host "[4/4] Creating $OutputZip ..." -ForegroundColor Yellow
Pop-Location
# TanStack Start builds to .output/ (server/ + public/ subdirs)
$OutputDir = "$CloneDir\.output"
if (-not (Test-Path $OutputDir)) {
  Write-Host "ERROR: Build output not found at $OutputDir" -ForegroundColor Red
  Write-Host "Contents of clone dir:" -ForegroundColor Yellow
  Get-ChildItem $CloneDir | Select-Object Name
  Read-Host "Press Enter to close"
  exit 1
}
Write-Host "      Staging output (excluding nan C++ headers not needed at runtime)..." -ForegroundColor DarkGray
$StagingDir = "$CloneDir\.output-staging"
New-Item -ItemType Directory -Force -Path $StagingDir | Out-Null

# Copy public/ as-is
if (Test-Path "$OutputDir\public") {
  Copy-Item "$OutputDir\public" "$StagingDir\public" -Recurse -Force
}

# Copy server/ — exclude nan (1MB C++ header-only package, not needed at Node.js runtime)
if (Test-Path "$OutputDir\server") {
  New-Item -ItemType Directory -Force -Path "$StagingDir\server" | Out-Null
  Get-ChildItem "$OutputDir\server" | ForEach-Object {
    if ($_.Name -eq "node_modules") {
      New-Item -ItemType Directory -Force -Path "$StagingDir\server\node_modules" | Out-Null
      Get-ChildItem "$OutputDir\server\node_modules" | Where-Object { $_.Name -ne "nan" } |
        Copy-Item -Destination "$StagingDir\server\node_modules" -Recurse -Force
    } else {
      Copy-Item $_.FullName "$StagingDir\server\$($_.Name)" -Recurse -Force
    }
  }
}

# Copy nitro.json if present
if (Test-Path "$OutputDir\nitro.json") {
  Copy-Item "$OutputDir\nitro.json" "$StagingDir\" -Force
}

Write-Host "      Zipping staging dir (server/ + public/)..." -ForegroundColor DarkGray
Compress-Archive -Path "$StagingDir\*" -DestinationPath $OutputZip -Force
Write-Host "      OK - $OutputZip created" -ForegroundColor Green

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  BUILD COMPLETE" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Next: upload to GitHub Release" -ForegroundColor Cyan
Write-Host "    1. Go to: $RepoUrl/releases/new" -ForegroundColor White
Write-Host "    2. Tag   : $Version" -ForegroundColor White
Write-Host "    3. Attach: $OutputZip" -ForegroundColor White
Write-Host "    4. Publish the release" -ForegroundColor White
Write-Host ""
Write-Host "  Temp clone left at: $CloneDir" -ForegroundColor DarkGray
Write-Host "  You can delete it once the release is published." -ForegroundColor DarkGray
Write-Host ""

Read-Host "Press Enter to close"
