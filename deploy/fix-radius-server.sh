#!/usr/bin/env bash
# =============================================================
#  Perbaiki "RADIUS server is not responding" di MikroTik
#  Jalankan:  sudo bash deploy/fix-radius-server.sh [IP-MIKROTIK]
#
#  - memastikan FreeRADIUS mendengarkan di semua interface
#  - membuka port UDP 1812/1813/3799 di firewall
#  - mendaftarkan ulang MikroTik sebagai NAS (client)
#  - menguji autentikasi lokal dengan radtest
# =============================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_NAME="${DB_NAME:-radius}"
NAS_IP="${1:-0.0.0.0/0}"
NAS_SECRET="${NAS_SECRET:-}"

RAD="/etc/freeradius/3.0"
[ -d "$RAD" ] || RAD="/etc/freeradius"

echo "==> Memastikan FreeRADIUS mendengarkan di semua interface (0.0.0.0)"
sed -i 's/^\(\s*\)ipaddr = 127\.0\.0\.1/\1ipaddr = */' "$RAD/sites-enabled/default" || true
sed -i 's/^\(\s*\)ipv4addr = 127\.0\.0\.1/\1ipv4addr = */' "$RAD/sites-enabled/default" || true

echo "==> Mengambil / membuat NAS secret"
if [ -z "$NAS_SECRET" ]; then
  NAS_SECRET="$(mysql -N -B "$DB_NAME" -e "SELECT secret FROM nas WHERE shortname='mikrotik' LIMIT 1" 2>/dev/null || true)"
fi
if [ -z "$NAS_SECRET" ]; then
  NAS_SECRET="najwa$(head -c6 /dev/urandom | od -An -tx1 | tr -d ' \n')"
fi

mysql "$DB_NAME" <<SQL
DELETE FROM nas WHERE shortname='mikrotik';
INSERT INTO nas (nasname, shortname, type, secret, description)
VALUES ('$NAS_IP', 'mikrotik', 'other', '$NAS_SECRET', 'MikroTik NAJWA_BILLING');
SQL

# clients.conf sebagai cadangan bila read_clients belum aktif
if ! grep -q "client najwa" "$RAD/clients.conf"; then
cat >>"$RAD/clients.conf" <<CONF

client najwa {
    ipaddr = $NAS_IP
    secret = $NAS_SECRET
    require_message_authenticator = no
    nas_type = other
}
CONF
else
  sed -i "/client najwa {/,/}/ s|^\(\s*\)ipaddr = .*|\1ipaddr = $NAS_IP|; /client najwa {/,/}/ s|^\(\s*\)secret = .*|\1secret = $NAS_SECRET|" "$RAD/clients.conf"
fi

echo "==> Membuka port firewall UDP 1812, 1813, 3799"
if command -v ufw >/dev/null 2>&1; then
  ufw allow 1812/udp || true
  ufw allow 1813/udp || true
  ufw allow 3799/udp || true
fi
iptables -C INPUT -p udp --dport 1812:1813 -j ACCEPT 2>/dev/null || iptables -I INPUT -p udp --dport 1812:1813 -j ACCEPT || true
iptables -C INPUT -p udp --dport 3799 -j ACCEPT 2>/dev/null || iptables -I INPUT -p udp --dport 3799 -j ACCEPT || true

echo "==> Restart FreeRADIUS"
bash "$APP_DIR/deploy/fix-radius-mysql-ssl.sh" || { freeradius -X | tail -40; exit 1; }
systemctl enable freeradius >/dev/null 2>&1 || true

echo "==> Port yang terbuka:"
ss -lunp | grep -E '1812|1813|3799' || echo "    (tidak ada! cek 'freeradius -X')"

echo "==> Uji autentikasi lokal (pakai voucher pertama di database)"
USER_TEST="$(mysql -N -B "$DB_NAME" -e "SELECT username FROM billing_voucher LIMIT 1" 2>/dev/null || true)"
PASS_TEST="$(mysql -N -B "$DB_NAME" -e "SELECT password FROM billing_voucher LIMIT 1" 2>/dev/null || true)"
if [ -n "$USER_TEST" ]; then
  radtest "$USER_TEST" "$PASS_TEST" 127.0.0.1 0 "$NAS_SECRET" || echo "    Gagal - lihat 'freeradius -X'"
else
  echo "    Belum ada voucher, buat dulu di panel menu RADIUS."
fi

IP="$(hostname -I | awk '{print $1}')"
cat <<INFO

=====================================================================
 NAS secret : $NAS_SECRET
 IP server  : $IP

 Jalankan di terminal MikroTik:
   /radius remove [find]
   /radius add service=hotspot,ppp address=$IP secret=$NAS_SECRET \\
       timeout=3s require-message-auth=no
   /radius incoming set accept=yes port=3799
   /ip hotspot profile set [find] use-radius=yes
   /ppp aaa set use-radius=yes accounting=yes

 Pastikan MikroTik bisa ping $IP dan tidak ada firewall yang
 memblokir UDP 1812/1813.

 Debug live: hentikan service lalu jalankan  sudo freeradius -X
=====================================================================
INFO
