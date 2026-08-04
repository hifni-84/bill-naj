#!/usr/bin/env bash
# =============================================================
#  Instalasi FreeRADIUS + MariaDB untuk NAJWA_BILLING (Ubuntu)
#  Jalankan:  sudo bash deploy/install-radius.sh
# =============================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_NAME="${DB_NAME:-radius}"
DB_USER="${DB_USER:-radius}"
DB_PASS="${DB_PASS:-radpass$(head -c6 /dev/urandom | od -An -tx1 | tr -d ' \n')}"
NAS_SECRET="${NAS_SECRET:-najwa$(head -c6 /dev/urandom | od -An -tx1 | tr -d ' \n')}"
NAS_IP="${NAS_IP:-0.0.0.0/0}"

echo "==> Memasang MariaDB & FreeRADIUS"
apt-get update
apt-get install -y mariadb-server freeradius freeradius-mysql freeradius-utils
systemctl enable --now mariadb

echo "==> Membuat database $DB_NAME"
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

echo "==> Import skema FreeRADIUS + tabel billing"
SCHEMA="/etc/freeradius/3.0/mods-config/sql/main/mysql/schema.sql"
[ -f "$SCHEMA" ] || SCHEMA="/etc/freeradius/mods-config/sql/main/mysql/schema.sql"
mysql "$DB_NAME" < "$SCHEMA"
mysql "$DB_NAME" < "$APP_DIR/deploy/radius-schema.sql"

echo "==> Mengaktifkan modul sql"
RAD="/etc/freeradius/3.0"
[ -d "$RAD" ] || RAD="/etc/freeradius"
ln -sf "$RAD/mods-available/sql" "$RAD/mods-enabled/sql"
SQLCONF="$RAD/mods-available/sql"
sed -i \
  -e 's/^\(\s*\)driver = .*/\1driver = "rlm_sql_mysql"/' \
  -e 's/^\(\s*\)dialect = .*/\1dialect = "mysql"/' \
  -e "s/^\(\s*\)#\?\s*server = .*/\1server = \"127.0.0.1\"/" \
  -e "s/^\(\s*\)#\?\s*port = .*/\1port = 3306/" \
  -e "s/^\(\s*\)#\?\s*login = .*/\1login = \"$DB_USER\"/" \
  -e "s/^\(\s*\)#\?\s*password = .*/\1password = \"$DB_PASS\"/" \
  -e "s/^\(\s*\)#\?\s*radius_db = .*/\1radius_db = \"$DB_NAME\"/" \
  -e 's/^\(\s*\)#\?\s*read_clients = .*/\1read_clients = yes/' \
  "$SQLCONF"
chgrp -h freerad "$RAD/mods-enabled/sql" || true

# MariaDB lokal instalasi minimal tidak selalu menyediakan TLS. Pastikan
# driver FreeRADIUS tidak memaksa SSL untuk koneksi loopback ini.
bash "$APP_DIR/deploy/fix-radius-mysql-ssl.sh"

# pakai sql (bukan files) untuk authorize/accounting/session/post-auth
for SITE in "$RAD/sites-enabled/default" "$RAD/sites-enabled/inner-tunnel"; do
  [ -f "$SITE" ] || continue
  sed -i 's/^\(\s*\)-\?sql$/\1sql/' "$SITE"
  grep -q '^\s*sql' "$SITE" || sed -i '0,/^\s*files$/s//\tsql\n&/' "$SITE"
done

echo "==> Mendaftarkan MikroTik sebagai NAS (secret: $NAS_SECRET)"
mysql "$DB_NAME" <<SQL
DELETE FROM nas WHERE shortname='mikrotik';
INSERT INTO nas (nasname, shortname, type, secret, description)
VALUES ('$NAS_IP', 'mikrotik', 'other', '$NAS_SECRET', 'MikroTik NAJWA_BILLING');
SQL

systemctl restart freeradius || { freeradius -X | tail -40; exit 1; }
systemctl enable freeradius

echo "==> Menyimpan kredensial database ke systemd service panel"
mkdir -p /etc/systemd/system/mikrotik-billing.service.d
cat >/etc/systemd/system/mikrotik-billing.service.d/radius.conf <<CONF
[Service]
Environment=RADIUS_DB_HOST=127.0.0.1
Environment=RADIUS_DB_PORT=3306
Environment=RADIUS_DB_USER=$DB_USER
Environment=RADIUS_DB_PASSWORD=$DB_PASS
Environment=RADIUS_DB_NAME=$DB_NAME
CONF
systemctl daemon-reload
systemctl restart mikrotik-billing || true

cat <<INFO

=====================================================================
 Selesai! Database RADIUS siap.
   DB   : $DB_NAME  user: $DB_USER  password: $DB_PASS
   NAS secret untuk MikroTik : $NAS_SECRET

 Jalankan di terminal MikroTik (ganti IP-SERVER):
   /radius add service=hotspot,ppp address=IP-SERVER secret=$NAS_SECRET \\
       timeout=3s require-message-auth=no
   /radius incoming set accept=yes port=3799
   /ip hotspot profile set [find] use-radius=yes
   /ppp aaa set use-radius=yes accounting=yes

 Buka panel -> menu "RADIUS" untuk membuat paket & voucher.
=====================================================================
INFO
