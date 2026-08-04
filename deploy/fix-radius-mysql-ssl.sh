#!/usr/bin/env bash
# =============================================================
#  Perbaiki koneksi FreeRADIUS -> MariaDB lokal yang gagal karena
#  "SSL is required but the server doesn't support it".
#  Jalankan: sudo bash deploy/fix-radius-mysql-ssl.sh
# =============================================================
set -euo pipefail

RAD="/etc/freeradius/3.0"
[ -d "$RAD" ] || RAD="/etc/freeradius"
SQLCONF="$RAD/mods-available/sql"

if [ ! -f "$SQLCONF" ]; then
  echo "Konfigurasi SQL FreeRADIUS tidak ditemukan: $SQLCONF" >&2
  exit 1
fi

echo "==> Mengatur koneksi MariaDB lokal tanpa TLS"
cp -a "$SQLCONF" "$SQLCONF.bak.$(date +%Y%m%d%H%M%S)"

# Gunakan TCP lokal secara eksplisit, bukan socket localhost.
sed -i 's/^\([[:space:]]*\)#\?[[:space:]]*server = .*/\1server = "127.0.0.1"/' "$SQLCONF"

# Pada rlm_sql_mysql, tls_required berada di dalam blok mysql -> tls.
if grep -Eq '^[[:space:]]*tls_required[[:space:]]*=' "$SQLCONF"; then
  sed -i 's/^\([[:space:]]*\)tls_required[[:space:]]*=.*/\1tls_required = no/' "$SQLCONF"
else
  sed -i '0,/^[[:space:]]*mysql[[:space:]]*{/s//&\
\ttls {\
\t\ttls_required = no\
\t}/' "$SQLCONF"
fi

echo "==> Memeriksa konfigurasi FreeRADIUS"
freeradius -XC >/dev/null

echo "==> Restart FreeRADIUS"
systemctl restart freeradius
systemctl enable freeradius >/dev/null 2>&1 || true

echo "    OK - koneksi SQL lokal tidak lagi mewajibkan SSL."