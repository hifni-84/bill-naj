#!/usr/bin/env bash
# =============================================================
#  Instal NAJWA_BILLING langsung dari repository GitHub
#  Pakai:
#    sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/hifni-84/bill-naj/main/deploy/install-from-git.sh)"
#  atau:
#    sudo bash deploy/install-from-git.sh [URL-REPO] [BRANCH]
# =============================================================
set -euo pipefail

REPO="${1:-https://github.com/hifni-84/bill-naj.git}"
BRANCH="${2:-main}"
TARGET="${TARGET:-/opt/mikrotik-billing}"

[ "$(id -u)" -eq 0 ] || { echo "Jalankan dengan sudo."; exit 1; }

echo "==> Memasang git"
apt-get update -y
apt-get install -y git curl ca-certificates unzip

if [ -d "$TARGET/.git" ]; then
  echo "==> Update kode di $TARGET"
  git -C "$TARGET" fetch --all
  git -C "$TARGET" reset --hard "origin/$BRANCH"
else
  echo "==> Clone $REPO ke $TARGET"
  rm -rf "$TARGET"
  git clone --depth 1 -b "$BRANCH" "$REPO" "$TARGET"
fi

# Repo di-clone sebagai root; install-ubuntu.sh menjalankan npm sebagai
# APP_USER (SUDO_USER). Pastikan APP_USER punya hak tulis agar npm install
# bisa membuat /opt/mikrotik-billing/node_modules tanpa EACCES.
APP_USER="${SUDO_USER:-$USER}"
[ "$APP_USER" = "root" ] && APP_USER="$(stat -c '%U' /home 2>/dev/null | grep -v '^$' | head -1)"
[ -n "$APP_USER" ] && [ "$APP_USER" != "root" ] && chown -R "$APP_USER":"$APP_USER" "$TARGET"

cd "$TARGET"
echo "==> Menjalankan instalasi lengkap"
bash deploy/install-all.sh
