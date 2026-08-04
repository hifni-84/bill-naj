#!/usr/bin/env bash
# =============================================================
#  Instalasi Panel Billing MikroTik di Ubuntu (22.04 / 24.04)
#  Jalankan:  sudo bash deploy/install-ubuntu.sh
# =============================================================
set -euo pipefail

APP_NAME="mikrotik-billing"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER="${SUDO_USER:-$USER}"
PORT="${PORT:-3000}"

echo "==> Direktori aplikasi : $APP_DIR"
echo "==> Dijalankan sebagai : $APP_USER"
echo "==> Port               : $PORT"

# ---- 1. Dependensi sistem ----
apt-get update
apt-get install -y curl ca-certificates

NODE_MINIMUM="22.12.0"
NODE_CURRENT="$(node -v 2>/dev/null | sed 's/^v//' || true)"
if [ -z "$NODE_CURRENT" ] || [ "$(printf '%s\n%s\n' "$NODE_MINIMUM" "$NODE_CURRENT" | sort -V | head -n1)" != "$NODE_MINIMUM" ]; then
  echo "==> Memasang Node.js 22 LTS (minimum $NODE_MINIMUM)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
apt-get install -y nginx

# ---- 2. Build aplikasi ----
# Pastikan APP_USER punya hak tulis ke folder aplikasi (mis. /opt hasil git
# clone oleh root) supaya npm install tidak kena EACCES pada node_modules.
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
echo "==> Memasang dependensi & build (preset node-server)"
echo "    Memakai 'npm install' agar lockfile lama/tidak sinkron diperbarui otomatis"
sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && npm install --legacy-peer-deps && NITRO_PRESET=node-server npm run build"

# ---- 3. Service systemd ----
echo "==> Memasang service systemd"
sed -e "s|__APP_DIR__|$APP_DIR|g" \
    -e "s|__APP_USER__|$APP_USER|g" \
    -e "s|__PORT__|$PORT|g" \
    "$APP_DIR/deploy/mikrotik-billing.service" > "/etc/systemd/system/${APP_NAME}.service"

systemctl daemon-reload
systemctl enable --now "$APP_NAME"

# ---- 4. Nginx reverse proxy ----
echo "==> Memasang konfigurasi Nginx"
sed -e "s|__PORT__|$PORT|g" "$APP_DIR/deploy/nginx.conf" > "/etc/nginx/sites-available/${APP_NAME}"
ln -sf "/etc/nginx/sites-available/${APP_NAME}" "/etc/nginx/sites-enabled/${APP_NAME}"
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo
echo "============================================="
echo " Selesai! Buka http://<IP-SERVER>/"
echo " Status : systemctl status $APP_NAME"
echo " Log    : journalctl -u $APP_NAME -f"
echo "============================================="
