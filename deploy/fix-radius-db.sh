#!/usr/bin/env bash
# =============================================================
#  Perbaiki "Access denied for user 'radius'@'localhost'"
#  Jalankan:  sudo bash deploy/fix-radius-db.sh
#
#  Skrip ini menyetel ulang password user MySQL 'radius',
#  menyimpannya ke service panel + FreeRADIUS, lalu menguji koneksi.
# =============================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_NAME="${DB_NAME:-radius}"
DB_USER="${DB_USER:-radius}"
DB_PASS="${DB_PASS:-radpass$(head -c6 /dev/urandom | od -An -tx1 | tr -d ' \n')}"

echo "==> Menyetel ulang user database '$DB_USER'"
mysql <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
ALTER USER '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$DB_PASS';
ALTER USER '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

echo "==> Memastikan tabel billing ada"
mysql "$DB_NAME" < "$APP_DIR/deploy/radius-schema.sql" || true

echo "==> Uji koneksi dengan password baru"
mysql -h 127.0.0.1 -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" -e "SELECT 1" >/dev/null
echo "    OK"

echo "==> Menyimpan kredensial ke service panel"
mkdir -p /etc/systemd/system/mikrotik-billing.service.d
cat >/etc/systemd/system/mikrotik-billing.service.d/radius.conf <<CONF
[Service]
Environment=RADIUS_DB_HOST=127.0.0.1
Environment=RADIUS_DB_PORT=3306
Environment=RADIUS_DB_USER=$DB_USER
Environment=RADIUS_DB_PASSWORD=$DB_PASS
Environment=RADIUS_DB_NAME=$DB_NAME
CONF

# Simpan juga ke .env aplikasi supaya jalan lewat systemd, pm2, atau manual.
ENV_FILE="$APP_DIR/.env"
touch "$ENV_FILE"
sed -i '/^RADIUS_DB_/d' "$ENV_FILE"
cat >>"$ENV_FILE" <<ENVV
RADIUS_DB_HOST=127.0.0.1
RADIUS_DB_PORT=3306
RADIUS_DB_USER=$DB_USER
RADIUS_DB_PASSWORD=$DB_PASS
RADIUS_DB_NAME=$DB_NAME
ENVV
chmod 600 "$ENV_FILE"
chown --reference="$APP_DIR" "$ENV_FILE" 2>/dev/null || true

systemctl daemon-reload
systemctl restart mikrotik-billing 2>/dev/null || true
command -v pm2 >/dev/null && pm2 restart all --update-env >/dev/null 2>&1 || true

echo "==> Menyamakan password di konfigurasi FreeRADIUS"
RAD="/etc/freeradius/3.0"
[ -d "$RAD" ] || RAD="/etc/freeradius"
if [ -f "$RAD/mods-available/sql" ]; then
  sed -i \
    -e "s/^\(\s*\)#\?\s*server = .*/\1server = \"127.0.0.1\"/" \
    -e "s/^\(\s*\)#\?\s*login = .*/\1login = \"$DB_USER\"/" \
    -e "s/^\(\s*\)#\?\s*password = .*/\1password = \"$DB_PASS\"/" \
    -e "s/^\(\s*\)#\?\s*radius_db = .*/\1radius_db = \"$DB_NAME\"/" \
    "$RAD/mods-available/sql"
  bash "$APP_DIR/deploy/fix-radius-mysql-ssl.sh"
fi

cat <<INFO

=====================================================================
 Selesai. Kredensial database sekarang:
   DB   : $DB_NAME
   User : $DB_USER
   Pass : $DB_PASS

 Muat ulang halaman RADIUS di panel (Ctrl+F5).
 Cek log panel bila masih merah:
   journalctl -u mikrotik-billing -n 40 --no-pager
=====================================================================
INFO
