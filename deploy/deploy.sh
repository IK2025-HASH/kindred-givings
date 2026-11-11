#!/usr/bin/env bash
# deploy.sh — Build and push Kindred Givings to Hostinger VPS
# Usage: ./deploy/deploy.sh [user@vps-ip]
# Example: ./deploy/deploy.sh root@91.108.4.xxx
set -e

VPS="${1:-root@YOUR_VPS_IP}"
REMOTE_DIR="/var/www/kindred-givings"
APP_NAME="Kindred Givings"

echo "=== $APP_NAME — VPS Deploy ==="
echo "Target: $VPS:$REMOTE_DIR"
echo ""

# 1. Build
echo "[1/4] Building production bundle..."
npm run build

# 2. Create remote dir if needed
echo "[2/4] Preparing remote directory..."
ssh "$VPS" "mkdir -p $REMOTE_DIR"

# 3. Push dist/
echo "[3/4] Uploading dist/ to VPS..."
rsync -avz --delete dist/ "$VPS:$REMOTE_DIR/"

# 4. Reload Nginx
echo "[4/4] Reloading Nginx..."
ssh "$VPS" "nginx -t && systemctl reload nginx"

echo ""
echo "✓ Deploy complete."
