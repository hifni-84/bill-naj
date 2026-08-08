#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -ne 0 ]] && { echo "Jalankan dengan sudo."; exit 1; }

DOMAINS_RAW="${1:-}"
EMAIL="${2:-}"
PORT="${3:-3000}"
USE_SSL="${4:-0}"

[[ -z "$DOMAINS_RAW" ]] && { echo "Domain kosong."; exit 1; }
[[ "$PORT" =~ ^[0-9]{2,5}$ ]] || { echo "Port tidak valid: $PORT"; exit 1; }

IFS=',' read -r -a RAW <<< "$DOMAINS_RAW"
DOMAINS=()
for d in "${RAW[@]}"; do
  d="$(echo "$d" | tr -d ' ' | tr 'A-Z' 'a-z' | sed -E 's#^https?://##; s#/.*$##')"
  [[ -z "$d" ]] && continue
  [[ "$d" =~ ^[a-z0-9.-]+$ ]] || { echo "Nama domain tidak valid: $d"; exit 1; }
  DOMAINS+=("$d")
done
[[ ${#DOMAINS[@]} -eq 0 ]] && { echo "Domain kosong."; exit 1; }

SITE="/etc/nginx/sites-available/billing-domain"
LINK="/etc/nginx/sites-enabled/billing-domain"

{
  echo "server {"
  echo "    listen 80;"
  echo "    listen [::]:80;"
  echo "    server_name ${DOMAINS[*]};"
  echo "    client_max_body_size 10m;"
  echo "    location / {"
  echo "        proxy_pass http://127.0.0.1:${PORT};"
  echo "        proxy_http_version 1.1;"
  echo "        proxy_set_header Upgrade \$http_upgrade;"
  echo "        proxy_set_header Connection \"upgrade\";"
  echo "        proxy_set_header Host \$host;"
  echo "        proxy_set_header X-Real-IP \$remote_addr;"
  echo "        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;"
  echo "        proxy_set_header X-Forwarded-Proto \$scheme;"
  echo "        proxy_read_timeout 60s;"
  echo "    }"
  echo "}"
} > "$SITE"

ln -sfn "$SITE" "$LINK"

if ! nginx -t 2>&1; then
  echo "Konfigurasi Nginx gagal diuji, perubahan dibatalkan."
  rm -f "$LINK"
  exit 1
fi
systemctl reload nginx
echo "OK: Nginx aktif untuk ${DOMAINS[*]} -> 127.0.0.1:${PORT}"

if [[ "$USE_SSL" == "1" ]]; then
  if ! command -v certbot >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -y >/dev/null 2>&1 || true
    apt-get install -y certbot python3-certbot-nginx >/dev/null 2>&1 || true
  fi
  command -v certbot >/dev/null 2>&1 || { echo "Certbot tidak tersedia, SSL dilewati."; exit 0; }

  ARGS=(--nginx --non-interactive --agree-tos --redirect --keep-until-expiring)
  if [[ -n "$EMAIL" ]]; then ARGS+=(-m "$EMAIL"); else ARGS+=(--register-unsafely-without-email); fi
  for d in "${DOMAINS[@]}"; do
    [[ "$d" =~ ^[0-9.]+$ ]] && continue
    ARGS+=(-d "$d")
  done
  if certbot "${ARGS[@]}" 2>&1; then
    systemctl reload nginx
    echo "OK: SSL aktif (HTTPS)."
  else
    echo "PERINGATAN: SSL gagal dipasang. Pastikan domain sudah mengarah ke IP server ini."
  fi
fi
