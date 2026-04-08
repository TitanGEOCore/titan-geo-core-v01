#!/bin/bash
# ============================================================
# Titan GEO Core — Server Deployment Script
# Für IONOS VPS / Ubuntu/Debian Server
# ============================================================
#
# ANLEITUNG:
# 1. Per SSH auf deinen IONOS Server verbinden
# 2. Dieses Script auf den Server kopieren
# 3. chmod +x deploy.sh
# 4. sudo ./deploy.sh
#
# ============================================================

set -e

echo "============================================"
echo "  Titan GEO Core — Server Setup"
echo "============================================"
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# ============================================================
# SCHRITT 1: System aktualisieren
# ============================================================
echo -e "${YELLOW}[1/8] System wird aktualisiert...${NC}"
apt update && apt upgrade -y
echo -e "${GREEN}✓ System aktualisiert${NC}"

# ============================================================
# SCHRITT 2: Node.js 20 installieren
# ============================================================
echo -e "${YELLOW}[2/8] Node.js 20 wird installiert...${NC}"
if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 18 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi
echo -e "${GREEN}✓ Node.js $(node -v) installiert${NC}"
echo -e "${GREEN}✓ npm $(npm -v) installiert${NC}"

# ============================================================
# SCHRITT 3: PM2 installieren
# ============================================================
echo -e "${YELLOW}[3/8] PM2 Process Manager wird installiert...${NC}"
npm install -g pm2
echo -e "${GREEN}✓ PM2 installiert${NC}"

# ============================================================
# SCHRITT 4: Nginx installieren
# ============================================================
echo -e "${YELLOW}[4/8] Nginx wird installiert...${NC}"
apt install -y nginx
systemctl enable nginx
systemctl start nginx
echo -e "${GREEN}✓ Nginx installiert und gestartet${NC}"

# ============================================================
# SCHRITT 5: PostgreSQL installieren
# ============================================================
echo -e "${YELLOW}[5/8] PostgreSQL wird installiert...${NC}"
apt install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql

echo -e "${YELLOW}  → Datenbank wird erstellt...${NC}"
sudo -u postgres psql -c "CREATE USER titan WITH PASSWORD 'titan_secure_pw';" 2>/dev/null || echo "  User existiert bereits"
sudo -u postgres psql -c "CREATE DATABASE titan_geo OWNER titan;" 2>/dev/null || echo "  Datenbank existiert bereits"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE titan_geo TO titan;" 2>/dev/null || true
sudo -u postgres psql -d titan_geo -c "GRANT ALL ON SCHEMA public TO titan;" 2>/dev/null || true
echo -e "${GREEN}✓ PostgreSQL installiert, Datenbank 'titan_geo' erstellt${NC}"

# ============================================================
# SCHRITT 6: App-Verzeichnis vorbereiten
# ============================================================
echo -e "${YELLOW}[6/8] App-Verzeichnis wird vorbereitet...${NC}"
mkdir -p /var/www/titan-geo-core
mkdir -p /var/log/titan-geo
echo -e "${GREEN}✓ Verzeichnisse erstellt${NC}"

# ============================================================
# SCHRITT 7: Nginx Config + SSL
# ============================================================
echo -e "${YELLOW}[7/8] Nginx + SSL wird eingerichtet...${NC}"
apt install -y certbot python3-certbot-nginx

# Temporäre HTTP-Config für Certbot
cat > /etc/nginx/sites-available/geo.titanwalls.de << 'NGINX_TEMP'
server {
    listen 80;
    server_name geo.titanwalls.de;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX_TEMP

ln -sf /etc/nginx/sites-available/geo.titanwalls.de /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# SSL Zertifikat
echo -e "${YELLOW}  → SSL-Zertifikat wird geholt...${NC}"
certbot --nginx -d geo.titanwalls.de --non-interactive --agree-tos --email admin@titanwalls.de --redirect || {
    echo -e "${RED}  ✗ SSL fehlgeschlagen! Prüfe ob der A-Record korrekt gesetzt ist.${NC}"
    echo -e "${YELLOW}  Führe später manuell aus: sudo certbot --nginx -d geo.titanwalls.de${NC}"
}

# Volle Production Nginx Config
cat > /etc/nginx/sites-available/geo.titanwalls.de << 'NGINX_PROD'
server {
    listen 80;
    server_name geo.titanwalls.de;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name geo.titanwalls.de;

    ssl_certificate /etc/letsencrypt/live/geo.titanwalls.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/geo.titanwalls.de/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;

    # WICHTIG: Shopify lädt die App in einem iframe!
    # X-Frame-Options NICHT auf DENY oder SAMEORIGIN setzen!
    add_header Content-Security-Policy "frame-ancestors https://*.myshopify.com https://admin.shopify.com https://*.shopify.com;" always;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
        proxy_cache_bypass $http_upgrade;
    }

    location /assets/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
}
NGINX_PROD

nginx -t && systemctl reload nginx
echo -e "${GREEN}✓ Nginx + SSL eingerichtet${NC}"

# ============================================================
# SCHRITT 8: PM2 Autostart
# ============================================================
echo -e "${YELLOW}[8/8] PM2 Autostart wird eingerichtet...${NC}"
pm2 startup systemd -u root --hp /root 2>/dev/null || true
echo -e "${GREEN}✓ PM2 Autostart konfiguriert${NC}"

# ============================================================
# FIREWALL
# ============================================================
echo -e "${YELLOW}Firewall wird konfiguriert...${NC}"
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable 2>/dev/null || true
echo -e "${GREEN}✓ Firewall aktiv (SSH, HTTP, HTTPS)${NC}"

echo ""
echo "============================================"
echo -e "${GREEN}  Server-Setup abgeschlossen!${NC}"
echo "============================================"
echo ""
echo "Nächste Schritte:"
echo ""
echo "  1. App-Dateien hochladen (von deinem PC):"
echo "     scp -r C:\\Users\\Mateu\\Desktop\\titan-geo-core root@DEIN_SERVER_IP:/var/www/titan-geo-core/"
echo ""
echo "  2. Auf dem Server die App starten:"
echo "     cd /var/www/titan-geo-core"
echo "     npm install --production"
echo "     npx prisma generate"
echo "     npx prisma db push"
echo "     npm run build"
echo "     pm2 start ecosystem.config.cjs"
echo "     pm2 save"
echo ""
echo "  3. Testen:"
echo "     curl https://geo.titanwalls.de"
echo ""
