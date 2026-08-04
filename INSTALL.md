# NAJWA_BILLING — Instalasi di Ubuntu Server (lewat PuTTY)

Repo: `https://github.com/najwacell220-netizen/NAJWA-BILLHOTSPOT.git`

## 1. Tempel di PuTTY (sekali jalan)

```sh
sudo apt update && sudo apt install -y git curl
cd ~
git clone https://github.com/najwacell220-netizen/NAJWA-BILLHOTSPOT.git najwa-billing
cd najwa-billing
sudo bash deploy/install-all.sh
```

Skrip ini memasang: Node.js 22, Nginx (reverse proxy port 80), service systemd
auto-start, MariaDB, FreeRADIUS, tabel billing, dan mendaftarkan MikroTik
sebagai NAS. Proses build 3–6 menit.

Di akhir akan tercetak **NAS secret** — catat, dipakai di MikroTik.

## 2. Buka panel

```
http://<IP-SERVER>/
```
Login awal: `admin` / `admin` (ubah di menu **Pengaturan**).

## 3. Konfigurasi MikroTik (Terminal Winbox)

```
/radius add service=hotspot,ppp address=IP-SERVER secret=SECRET-DARI-SKRIP \
    timeout=3s require-message-auth=no
/radius incoming set accept=yes port=3799
/ip hotspot profile set [find] use-radius=yes
/ppp aaa set use-radius=yes accounting=yes

# agar panel bisa baca router (opsional, untuk monitor)
/ip service set www port=8525 disabled=no
/user add name=apibilling password=RahasiaKuat group=full
```

Lalu isi IP router, port `8525`, user & password di menu **Pengaturan** panel.

## 4. Perintah harian

| Tujuan | Perintah |
| --- | --- |
| Status panel | `systemctl status mikrotik-billing --no-pager` |
| Log panel | `journalctl -u mikrotik-billing -f` |
| Status RADIUS | `systemctl status freeradius --no-pager` |
| Debug RADIUS | `sudo systemctl stop freeradius && sudo freeradius -X` |
| Update kode | `cd ~/najwa-billing && git pull && npm install --legacy-peer-deps && NITRO_PRESET=node-server npm run build && sudo systemctl restart mikrotik-billing` |

## 5. Masalah umum

| Gejala | Solusi |
| --- | --- |
| "Welcome to nginx" | `sudo rm -f /etc/nginx/sites-enabled/default && sudo systemctl reload nginx` |
| 502 Bad Gateway | Panel belum jalan: `journalctl -u mikrotik-billing -n 50 --no-pager` |
| Voucher tak bisa login | Cek `sudo freeradius -X` saat user mencoba login |
| Minta password saat clone | Jadikan repo **Public** di GitHub Settings → Change visibility |

## RADIUS server tidak merespon

Bila log MikroTik menampilkan `RADIUS server is not responding`:

```sh
cd ~/najwa-billing && git pull
sudo bash deploy/fix-radius-server.sh
```

Skrip membuka UDP 1812/1813/3799, memaksa FreeRADIUS mendengarkan di semua
interface, mendaftarkan ulang NAS MikroTik, lalu mencetak NAS secret + perintah
yang harus dijalankan di terminal MikroTik.
