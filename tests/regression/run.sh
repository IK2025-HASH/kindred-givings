#!/usr/bin/env bash
# GiveWell Platform — Regression Suite Launcher (Unix/Mac)
# Usage: ./run.sh [BASE_URL]
# Example: ./run.sh http://localhost:5173

cd "$(dirname "$0")"

[ -n "$1" ] && export BASE_URL="$1"

echo ""
echo "========================================="
echo " GiveWell Regression Suite"
echo "========================================="
echo ""

python runner.py
