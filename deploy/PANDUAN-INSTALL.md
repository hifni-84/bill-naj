# Panduan Install NAJWA_BILLING di Ubuntu via PuTTY

## CARA TERCEPAT — Install langsung dari GitHub (1 perintah)

Login PuTTY sebagai root, lalu ketik:

```bash
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/hifni-84/bill-naj/main/deploy/install-from-git.sh)"
```

Script itu otomatis: install git → clone repo ke `/opt/mikrotik-billing` → jalankan `deploy/install-all.sh`
(Node.js 22, Nginx, build, systemd, MariaDB, FreeRADIUS, skema DB, NAS MikroTik).

Kalau ingin server bersih dulu:

```bash
apt-get update -y && apt-get install -y git
git clone https://github.com/hifni-84/bill-naj.git /opt/mikrotik-billing
cd /opt/mikrotik-billing
sudo bash deploy/cleanup-ubuntu.sh      # tambah --purge untuk buang paket lama
sudo bash deploy/install-all.sh
```

Update ke versi terbaru nanti:

```bash
cd /opt/mikrotik-billing && git pull && sudo bash deploy/install-ubuntu.sh
```

---

## CARA MANUAL (upload ZIP)

## LANGKAH 1 — Download project (di komputer Anda)

1. Buka project di Lovable editor
2. Klik tombol **Download / Export** (ikon download di toolbar)
3. Simpan file ZIP ke komputer Anda (misal: `najwa-billing.zip`)

## LANGKAH 2 — Upload ZIP ke server (di komputer Anda)

Pakai WinSCP atau pscp (dari PuTTY):

```bash
# Contoh pakai pscp (jalankan di CMD/PowerShell komputer Anda):
pscp najwa-billing.zip root@IP-SERVER:/root/
```

Ganti `IP-SERVER` dengan IP server Ubuntu Anda.

## LANGKAH 3 — Login PuTTY & siapkan file

Buka PuTTY → SSH ke server Anda, lalu ketik:

```bash
# Masuk ke folder home
cd /root

# Ekstrak ZIP
unzip najwa-billing.zip -d najwa-billing

# Masuk ke folder project
cd najwa-billing
```

> Jika dalam ZIP ada folder tambahan (mis: `najwa-billing/`), sesuaikan:
> `cd najwa-billing/najwa-billing` — pastikan Anda berada di folder yang ada file `package.json` dan folder `deploy/`.

## LANGKAH 4 — Bersihkan instalasi lama (FRESH)

```bash
# Jalankan script pembersih (tanpa --purge: hapus app/service/db lama, simpan paket sistem)
sudo bash deploy/cleanup-ubuntu.sh

# ATAU hapus total termasuk paket nginx/mariadb/freeradius/nodejs:
sudo bash deploy/cleanup-ubuntu.sh --purge
```

Ketik `YA` saat diminta konfirmasi.

## LANGKAH 5 — Install SEMUA (Panel + RADIUS + Database)

```bash
sudo bash deploy/install-all.sh
```

Script ini otomatis:
- Install Node.js 22, Nginx
- Build aplikasi (preset node-server → `.output/server/index.mjs`)
- Buat systemd service + Nginx reverse proxy
- Install MariaDB + FreeRADIUS
- Import skema database + tabel billing
- Daftarkan MikroTik sebagai NAS
- Simpan kredensial DB ke service env

## LANGKAH 6 — Buka akses dari luar (opsional)

### Mode Cloudflare Tunnel (paling mudah, tidak perlu IP publik):
```bash
sudo bash deploy/go-online.sh tunnel
```
Lalu ikuti petunjuk di layar (login Cloudflare, buat tunnel, arahkan domain).

### Mode domain + IP publik:
```bash
sudo bash deploy/go-online.sh domain billing.domain-anda.com
```

## LANGKAH 7 — Buka panel

Buka browser → `http://IP-SERVER/`
Login: `admin` / `admin` (ganti di menu Pengaturan)

## LANGKAH 8 — Sambungkan MikroTik ke RADIUS

Jalankan di terminal MikroTik (ganti `IP-SERVER`):

```mikrotik
/radius add service=hotspot,ppp address=IP-SERVER secret=SECRET-ANDA timeout=3s require-message-auth=no
/radius incoming set accept=yes port=3799
/ip hotspot profile set [find] use-radius=yes
/ppp aaa set use-radius=yes accounting=yes
```

`SECRET-ANDA` ditampilkan di akhir install-radius.sh (lihat output Langkah 5).

---

## Perintah berguna

```bash
# Cek status aplikasi
systemctl status mikrotik-billing

# Lihat log aplikasi real-time
journalctl -u mikrotik-billing -f

# Restart aplikasi
sudo systemctl restart mikrotik-billing

# Cek status FreeRADIUS
systemctl status freeradius

# Restart FreeRADIUS
sudo systemctl restart freeradius

# Cek status Nginx
systemctl status nginx

# Rebuild ulang (setelah update kode)
sudo bash deploy/install-ubuntu.sh
```

## Troubleshooting

**Halaman blank / error 500:**
```bash
journalctl -u mikrotik-billing -n 50 --no-pager
```

**Database tidak tersambung:**
```bash
# Cek kredensial yang tersimpan
cat /etc/systemd/system/mikrotik-billing.service.d/radius.conf
# Test koneksi MySQL
mysql -u radius -p -h 127.0.0.1 radius
```

**Build gagal:**
```bash
cd /root/najwa-billing
npm install --legacy-peer-deps
NITRO_PRESET=node-server npm run build
```
