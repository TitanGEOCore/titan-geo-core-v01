#!/bin/bash
set -e

echo "=== Titan GEO Core — VPS Deployment ==="

# 1. System-Update & Docker installieren (falls nicht vorhanden)
if ! command -v docker &> /dev/null; then
    echo ">> Docker installieren..."
    apt-get update && apt-get upgrade -y
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker && systemctl start docker
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo ">> Docker Compose installieren..."
    apt-get install -y docker-compose-plugin
fi

# 2. Firewall (UFW) konfigurieren
echo ">> Firewall konfigurieren..."
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw --force enable

# 3. .env prüfen
if [ ! -f .env ]; then
    echo "FEHLER: .env Datei nicht gefunden!"
    echo "Erstelle eine .env Datei mit folgendem Inhalt:"
    echo ""
    cat .env.example
    echo ""
    exit 1
fi

# 4. App bauen und starten
echo ">> Container bauen..."
docker compose build --no-cache

echo ">> Container starten..."
docker compose up -d

echo ""
echo "=== DEPLOYMENT ERFOLGREICH ==="
echo "App läuft auf: https://geo.titanwalls.de"
echo ""
echo "Nützliche Befehle:"
echo "  docker compose logs -f        # Logs anzeigen"
echo "  docker compose restart app    # App neustarten"
echo "  docker compose down           # Alles stoppen"
echo "  docker compose up -d --build  # Neu bauen & starten"
