# NAJWA_BILLING — Generator Kode Aktivasi (Windows)

Kode aktivasi dihitung dari **Software ID billing** + **Software ID / lisensi MikroTik** + **pilihan masa aktif**,
memakai HMAC-SHA256 dengan secret rahasia. Kode hanya valid di server billing dan router yang sama.

Masa aktif tersedia: **3 Hari**, **1 Bulan**, **1 Tahun**, **Selamanya (Lifetime)**.
Contoh: kode 3 hari → billing hanya bisa dipakai 3 hari sejak kode diaktifkan.

## Cara tercepat (tanpa install)
Kirim/kopi file `keygen.html` ke PC Windows, klik dua kali → terbuka di browser → isi data → **Buat Kode**.
Bekerja penuh offline.

## Membuat file .exe (aplikasi Windows)
Di PC Windows yang sudah ada Node.js:

```bat
cd tools\keygen
npm install
npm run build:win
```

Hasil: `tools\keygen\release\NAJWA-Keygen-win32-x64\NAJWA-Keygen.exe` (portable, tinggal dijalankan).
Untuk uji coba langsung tanpa build: `npm start`.

## Secret rahasia
Secret bawaan: `NAJWA-BILLING-2026-LICENSE-V1`.
Ganti agar tidak bisa dipalsukan orang lain:

1. Di server billing: tambahkan `LICENSE_SECRET=rahasia-anda` pada environment layanan, lalu restart.
2. Di generator: isi kolom **Secret** dengan nilai yang sama.

Jangan bagikan generator maupun secret ke pelanggan.
