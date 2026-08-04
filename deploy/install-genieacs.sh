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
  if ! apt-get install -y mongodb-server 2>/dev/null; then
    . /etc/os-release
    curl -fsSL https://pgp.mongodb.com/server-7.0.asc \
      | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
    echo "deb [signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] https://repo.mongodb.org/apt/ubuntu ${UBUNTU_CODENAME:-jammy}/mongodb-org/7.0 multiverse" \
      > /etc/apt/sources.list.d/mongodb-org-7.0.list
    apt-get update -y
    apt-get install -y mongodb-org
  fi
fi
systemctl enable --now mongod 2>/dev/null || systemctl enable --now mongodb 2>/dev/null || true

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
GENIEACS_NBI_INTERFACE=0.0.0.0
GENIEACS_CWMP_INTERFACE=0.0.0.0
GENIEACS_FS_INTERFACE=0.0.0.0
GENIEACS_UI_INTERFACE=0.0.0.0
EOF
  chown genieacs:genieacs /opt/genieacs/genieacs.env
  chmod 600 /opt/genieacs/genieacs.env
fi

echo "==> 5/6 Buat service systemd"
for svc in cwmp nbi fs ui; do
  cat > /etc/systemd/system/genieacs-${svc}.service <<EOF
[Unit]
Description=GenieACS ${svc}
After=network.target mongod.service

[Service]
User=genieacs
EnvironmentFile=/opt/genieacs/genieacs.env
ExecStart=/usr/bin/env genieacs-${svc}
Restart=always

[Install]
WantedBy=multi-user.target
EOF
done
systemctl daemon-reload
systemctl enable --now genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui

echo "==> 6/6 Buka firewall & verifikasi"
ufw allow 7547/tcp >/dev/null 2>&1 || true   # CWMP (ONU -> ACS)
ufw allow 7557/tcp >/dev/null 2>&1 || true   # NBI API (panel billing)
ufw allow 7567/tcp >/dev/null 2>&1 || true   # File server
ufw allow 3000/tcp >/dev/null 2>&1 || true   # GenieACS UI

sleep 4
IP=$(hostname -I | awk '{print $1}')
echo
echo "--- Status service ---"
systemctl is-active genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui || true
echo
echo "--- Tes NBI API ---"
curl -sf "http://127.0.0.1:7557/devices/?limit=1" && echo || echo "NBI belum merespons, cek: journalctl -u genieacs-nbi -n 50"
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
echo "GenieACS UI: http://${IP}:3000"
echo "================================================"