# Instalasi di Server Ubuntu

Panduan menjalankan Panel Billing MikroTik di Ubuntu 22.04 / 24.04.
Keuntungan self-host: server bisa satu jaringan dengan MikroTik, jadi router
**tidak perlu** diekspos ke internet — cukup pakai IP lokal (mis. `192.168.88.1`).

## Cara cepat (otomatis)

```sh
sudo apt update && sudo apt install -y git curl
git clone <url-repo-anda> mikrotik-billing
cd mikrotik-billing
sudo bash deploy/install-ubuntu.sh
```

Skrip di atas akan: memasang Node.js 22 + Nginx, build aplikasi,
membuat service systemd (auto-start saat boot), dan mengaktifkan reverse proxy
di port 80. Setelah selesai buka `http://<IP-SERVER>/`.

## Cara manual

```sh
# 1. Node.js 22 (TanStack Start memerlukan minimal 22.12)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx

# 2. Build (preset Node, bukan edge)
#    npm install juga memperbaiki package-lock.json yang tidak sinkron
npm install --legacy-peer-deps
NITRO_PRESET=node-server npm run build

# 3. Uji jalan
PORT=3000 node .output/server/index.mjs
```

Lalu pilih salah satu supervisor:

**systemd**

```sh
sudo cp deploy/mikrotik-billing.service /etc/systemd/system/
sudo sed -i "s|__APP_DIR__|$PWD|g;s|__APP_USER__|$USER|g;s|__PORT__|3000|g" \
  /etc/systemd/system/mikrotik-billing.service
sudo systemctl daemon-reload && sudo systemctl enable --now mikrotik-billing
```

**PM2**

```sh
sudo npm i -g pm2
pm2 start deploy/ecosystem.config.cjs && pm2 save && pm2 startup
```

**Nginx**

```sh
sudo cp deploy/nginx.conf /etc/nginx/sites-available/mikrotik-billing
sudo sed -i "s|__PORT__|3000|g" /etc/nginx/sites-available/mikrotik-billing
sudo ln -sf /etc/nginx/sites-available/mikrotik-billing /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## HTTPS (opsional, jika punya domain)

```sh
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d billing.domain-anda.com
```

## Sisi MikroTik

```
/ip service enable www
/user add name=apibilling password=RahasiaKuat group=full
# batasi akses hanya dari server:
/ip service set www address=192.168.88.0/24
```

Lalu isi IP/port/user/password router di menu **Pengaturan** panel.

## Perintah harian

| Tujuan | Perintah |
| --- | --- |
| Status | `systemctl status mikrotik-billing` |
| Log langsung | `journalctl -u mikrotik-billing -f` |
| Restart | `sudo systemctl restart mikrotik-billing` |
| Update kode | `git pull && npm install --legacy-peer-deps && NITRO_PRESET=node-server npm run build && sudo systemctl restart mikrotik-billing` |

## Masalah umum

| Gejala | Solusi |
| --- | --- |
| 502 Bad Gateway | Service belum jalan — cek `journalctl -u mikrotik-billing -f` |
| Port 3000 dipakai | Ubah `PORT` di service/PM2 dan di `nginx.conf` |
| Tidak bisa hubungi router | Cek `/ip service www` aktif & firewall router mengizinkan IP server |
| `.output` tidak ada | Build belum dijalankan dengan `NITRO_PRESET=node-server` |
| `npm ci` gagal / lockfile tidak sinkron | Jalankan `npm install --legacy-peer-deps`, lalu build ulang |
| Peringatan `EBADENGINE` | Upgrade ke Node.js 22.12 atau lebih baru |
