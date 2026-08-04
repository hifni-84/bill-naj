#!/usr/bin/env bash
# =============================================================
#  NAJWA_BILLING - Instalasi LENGKAP di Ubuntu Server
#  Panel + Nginx + systemd + FreeRADIUS + MariaDB
#
#  Jalankan dari dalam folder proyek:
#     sudo bash deploy/install-all.sh
# =============================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "============================================="
echo " NAJWA_BILLING - instalasi lengkap"
echo " Folder : $APP_DIR"
echo "============================================="

bash "$APP_DIR/deploy/install-ubuntu.sh"
bash "$APP_DIR/deploy/install-radius.sh"

IP="$(hostname -I | awk '{print $1}')"
cat <<INFO

=====================================================================
 SEMUA SELESAI.
 Buka panel : http://$IP/
 Login awal : admin / admin  (ganti di menu Pengaturan)
=====================================================================
INFO
