#!/usr/bin/env bash
# =============================================================
#  NAJWA_BILLING — Buka akses dari jaringan luar (online)
#
#  Mode 1 (disarankan, TANPA IP publik / tanpa port forward):
#     sudo bash deploy/go-online.sh tunnel
#  Mode 2 (punya IP publik + domain diarahkan ke server):
#     sudo bash deploy/go-online.sh domain billing.domain-anda.com
# =============================================================
set -euo pipefail

MODE="${1:-}"
DOMAIN="${2:-}"
APP_PORT="${PORT:-3000}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Jalankan dengan sudo: sudo bash deploy/go-online.sh $*" >&2
  exit 1
fi

case "$MODE" in
  tunnel)
    echo "==> Memasang Cloudflare Tunnel (cloudflared)"
    if ! command -v cloudflared >/dev/null 2>&1; then
      ARCH="$(dpkg --print-architecture)"
      curl -fsSL -o /tmp/cloudflared.deb \
        "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
      dpkg -i /tmp/cloudflared.deb
    fi

    echo
    echo "== Langkah berikutnya (interaktif) =="
    echo "1) cloudflared tunnel login          # login ke akun Cloudflare, pilih domain Anda"
    echo "2) cloudflared tunnel create najwa-billing"
    echo "3) cloudflared tunnel route dns najwa-billing billing.domain-anda.com"
    echo "4) buat file /etc/cloudflared/config.yml:"
    cat <<EOF

tunnel: najwa-billing
credentials-file: /root/.cloudflared/<TUNNEL-ID>.json
ingress:
  - hostname: billing.domain-anda.com
    service: http://127.0.0.1:${APP_PORT}
  - service: http_status:404

EOF
    echo "5) sudo cloudflared service install && sudo systemctl restart cloudflared"
    echo
    echo "Selesai — billing dapat dibuka dari mana saja lewat https://billing.domain-anda.com"
    echo "(HTTPS otomatis, router MikroTik tetap tidak perlu diekspos ke internet)"
    ;;

  domain)
    if [ -z "$DOMAIN" ]; then
      echo "Contoh: sudo bash deploy/go-online.sh domain billing.domain-anda.com" >&2
      exit 1
    fi
    echo "==> Menyiapkan Nginx + HTTPS untuk $DOMAIN"
    apt-get update
    apt-get install -y nginx certbot python3-certbot-nginx ufw

    APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    sed -e "s|__PORT__|$APP_PORT|g" -e "s|server_name _;|server_name $DOMAIN;|" \
      "$APP_DIR/deploy/nginx.conf" > /etc/nginx/sites-available/mikrotik-billing
    ln -sf /etc/nginx/sites-available/mikrotik-billing /etc/nginx/sites-enabled/mikrotik-billing
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl reload nginx

    echo "==> Membuka firewall 80/443 (port aplikasi tetap tertutup dari luar)"
    ufw allow 80/tcp || true
    ufw allow 443/tcp || true

    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
      --register-unsafely-without-email --redirect || \
      echo "Certbot gagal — pastikan DNS A record $DOMAIN sudah mengarah ke IP publik server ini."

    echo
    echo "Selesai — buka https://$DOMAIN"
    ;;

  *)
    cat <<'USAGE'
Pilih mode:

  sudo bash deploy/go-online.sh tunnel
      -> Cloudflare Tunnel. Tidak butuh IP publik, tidak perlu port forward,
         HTTPS otomatis. Paling aman & paling mudah untuk koneksi rumahan.

  sudo bash deploy/go-online.sh domain billing.domain-anda.com
      -> Server punya IP publik dan domain sudah diarahkan ke IP tersebut.
         Memasang Nginx + sertifikat HTTPS Let's Encrypt.
USAGE
    exit 1
    ;;
esac
