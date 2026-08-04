#!/usr/bin/env bash
# Pasang GenieACS (TR-069 ACS) + MongoDB di Ubuntu, satu server dengan panel billing.
# Jalankan: sudo bash deploy/install-genieacs.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Jalankan dengan sudo: sudo bash deploy/install-genieacs.sh" >&2
  exit 1
fi

echo "==> 1/6 Update paket & dependensi dasar"
apt-get update -y
apt-get install -y curl gnupg ca-certificates ufw

echo "==> 2/6 Pasang MongoDB"
if ! command -v mongod >/dev/null 2>&1; then
  . /etc/os-release
  CODENAME="${UBUNTU_CODENAME:-${VERSION_CODENAME:-jammy}}"
  # MongoDB 7.0 tidak menyediakan paket untuk Ubuntu 24.04 (noble) -> pakai 8.0
  case "$CODENAME" in
    noble|oracular|plucky) MONGO_VER=8.0 ;;
    *) MONGO_VER=7.0 ;;
  esac
  rm -f /etc/apt/sources.list.d/mongodb-org-*.list
  curl -fsSL "https://pgp.mongodb.com/server-${MONGO_VER}.asc" \
    | gpg --dearmor --yes -o "/usr/share/keyrings/mongodb-server-${MONGO_VER}.gpg"
  echo "deb [signed-by=/usr/share/keyrings/mongodb-server-${MONGO_VER}.gpg] https://repo.mongodb.org/apt/ubuntu ${CODENAME}/mongodb-org/${MONGO_VER} multiverse" \
    > "/etc/apt/sources.list.d/mongodb-org-${MONGO_VER}.list"
  apt-get update -y || true
  if ! apt-get install -y mongodb-org; then
    echo "!! Repo ${CODENAME} tidak tersedia, mencoba paket jammy"
    sed -i "s| ${CODENAME}/| jammy/|" "/etc/apt/sources.list.d/mongodb-org-${MONGO_VER}.list"
    apt-get update -y
    apt-get install -y mongodb-org
  fi
fi

mkdir -p /var/lib/mongodb /var/log/mongodb
chown -R mongodb:mongodb /var/lib/mongodb /var/log/mongodb 2>/dev/null || true
systemctl enable --now mongod 2>/dev/null || systemctl enable --now mongodb 2>/dev/null || true
for _ in {1..20}; do
  ss -tln 2>/dev/null | grep -q ':27017' && break
  sleep 1
done
if ! ss -tln 2>/dev/null | grep -q ':27017'; then
  echo "!! MongoDB tidak berjalan. GenieACS tidak mungkin hidup tanpa MongoDB."
  systemctl status mongod --no-pager -l || true
  journalctl -u mongod -n 40 --no-pager || true
  exit 1
fi
echo "MongoDB aktif di port 27017."

echo "==> 3/6 Pastikan Node.js 20+ tersedia"
NODE_MAJOR=$(node -v 2>/dev/null | sed 's/v\([0-9]*\).*/\1/' || echo 0)
if [[ "${NODE_MAJOR:-0}" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "==> 4/6 Pasang GenieACS"
npm install -g genieacs@1.2.13

id -u genieacs >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin genieacs
mkdir -p /opt/genieacs/ext /var/log/genieacs
chown -R genieacs:genieacs /opt/genieacs /var/log/genieacs
chmod 700 /var/log/genieacs

if [[ ! -f /opt/genieacs/genieacs.env ]]; then
  JWT=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
  cat > /opt/genieacs/genieacs.env <<EOF
GENIEACS_CWMP_ACCESS_LOG_FILE=/var/log/genieacs/genieacs-cwmp-access.log
GENIEACS_NBI_ACCESS_LOG_FILE=/var/log/genieacs/genieacs-nbi-access.log
GENIEACS_FS_ACCESS_LOG_FILE=/var/log/genieacs/genieacs-fs-access.log
GENIEACS_UI_ACCESS_LOG_FILE=/var/log/genieacs/genieacs-ui-access.log
GENIEACS_DEBUG_FILE=/var/log/genieacs/genieacs-debug.yaml
GENIEACS_EXT_DIR=/opt/genieacs/ext
GENIEACS_UI_JWT_SECRET=${JWT}
GENIEACS_MONGODB_CONNECTION_URL=mongodb://127.0.0.1/genieacs
GENIEACS_NBI_INTERFACE=0.0.0.0
GENIEACS_NBI_PORT=7557
GENIEACS_CWMP_INTERFACE=0.0.0.0
GENIEACS_CWMP_PORT=7547
GENIEACS_FS_INTERFACE=0.0.0.0
GENIEACS_FS_PORT=7567
GENIEACS_UI_INTERFACE=0.0.0.0
GENIEACS_UI_PORT=3001
EOF
  chown genieacs:genieacs /opt/genieacs/genieacs.env
  chmod 600 /opt/genieacs/genieacs.env
fi

# Perbarui instalasi lama juga, tanpa mengganti JWT yang sudah ada.
set_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" /opt/genieacs/genieacs.env; then
    sed -i "s|^${key}=.*|${key}=${value}|" /opt/genieacs/genieacs.env
  else
    printf '%s=%s\n' "$key" "$value" >> /opt/genieacs/genieacs.env
  fi
}
set_env GENIEACS_MONGODB_CONNECTION_URL mongodb://127.0.0.1/genieacs
set_env GENIEACS_NBI_INTERFACE 0.0.0.0
set_env GENIEACS_NBI_PORT 7557
set_env GENIEACS_CWMP_INTERFACE 0.0.0.0
set_env GENIEACS_CWMP_PORT 7547
set_env GENIEACS_FS_INTERFACE 0.0.0.0
set_env GENIEACS_FS_PORT 7567
set_env GENIEACS_UI_INTERFACE 0.0.0.0
set_env GENIEACS_UI_PORT 3001
chown genieacs:genieacs /opt/genieacs/genieacs.env
chmod 600 /opt/genieacs/genieacs.env

echo "==> 5/6 Buat service systemd"
GENIEACS_BIN=$(command -v genieacs-nbi)
GENIEACS_BIN_DIR=$(dirname "$GENIEACS_BIN")
for svc in cwmp nbi fs ui; do
  cat > /etc/systemd/system/genieacs-${svc}.service <<EOF
[Unit]
Description=GenieACS ${svc}
After=network.target mongod.service

[Service]
User=genieacs
EnvironmentFile=/opt/genieacs/genieacs.env
Environment=PATH=${GENIEACS_BIN_DIR}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=${GENIEACS_BIN_DIR}/genieacs-${svc}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
done
systemctl daemon-reload
systemctl reset-failed genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui 2>/dev/null || true
systemctl enable --now genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui

echo "==> 6/6 Buka firewall & verifikasi"
ufw allow 7547/tcp >/dev/null 2>&1 || true   # CWMP (ONU -> ACS)
ufw allow 7557/tcp >/dev/null 2>&1 || true   # NBI API (panel billing)
ufw allow 7567/tcp >/dev/null 2>&1 || true   # File server
ufw allow 3001/tcp >/dev/null 2>&1 || true   # GenieACS UI

for _ in {1..20}; do
  if curl -sf "http://127.0.0.1:7557/devices/?limit=1" >/dev/null; then
    break
  fi
  sleep 1
done
IP=$(hostname -I | awk '{print $1}')
echo
echo "--- Status service ---"
systemctl is-active genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui || true
echo
echo "--- Tes NBI API ---"
if curl -sf "http://127.0.0.1:7557/devices/?limit=1"; then
  echo
else
  echo "NBI gagal berjalan. Log terakhir:"
  journalctl -u genieacs-nbi -n 30 --no-pager || true
  exit 1
fi
echo
echo "==================== SELESAI ===================="
echo "Isi di menu TR-069 panel billing:"
echo "  URL NBI  : http://127.0.0.1:7557"
echo "  Username : (kosongkan)"
echo "  Password : (kosongkan)"
echo
echo "Setelan di ONU / MikroTik (TR-069 client):"
echo "  ACS URL  : http://${IP}:7547"
echo
echo "GenieACS UI: http://${IP}:3001"
echo "================================================"