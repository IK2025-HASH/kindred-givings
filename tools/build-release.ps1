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
  [string]$Version = "v1.2.0",
  [string]$RepoUrl = "",
  [string]$BuildDir = "C:\temp\donorbook-build"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Donorbook Release Build  |  $Version" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Prompt for repo URL if not provided
if ($RepoUrl -eq "") {
  $RepoUrl = Read-Host "  GitHub repo URL (e.g. https://github.com/networklogic-uk/donorbook)"
}

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$CloneDir  = "$BuildDir-$Timestamp"
$OutputZip = "$env:USERPROFILE\Desktop\donorbook-dist-$Version.zip"

Write-Host ""
Write-Host "[1/4] Cloning $RepoUrl into $CloneDir ..." -ForegroundColor Yellow
git clone $RepoUrl $CloneDir
Write-Host "      OK - cloned" -ForegroundColor Green

Write-Host "[2/4] Installing dependencies (npm ci)..." -ForegroundColor Yellow
Push-Location $CloneDir
npm ci --silent
Write-Host "      OK - dependencies installed" -ForegroundColor Green

Write-Host "[3/4] Building app (npm run build)..." -ForegroundColor Yellow
npm run build
Write-Host "      OK - build complete (dist/ ready)" -ForegroundColor Green

Write-Host "[4/4] Creating $OutputZip ..." -ForegroundColor Yellow
Pop-Location
Compress-Archive -Path "$CloneDir\dist\*" -DestinationPath $OutputZip -Force
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
