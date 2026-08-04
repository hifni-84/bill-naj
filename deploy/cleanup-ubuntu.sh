#!/usr/bin/env bash
#
#  cleanup-ubuntu.sh — Bersihkan TOTAL instalasi NAJWA_BILLING lama di Ubuntu
#  agar server kembali fresh sebelum instalasi baru.
#
#  Pakai:
#    sudo bash deploy/cleanup-ubuntu.sh            # bersihkan app + radius + nginx
#    sudo bash deploy/cleanup-ubuntu.sh --keep-db  # simpan database radius
#    sudo bash deploy/cleanup-ubuntu.sh --purge    # sekalian buang paket (mariadb/freeradius/nginx/node)
#    sudo YES=1 bash deploy/cleanup-ubuntu.sh      # tanpa konfirmasi
#
set -uo pipefail

APP_NAME="${APP_NAME:-mikrotik-billing}"
DB_NAME="${DB_NAME:-radius}"
DB_USER="${DB_USER:-radius}"
KEEP_DB=0
PURGE=0
for a in "$@"; do
  case "$a" in
    --keep-db) KEEP_DB=1 ;;
    --purge) PURGE=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
  esac
done

[ "$(id -u)" -eq 0 ] || { echo "Jalankan dengan sudo."; exit 1; }

echo "=============================================================="
echo " PEMBERSIHAN INSTALASI LAMA: $APP_NAME"
echo " - service systemd + PM2"
echo " - konfigurasi Nginx"
echo " - $([ $KEEP_DB -eq 1 ] && echo 'database DIPERTAHANKAN' || echo "database $DB_NAME DIHAPUS")"
echo " - konfigurasi FreeRADIUS sql"
echo " - folder aplikasi lama di /opt, /var/www, /srv, /root, /home/*"
echo " $([ $PURGE -eq 1 ] && echo '- PURGE paket: nginx, mariadb, freeradius, nodejs, pm2' || echo '- paket sistem TIDAK dibuang (pakai --purge bila ingin)')"
echo "=============================================================="
if [ "${YES:-0}" != "1" ]; then
  read -rp "Lanjut hapus? ketik YA: " j
  [ "$j" = "YA" ] || { echo "Dibatalkan."; exit 1; }
fi

step() { echo; echo "==> $*"; }

step "Menghentikan service aplikasi"
for s in "$APP_NAME" najwa-billing billing hotspot-billing; do
  systemctl stop "$s" 2>/dev/null
  systemctl disable "$s" 2>/dev/null
  rm -f "/etc/systemd/system/${s}.service" "/lib/systemd/system/${s}.service"
  rm -rf "/etc/systemd/system/${s}.service.d"
done
systemctl daemon-reload 2>/dev/null
systemctl reset-failed 2>/dev/null

step "Menghentikan PM2 (bila ada)"
if command -v pm2 >/dev/null; then
  pm2 delete all 2>/dev/null
  pm2 unstartup systemd 2>/dev/null
  pm2 kill 2>/dev/null
fi
for u in root $(ls /home 2>/dev/null); do rm -rf "/home/$u/.pm2"; done
rm -rf /root/.pm2

step "Membersihkan konfigurasi Nginx"
rm -f "/etc/nginx/sites-enabled/${APP_NAME}" "/etc/nginx/sites-available/${APP_NAME}"
rm -f /etc/nginx/sites-enabled/najwa* /etc/nginx/sites-available/najwa* \
      /etc/nginx/conf.d/${APP_NAME}.conf 2>/dev/null
if [ $PURGE -eq 0 ] && command -v nginx >/dev/null; then
  [ -e /etc/nginx/sites-available/default ] && ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
  nginx -t >/dev/null 2>&1 && systemctl reload nginx 2>/dev/null
fi

step "Menutup proses yang masih memakai port 3000/8080"
for p in 3000 8080; do
  pids=$(ss -lptnH "sport = :$p" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u)
  [ -n "$pids" ] && kill -9 $pids 2>/dev/null
done

if [ $KEEP_DB -eq 0 ] && command -v mysql >/dev/null; then
  step "Menghapus database & user MySQL/MariaDB ($DB_NAME / $DB_USER)"
  systemctl start mariadb 2>/dev/null || systemctl start mysql 2>/dev/null
  mysql <<SQL 2>/dev/null
DROP DATABASE IF EXISTS \`$DB_NAME\`;
DROP USER IF EXISTS '$DB_USER'@'localhost';
DROP USER IF EXISTS '$DB_USER'@'127.0.0.1';
DROP USER IF EXISTS '$DB_USER'@'%';
FLUSH PRIVILEGES;
SQL
fi

step "Membersihkan FreeRADIUS"
systemctl stop freeradius 2>/dev/null
rm -f /etc/freeradius/3.0/mods-enabled/sql /etc/freeradius/3.0/mods-enabled/sqlcounter 2>/dev/null
if [ $PURGE -eq 0 ]; then systemctl disable freeradius 2>/dev/null; fi

step "Menghapus folder aplikasi lama"
for d in /opt/$APP_NAME /opt/najwa-billing /opt/NAJWA-BILLHOTSPOT* \
         /var/www/$APP_NAME /var/www/najwa* /srv/$APP_NAME \
         /root/$APP_NAME /root/NAJWA* /root/najwa* \
         /home/*/$APP_NAME /home/*/NAJWA* /home/*/najwa*; do
  [ -e "$d" ] && { echo "   hapus $d"; rm -rf "$d"; }
done
rm -rf /root/.npm /root/.bun /root/.cache/node* 2>/dev/null

if [ $PURGE -eq 1 ]; then
  step "PURGE paket sistem"
  command -v pm2 >/dev/null && npm rm -g pm2 2>/dev/null
  apt-get remove --purge -y nginx nginx-common nginx-core \
      freeradius freeradius-mysql freeradius-utils \
      mariadb-server mariadb-client mysql-server mysql-client nodejs 2>/dev/null
  apt-get autoremove --purge -y 2>/dev/null
  rm -rf /etc/nginx /etc/freeradius /var/lib/mysql /etc/mysql /usr/lib/node_modules \
         /etc/apt/sources.list.d/nodesource.list
  apt-get update -y >/dev/null 2>&1
fi

echo
echo "=============================================================="
echo " Server sudah bersih. Instalasi baru:"
echo "   git clone <url-repo> mikrotik-billing && cd mikrotik-billing"
echo "   sudo bash deploy/install-all.sh"
echo "=============================================================="
