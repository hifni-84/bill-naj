# Aplikasi Android & iOS — NR Billing

Billing ini adalah aplikasi server (MySQL + RADIUS + MikroTik API), jadi aplikasi
Android/iOS dibuat dengan **Capacitor** sebagai aplikasi native yang menampilkan
panel billing dari server Anda. Semua fitur (voucher, PPPoE, TR-069, portal, WA)
ikut jalan di HP tanpa perlu ditulis ulang.

## 1. Arahkan aplikasi ke server Anda

Edit `capacitor.config.ts` bagian `SERVER_URL`, contoh:

```ts
const SERVER_URL = "https://najwa.ddns.net";
```

Server sebaiknya sudah HTTPS (jalankan `sudo bash deploy/go-online.sh domain <domain>`),
karena iOS memblokir koneksi `http://` biasa.

## 2. Siapkan proyek native (di komputer, bukan di server)

```bash
git clone https://github.com/hifni-84/bill-naj.git
cd bill-naj
npm install
npx cap add android      # butuh Android Studio + JDK 17
npx cap add ios          # butuh macOS + Xcode
npx cap sync
```

## 3. Build APK Android

```bash
npx cap open android
```

Di Android Studio: **Build → Build Bundle(s)/APK(s) → Build APK(s)**.
File hasil: `android/app/build/outputs/apk/debug/app-debug.apk`.

Untuk rilis Play Store: buat keystore, lalu **Build → Generate Signed Bundle (AAB)**.

## 4. Build iOS (wajib macOS)

```bash
npx cap open ios
```

Di Xcode: pilih Team di **Signing & Capabilities**, pilih perangkat, tekan **Run**.
Untuk App Store: **Product → Archive → Distribute App**.

## 5. Update aplikasi

Karena aplikasi memuat panel dari server, setiap update billing di server otomatis
terlihat di aplikasi — tidak perlu build ulang APK. Build ulang hanya diperlukan
kalau mengubah nama/ikon/URL server.

## Ikon & splash screen

Letakkan `icon.png` (1024×1024) dan `splash.png` (2732×2732) di folder `resources/`, lalu:

```bash
npx capacitor-assets generate
```

## Catatan

- Port RADIUS/API MikroTik tidak perlu dibuka ke internet; cukup port web billing.
- Untuk akses dari luar jaringan, isi menu **Pengaturan → Akses Publik (IP Publik / DDNS)**.
- Aplikasi tetap berjalan normal di browser; Capacitor hanya dipakai saat build native.