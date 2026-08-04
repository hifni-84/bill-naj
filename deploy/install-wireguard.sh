#!/usr/bin/env bash
# =====================================================================
#  WireGuard VPN untuk MikroTik Billing (Najwa Billing)
#  Menghubungkan MikroTik yang TIDAK satu jaringan dengan server Ubuntu
#  agar server bisa akses API MikroTik (8728/8729/80) tanpa port publik.
#
#  Pakai:
#    sudo bash deploy/install-wireguard.sh            # pasang server + peer router1
#    sudo bash deploy/install-wireguard.sh router2    # tambah peer baru
# =====================================================================
set -euo pipefail

PEER_NAME="${1:-router1}"
WG_IF="wg0"
WG_PORT="${WG_PORT:-51820}"
WG_NET="10.20.20"
SERVER_IP="${WG_NET}.1"
CONF="/etc/wireguard/${WG_IF}.conf"
STATE_DIR="/etc/wireguard/peers"

if [[ $EUID -ne 0 ]]; then echo "Jalankan dengan sudo."; exit 1; fi

echo "==> [1/5] Install WireGuard"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y wireguard wireguard-tools qrencode iptables >/dev/null

mkdir -p "$STATE_DIR"
chmod 700 /etc/wireguard "$STATE_DIR"

PUBLIC_HOST="${PUBLIC_HOST:-$(curl -s -4 --max-time 5 ifconfig.me || true)}"
[[ -z "$PUBLIC_HOST" ]] && PUBLIC_HOST="GANTI_DENGAN_IP_ATAU_DDNS_SERVER"

if [[ ! -f "$CONF" ]]; then
  echo "==> [2/5] Membuat server WireGuard baru"
  umask 077
  wg genkey > /etc/wireguard/server.key
  wg pubkey < /etc/wireguard/server.key > /etc/wireguard/server.pub
  NIC="$(ip route show default | awk '/default/ {print $5; exit}')"
  cat > "$CONF" <<CFG
[Interface]
Address = ${SERVER_IP}/24
ListenPort = ${WG_PORT}
PrivateKey = $(cat /etc/wireguard/server.key)
PostUp   = iptables -A FORWARD -i ${WG_IF} -j ACCEPT; iptables -t nat -A POSTROUTING -o ${NIC} -j MASQUERADE
PostDown = iptables -D FORWARD -i ${WG_IF} -j ACCEPT; iptables -t nat -D POSTROUTING -o ${NIC} -j MASQUERADE
CFG
  sed -i 's/^#\?net.ipv4.ip_forward.*/net.ipv4.ip_forward=1/' /etc/sysctl.conf
  grep -q '^net.ipv4.ip_forward=1' /etc/sysctl.conf || echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf
  sysctl -p >/dev/null
  systemctl enable --now "wg-quick@${WG_IF}" >/dev/null
  command -v ufw >/dev/null && ufw allow "${WG_PORT}"/udp >/dev/null 2>&1 || true
else
  echo "==> [2/5] Server WireGuard sudah ada, lanjut tambah peer"
fi

echo "==> [3/5] Menyiapkan peer: ${PEER_NAME}"
# cari IP peer berikutnya (mulai .2)
LAST=$(grep -oP "AllowedIPs = ${WG_NET}\.\K[0-9]+" "$CONF" | sort -n | tail -1 || true)
NEXT=$(( ${LAST:-1} + 1 ))
PEER_IP="${WG_NET}.${NEXT}"

umask 077
wg genkey > "${STATE_DIR}/${PEER_NAME}.key"
wg pubkey < "${STATE_DIR}/${PEER_NAME}.key" > "${STATE_DIR}/${PEER_NAME}.pub"

cat >> "$CONF" <<CFG

# peer: ${PEER_NAME}
[Peer]
PublicKey = $(cat "${STATE_DIR}/${PEER_NAME}.pub")
AllowedIPs = ${PEER_IP}/32
CFG

echo "==> [4/5] Reload WireGuard"
systemctl restart "wg-quick@${WG_IF}"

echo "==> [5/5] Selesai"
cat <<INFO

=====================================================================
 KONFIGURASI MIKROTIK (copy-paste ke terminal Winbox / SSH)
=====================================================================
/interface wireguard
add name=wg-billing listen-port=13231 private-key="$(cat "${STATE_DIR}/${PEER_NAME}.key")"

/ip address
add address=${PEER_IP}/24 interface=wg-billing

/interface wireguard peers
add interface=wg-billing public-key="$(cat /etc/wireguard/server.pub)" \\
    endpoint-address=${PUBLIC_HOST} endpoint-port=${WG_PORT} \\
    allowed-address=${WG_NET}.0/24 persistent-keepalive=25s

# izinkan server billing akses API + RADIUS lewat tunnel
/ip service set api disabled=no
/ip firewall filter
add chain=input in-interface=wg-billing action=accept comment="WG Billing" place-before=0

# arahkan RADIUS ke IP server via tunnel
/radius
add address=${SERVER_IP} secret=rahasia123 service=hotspot,ppp timeout=3s
/ip hotspot profile set [find] use-radius=yes
/ppp aaa set use-radius=yes

=====================================================================
 DI BILLING (menu Pengaturan / NAS)
=====================================================================
 Host MikroTik API : ${PEER_IP}
 Port API          : 8728  (atau 8729 untuk api-ssl)
 NAS IP RADIUS     : ${PEER_IP}
 Secret RADIUS     : rahasia123

 Cek tunnel di server:  sudo wg show
 Tes konektivitas    :  ping ${PEER_IP}  &&  nc -zv ${PEER_IP} 8728
=====================================================================
INFO
