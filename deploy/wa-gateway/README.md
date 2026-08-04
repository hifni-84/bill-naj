# WhatsApp API Self-Hosted (QR Scan)

Layanan WhatsApp API sendiri yang berjalan di server Ubuntu, dipanggil oleh
panel billing lewat HTTP localhost. Menggunakan pustaka **Baileys** — pindai
QR sekali, lalu pesan penagihan otomatis dikirim dari nomor Anda sendiri
(tanpa biaya per pesan).

## Catatan penting
- Ini **tidak resmi** WhatsApp. Pakai nomor sekunder/bisnis yang siap
  terkena risiko diblokir jika kirim terlalu masif. Untuk volume besar
  gunakan WhatsApp Business API resmi.
- Layanan ini hanya mendengarkan `127.0.0.1` (tidak bisa diakses luar).

## Instalasi (sekali)
```bash
cd ~/najwa-billing/deploy/wa-gateway
npm install
```

## Menjalankan
**Manual:**
```bash
npm start
```

**Pakai PM2 (otomatis jalan & auto-restart):**
```bash
pm2 start index.js --name wa-gateway
pm2 save
pm2 startup   # ikuti perintah yang muncul
```

## Pemakaian di billing
1. Di menu **Pengaturan → WhatsApp Gateway**, pilih provider **Self-hosted (QR)**.
2. URL API terisi otomatis `http://127.0.0.1:3100`.
3. Klik **Tampilkan QR** → pindai dengan WhatsApp (nomor pengirim) → **Tautkan perangkat**.
4. Status berubah menjadi **Terhubung**. Simpan pengaturan.
5. Penagihan otomatis & uji kirim kini memakai nomor Anda sendiri.

## Endpoint
| Method | Path       | Keterangan                          |
|--------|------------|-------------------------------------|
| GET    | `/status`  | Status koneksi (`open`/`qr`/`close`)|
| GET    | `/qr`      | QR code (data URL PNG)              |
| POST   | `/send`    | `{ "phone": "62xxx", "message": "..." }` |
| POST   | `/logout`  | Putus & hapus sesi (pindai ulang)   |

## Pindai ulang / ganti nomor
Klik tombol **Logout / Pindai Ulang** di Pengaturan, atau:
```bash
rm -rf deploy/wa-gateway/auth && pm2 restart wa-gateway
```
