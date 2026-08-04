# Membuka NAJWA_BILLING ke Jaringan Luar (Online)

Saat ini panel hanya bisa dibuka lewat IP lokal (mis. `http://192.168.88.10`).
Berikut tiga cara membuatnya bisa diakses dari internet. Router MikroTik
**tetap tidak perlu** diekspos ke internet pada semua cara di bawah.

---

## Cara 1 — Cloudflare Tunnel (disarankan)

Cocok bila server dipasang di rumah/kantor tanpa IP publik (CGNAT / IP dinamis).
Tidak perlu port forward, HTTPS otomatis.

```sh
cd ~/najwa-billing && git pull
sudo bash deploy/go-online.sh tunnel
```

Lalu ikuti langkah interaktif yang ditampilkan:

```sh
cloudflared tunnel login
cloudflared tunnel create najwa-billing
cloudflared tunnel route dns najwa-billing billing.domain-anda.com
sudo nano /etc/cloudflared/config.yml
sudo cloudflared service install
sudo systemctl restart cloudflared
```

Isi `config.yml`:

```yaml
tunnel: najwa-billing
credentials-file: /root/.cloudflared/<TUNNEL-ID>.json
ingress:
  - hostname: billing.domain-anda.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

Selesai — buka `https://billing.domain-anda.com` dari mana saja.

---

## Cara 2 — Domain + IP publik (VPS atau IP publik dari ISP)

Arahkan dulu DNS **A record** domain ke IP publik server, lalu:

```sh
cd ~/najwa-billing && git pull
sudo bash deploy/go-online.sh domain billing.domain-anda.com
```

Skrip memasang Nginx, membuka port 80/443, dan menerbitkan sertifikat HTTPS
Let's Encrypt (auto-renew).

Jika server ada di belakang router, forward dulu di MikroTik:

```
/ip firewall nat add chain=dstnat protocol=tcp dst-port=80  action=dst-nat to-addresses=192.168.88.10 to-ports=80
/ip firewall nat add chain=dstnat protocol=tcp dst-port=443 action=dst-nat to-addresses=192.168.88.10 to-ports=443
```

---

## Cara 3 — Tanpa domain (cepat, sementara)

Port forward `80` ke server, lalu akses lewat IP publik atau DDNS MikroTik:

```
/ip cloud set ddns-enabled=yes
/ip cloud print          # tampilkan nama DDNS, mis. xxxxxx.sn.mynetname.net
```

Akses: `http://xxxxxx.sn.mynetname.net`
Catatan: tanpa HTTPS, jangan dipakai jangka panjang.

---

## Keamanan wajib setelah online

1. **Ganti user/password login** panel (default `admin` / `admin`) di menu
   **Pengaturan → Akun**.
2. Jangan buka port RADIUS (1812/1813) dan MySQL (3306) ke internet — biarkan
   hanya di jaringan lokal.
3. Batasi akses REST API MikroTik hanya dari IP server:
   ```
   /ip service set www address=192.168.88.0/24
   ```
4. Aktifkan firewall server:
   ```sh
   sudo ufw allow 22,80,443/tcp && sudo ufw enable
   ```
5. Pakai HTTPS (Cara 1 atau 2) agar password tidak terkirim polos.
