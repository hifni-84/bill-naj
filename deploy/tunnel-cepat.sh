#!/usr/bin/env bash
# =============================================================
#  NAJWA_BILLING — Akses dari luar TANPA port forward / DDNS
#  Memakai Cloudflare Quick Tunnel (URL *.trycloudflare.com)
#  Pemakaian:  sudo bash deploy/tunnel-cepat.sh
# =============================================================
set -uo pipefail

APP_PORT="${PORT:-3000}"
[ "$(id -u)" -eq 0 ] || { echo "Jalankan dengan sudo" >&2; exit 1; }

echo "=== 1) Pastikan billing hidup di port $APP_PORT ==="
systemctl restart mikrotik-billing 2>/dev/null || true
sleep 3
curl -s -o /dev/null -w "lokal -> HTTP %{http_code}\n" "http://127.0.0.1:$APP_PORT/" || {
  echo "Billing tidak merespon. Cek: journalctl -u mikrotik-billing -n 50"; exit 1; }

echo "=== 2) Pasang cloudflared ==="
if ! command -v cloudflared >/dev/null 2>&1; then
  ARCH="$(dpkg --print-architecture)"
  curl -fsSL -o /tmp/cloudflared.deb \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb"
  apt-get install -y /tmp/cloudflared.deb
fi

echo "=== 3) Jalankan tunnel sebagai service ==="
cat >/etc/systemd/system/billing-tunnel.service <<SVC
[Unit]
Description=Cloudflare Quick Tunnel untuk NAJWA_BILLING
After=network-online.target

[Service]
ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:$APP_PORT
Restart=always
RestartSec=5
StandardOutput=append:/var/log/billing-tunnel.log
StandardError=append:/var/log/billing-tunnel.log

[Install]
WantedBy=multi-user.target
SVC
: >/var/log/billing-tunnel.log
systemctl daemon-reload
systemctl enable --now billing-tunnel

echo "=== 4) Menunggu URL publik (maks 60 detik) ==="
URL=""
for i in $(seq 1 60); do
  URL="$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /var/log/billing-tunnel.log | head -1 || true)"
  [ -n "$URL" ] && break
  sleep 1
done

if [ -n "$URL" ]; then
  cat <<TIP

=========================================================
 BILLING SUDAH BISA DIBUKA DARI MANA SAJA:
   $URL
=========================================================
Langkah terakhir:
 1. Buka URL di atas, login ke panel.
 2. Pengaturan -> Akses Publik: isi Host = ${URL#https://}, aktifkan HTTPS.
 3. URL bisa berubah bila service restart. Lihat kapan saja:
      sudo grep -o 'https://.*trycloudflare.com' /var/log/billing-tunnel.log | tail -1
 4. Ingin URL tetap (najwa.ddns.net butuh port forward)? Pakai domain di
    Cloudflare + 'sudo bash deploy/go-online.sh tunnel'.
TIP
else
  echo "URL belum muncul. Cek log: sudo tail -40 /var/log/billing-tunnel.log"
fi
