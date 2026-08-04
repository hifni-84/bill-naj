#!/usr/bin/env bash
# Mengizinkan panel billing mengelola peer WireGuard tanpa password sudo,
# supaya penambahan router bisa dilakukan dari menu "VPN Router".
set -euo pipefail
[[ $EUID -ne 0 ]] && { echo "Jalankan dengan sudo."; exit 1; }

APP_USER="${1:-$(stat -c '%U' /opt/mikrotik-billing 2>/dev/null || echo najwa)}"
FILE="/etc/sudoers.d/billing-wireguard"

cat > "$FILE" <<CFG
${APP_USER} ALL=(root) NOPASSWD: /usr/bin/wg, /usr/bin/wg-quick, /usr/bin/cat /etc/wireguard/*, /usr/bin/install -m 600 /tmp/*.conf.billing /etc/wireguard/*
CFG
chmod 440 "$FILE"
visudo -c -f "$FILE"
echo "OK: user ${APP_USER} boleh mengelola WireGuard dari panel billing."
