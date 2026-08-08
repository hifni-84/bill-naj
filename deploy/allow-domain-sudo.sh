#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -ne 0 ]] && { echo "Jalankan dengan sudo."; exit 1; }

APP_DIR="${2:-/opt/mikrotik-billing}"
APP_USER="${1:-$(stat -c '%U' "$APP_DIR" 2>/dev/null || echo najwa)}"
SCRIPT="${APP_DIR}/deploy/apply-domain.sh"

chmod 750 "$SCRIPT"
chown root:root "$SCRIPT"

FILE="/etc/sudoers.d/billing-domain"
cat > "$FILE" <<CFG
${APP_USER} ALL=(root) NOPASSWD: ${SCRIPT}
CFG
chmod 440 "$FILE"
visudo -c -f "$FILE"
echo "OK: user ${APP_USER} boleh menerapkan domain + SSL dari panel billing."
