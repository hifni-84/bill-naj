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

cd "$TARGET"
echo "==> Menjalankan instalasi lengkap"
bash deploy/install-all.sh
