#!/bin/bash
# ============================================================
# Titan GEO Core — Quick Update Script
# Führe dieses Script auf dem Server aus nach jedem Upload
# Usage: ./update-server.sh
# ============================================================

set -e

echo "=== Titan GEO Core — Update ==="

cd /var/www/titan-geo-core

echo "[1/5] Dependencies installieren..."
npm install --production

echo "[2/5] Prisma generieren..."
npx prisma generate

echo "[3/5] Datenbank synchronisieren..."
npx prisma db push --accept-data-loss

echo "[4/5] App bauen..."
npm run build

echo "[5/5] App neustarten..."
pm2 restart titan-geo-core || pm2 start ecosystem.config.cjs

pm2 save

echo ""
echo "✓ Update abgeschlossen!"
echo "  Status: pm2 status"
echo "  Logs:   pm2 logs titan-geo-core"
echo ""
