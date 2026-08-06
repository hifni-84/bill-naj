#!/usr/bin/env bash
# Ganti port listen WireGuard server (default -> 4500) agar lolos blokir ISP.
# Pakai: sudo bash deploy/ganti-port-wireguard.sh 4500
set -euo pipefail

NEW_PORT="${1:-4500}"
WG_CONF="/etc/wireguard/wg0.conf"
ENV_FILE="/opt/mikrotik-billing/.env"

if [[ ! -f "$WG_CONF" ]]; then
  echo "ERROR: $WG_CONF tidak ditemukan. Jalankan install-wireguard.sh dulu." >&2
  exit 1
fi

OLD_PORT="$(awk -F'= *' '/^ListenPort/{print $2; exit}' "$WG_CONF" | tr -d '[:space:]')"
echo "==> Port lama: ${OLD_PORT:-tidak diketahui}  ->  port baru: $NEW_PORT"

cp "$WG_CONF" "${WG_CONF}.bak.$(date +%s)"

if grep -q '^ListenPort' "$WG_CONF"; then
  sed -i "s/^ListenPort.*/ListenPort = ${NEW_PORT}/" "$WG_CONF"
else
  sed -i "0,/^\[Interface\]/s//[Interface]\nListenPort = ${NEW_PORT}/" "$WG_CONF"
fi

echo "==> Restart WireGuard"
systemctl restart wg-quick@wg0
sleep 1

echo "==> Simpan WG_PORT ke .env billing"
if [[ -f "$ENV_FILE" ]]; then
  if grep -q '^WG_PORT=' "$ENV_FILE"; then
    sed -i "s/^WG_PORT=.*/WG_PORT=${NEW_PORT}/" "$ENV_FILE"
  else
    echo "WG_PORT=${NEW_PORT}" >> "$ENV_FILE"
  fi
  systemctl restart mikrotik-billing 2>/dev/null || true
fi

command -v ufw >/dev/null && ufw allow "${NEW_PORT}"/udp >/dev/null 2>&1 || true

echo
echo "==> Status:"
ss -lunp | grep -E "[:.]${NEW_PORT}\b" || echo "PERINGATAN: port ${NEW_PORT} belum listen!"
wg show

cat <<TXT

=====================================================================
LANGKAH BERIKUTNYA
=====================================================================
1) Di MikroTik UTAMA (pemegang IP publik) — forward port baru:

   /ip firewall nat remove [find comment="wireguard-billing"]
   /ip firewall nat add chain=dstnat action=dst-nat protocol=udp \\
     dst-port=${NEW_PORT} to-addresses=192.168.23.251 to-ports=${NEW_PORT} \\
     comment="wireguard-billing" place-before=0

2) Di SETIAP MikroTik cabang — ubah endpoint-port peer:

   /interface wireguard peers set [find interface=wg-billing] \\
     endpoint-port=${NEW_PORT} persistent-keepalive=25s

3) Cek di server ini:  sudo wg show
   Kalau muncul "latest handshake" -> berhasil.
=====================================================================
TXT
