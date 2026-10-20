#!/usr/bin/env bash
# Donorbook — Mac/Linux Dev Environment Setup
# Usage: bash scripts/setup.sh

set -e
cd "$(dirname "$0")/.."

echo ""
echo "======================================"
echo "  Donorbook — Dev Environment Setup"
echo "======================================"
echo ""

# ── 1. Check Node.js ──────────────────────────────────────────────────────────
echo "[1/5] Checking Node.js..."
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js not found. Install from: https://nodejs.org"
  exit 1
fi
NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "ERROR: Node.js $(node --version) found but v18+ is required."
  exit 1
fi
echo "OK: Node.js $(node --version)"

# ── 2. Check npm ──────────────────────────────────────────────────────────────
echo "[2/5] Checking npm..."
if ! command -v npm &>/dev/null; then
  echo "ERROR: npm not found."
  exit 1
fi
echo "OK: npm $(npm --version)"

# ── 3. Check .env files ───────────────────────────────────────────────────────
echo "[3/5] Checking environment files..."

if [ ! -f ".env" ]; then
  echo "ERROR: .env not found. Copy .env.example to .env and fill in values."
  exit 1
fi
if grep -q "PASTE_YOUR" .env; then
  echo "ERROR: .env still has placeholder values. Fill in your Supabase keys."
  exit 1
fi
echo "OK: .env found and configured"

if [ ! -f ".env.local" ]; then
  echo "ERROR: .env.local not found. Create it with SUPABASE_SERVICE_ROLE_KEY=..."
  exit 1
fi
if grep -q "PASTE_YOUR" .env.local; then
  echo "ERROR: .env.local still has placeholder value. Add your Supabase service role key."
  exit 1
fi
echo "OK: .env.local found and configured"

# ── 4. Install dependencies ───────────────────────────────────────────────────
echo "[4/5] Installing dependencies..."
npm install
echo "OK: Dependencies installed"

# ── 5. Verify vite binary ─────────────────────────────────────────────────────
echo "[5/5] Verifying vite binary..."
if [ ! -f "node_modules/.bin/vite" ]; then
  echo "ERROR: vite binary not found in node_modules/.bin"
  exit 1
fi
echo "OK: vite binary ready"

echo ""
echo "======================================"
echo "  Setup complete! Starting dev server"
echo "======================================"
echo ""
echo "App will be available at: http://localhost:3000"
echo "Press Ctrl+C to stop."
echo ""

npm run dev
