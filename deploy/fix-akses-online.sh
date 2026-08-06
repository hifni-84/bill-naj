#!/usr/bin/env bash
# =============================================================
#  NAJWA_BILLING — Diagnosa & perbaiki akses dari luar jaringan
#  Pemakaian:
#     sudo bash deploy/fix-akses-online.sh najwa.ddns.net
# =============================================================
set -uo pipefail

DOMAIN="${1:-najwa.ddns.net}"
APP_PORT="${PORT:-3000}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "Jalankan dengan sudo: sudo bash deploy/fix-akses-online.sh $DOMAIN" >&2
  exit 1
fi

line() { printf '\n=== %s ===\n' "$1"; }

line "1) Layanan billing (port $APP_PORT)"
systemctl is-active --quiet mikrotik-billing && echo "aktif" || {
  echo "TIDAK aktif -> mencoba start"
  systemctl restart mikrotik-billing || true
  sleep 3
}
curl -s -o /dev/null -w "lokal http://127.0.0.1:$APP_PORT -> HTTP %{http_code}\n" "http://127.0.0.1:$APP_PORT/" || echo "app tidak merespon"

line "2) Nginx reverse proxy"
if ! command -v nginx >/dev/null 2>&1; then
  echo "nginx belum terpasang -> memasang"
  apt-get update -y && apt-get install -y nginx
fi
CONF=/etc/nginx/sites-available/mikrotik-billing
if [ ! -f "$CONF" ] || ! grep -q "$DOMAIN" "$CONF"; then
  echo "menulis ulang konfigurasi nginx untuk $DOMAIN"
  sed -e "s|__PORT__|$APP_PORT|g" -e "s|server_name _;|server_name $DOMAIN;|" \
    "$APP_DIR/deploy/nginx.conf" > "$CONF"
fi
ln -sf "$CONF" /etc/nginx/sites-enabled/mikrotik-billing
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx && echo "nginx OK"

line "3) Firewall (80/443 harus terbuka)"
if command -v ufw >/dev/null 2>&1; then
  ufw allow 80/tcp  >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ufw allow 51820/udp >/dev/null 2>&1 || true
  ufw status | head -20
fi

line "4) DDNS vs IP publik"
IP_PUBLIK="$(curl -s --max-time 8 https://api.ipify.org || echo '?')"
IP_DOMAIN="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1)"
echo "IP publik server : $IP_PUBLIK"
echo "$DOMAIN         : ${IP_DOMAIN:-tidak resolve}"
if [ -n "${IP_DOMAIN:-}" ] && [ "$IP_DOMAIN" != "$IP_PUBLIK" ]; then
  echo "!! IP DDNS TIDAK SAMA dengan IP publik saat ini."
  echo "   Perbarui DDNS (najwa.ddns.net) ke $IP_PUBLIK, atau aktifkan update DDNS otomatis di router."
fi

line "5) Sertifikat HTTPS"
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  certbot renew --quiet || true
  echo "sertifikat ada"
else
  echo "belum ada sertifikat -> mencoba terbitkan (butuh port 80 terbuka dari internet)"
  apt-get install -y certbot python3-certbot-nginx >/dev/null 2>&1 || true
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
    --register-unsafely-without-email --redirect || \
    echo "gagal — pastikan port 80 sudah diforward ke server ini dan DNS benar"
fi

line "6) Uji akses luar"
curl -s -o /dev/null -w "http://$DOMAIN  -> HTTP %{http_code}\n"  "http://$DOMAIN/"  || echo "http gagal"
curl -sk -o /dev/null -w "https://$DOMAIN -> HTTP %{http_code}\n" "https://$DOMAIN/" || echo "https gagal"

cat <<TIP

--- Checklist manual di router/modem ---
1. Port forward TCP 80  -> IP lokal server ini
2. Port forward TCP 443 -> IP lokal server ini
3. Pastikan ISP tidak memblokir port 80/443 (kalau CGNAT/diblokir, pakai:
   sudo bash deploy/go-online.sh tunnel  → Cloudflare Tunnel, tanpa port forward)
4. Setelah domain hidup, buka Pengaturan → Akses Publik dan isi host $DOMAIN + HTTPS aktif
TIP
