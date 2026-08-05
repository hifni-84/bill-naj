# Aplikasi Android & iOS — NR Billing (Tutorial Lengkap)

Billing ini adalah aplikasi **server** (MySQL + RADIUS + MikroTik API + GenieACS),
jadi aplikasi HP dibuat dengan **Capacitor**: sebuah aplikasi native (APK/IPA) yang
di dalamnya menampilkan panel billing dari server Anda. Semua fitur (voucher, PPPoE,
TR-069, portal pelanggan, WhatsApp gateway, laporan) langsung ikut jalan di HP
tanpa perlu ditulis ulang.

```text
   [ HP Android / iOS ]                [ Server Ubuntu ]
   +-------------------+   HTTPS       +---------------------------+
   | APK "NR Billing"  | ------------> | NR Billing (port 3000)    |
   | (Capacitor shell) |               | MySQL + FreeRADIUS        |
   +-------------------+               | MikroTik API / GenieACS   |
                                       +---------------------------+
```

Penting: aplikasi HP **tidak menyimpan data**. Server wajib bisa diakses dari
internet (IP publik atau DDNS) supaya aplikasi bisa dipakai di luar rumah.

---

## BAGIAN 0 — Syarat sebelum mulai

| Kebutuhan | Android | iOS |
|---|---|---|
| Sistem operasi komputer | Windows / macOS / Linux | **wajib macOS** |
| Node.js | v20 atau lebih baru | sama |
| JDK | JDK 17 | – |
| IDE | Android Studio (versi terbaru) | Xcode 15+ |
| Akun berbayar | tidak perlu (kecuali Play Store $25 sekali) | Apple Developer $99/tahun |
| Server billing | sudah online + HTTPS | sudah online + **HTTPS wajib** |

Cek Node & JDK:

```bash
node -v      # harus v20.x atau lebih
java -version # harus 17.x untuk Android
```

---

## BAGIAN 1 — Pastikan server billing sudah online & HTTPS

Di server Ubuntu (via PuTTY):

```bash
cd /opt/mikrotik-billing
sudo bash deploy/go-online.sh domain najwa.ddns.net
```

Lalu buka `https://najwa.ddns.net` di browser HP memakai data seluler (bukan WiFi
rumah). Kalau panel muncul, berarti siap. Kalau tidak muncul:

1. Buka **port forward 80 dan 443** di router ke IP server Ubuntu.
2. Pastikan DDNS mengarah ke IP publik yang benar (`curl ifconfig.me` di server).
3. Isi menu **Pengaturan → Akses Publik (IP Publik / DDNS)** di billing.

> iOS memblokir `http://` biasa. Kalau belum punya HTTPS, aplikasi iOS akan
> tampil putih. Android masih bisa karena `allowMixedContent` sudah diaktifkan.

---

## BAGIAN 2 — Siapkan proyek di komputer (bukan di server)

```bash
git clone https://github.com/hifni-84/bill-naj.git
cd bill-naj
npm install
```

Edit `capacitor.config.ts`, ganti alamat server:

```ts
const SERVER_URL = process.env["MOBILE_SERVER_URL"] ?? "https://najwa.ddns.net";
```

Ganti juga identitas aplikasi bila mau:

```ts
appId: "net.ddns.najwa.billing",   // huruf kecil, format domain terbalik
appName: "NR Billing",             // nama yang tampil di HP
```

Alternatif tanpa mengedit file (sekali jalan):

```bash
MOBILE_SERVER_URL=https://najwa.ddns.net npx cap sync
```

---

## BAGIAN 3 — Build APK Android (langkah demi langkah)

### 3.1 Install Android Studio
1. Download dari https://developer.android.com/studio, install.
2. Buka Android Studio → **More Actions → SDK Manager**.
3. Tab **SDK Platforms**: centang **Android 14 (API 34)**.
4. Tab **SDK Tools**: centang **Android SDK Build-Tools**, **Platform-Tools**,
   **Command-line Tools**. Klik **Apply** dan tunggu unduhan selesai.

### 3.2 Tambahkan platform Android
```bash
npx cap add android
npx cap sync android
```
Folder baru `android/` akan muncul di proyek.

### 3.3 Buka & build
```bash
npx cap open android
```
Di Android Studio tunggu **Gradle sync** selesai (status bar bawah), lalu:

**Build → Build Bundle(s)/APK(s) → Build APK(s)**

Hasil ada di:
```text
android/app/build/outputs/apk/debug/app-debug.apk
```
Klik **locate** di notifikasi untuk membuka foldernya.

Alternatif tanpa membuka Android Studio (lewat terminal):
```bash
cd android
./gradlew assembleDebug        # Linux/macOS
gradlew.bat assembleDebug      # Windows
```

### 3.4 Install ke HP
- **Cara kabel**: aktifkan *Opsi Pengembang* → *USB Debugging* di HP, sambungkan,
  lalu di Android Studio pilih device dan tekan **Run ▶**.
- **Cara file**: kirim `app-debug.apk` ke HP (WhatsApp/Drive/USB), buka file,
  izinkan **Install dari sumber tidak dikenal**.

### 3.5 APK rilis (bertanda tangan, untuk dibagikan/Play Store)
Buat keystore sekali saja:
```bash
keytool -genkey -v -keystore nr-billing.keystore -alias nrbilling \
  -keyalg RSA -keysize 2048 -validity 10000
```
Simpan file `.keystore` dan passwordnya dengan aman — hilang = tidak bisa update
aplikasi di Play Store.

Lalu di Android Studio: **Build → Generate Signed Bundle / APK** → pilih **APK**
(untuk bagi manual) atau **Android App Bundle** (untuk Play Store) → pilih
keystore → **release** → **Finish**.

Hasil: `android/app/build/outputs/apk/release/app-release.apk`

---

## BAGIAN 4 — Build aplikasi iOS (wajib macOS)

### 4.1 Persiapan
```bash
xcode-select --install
sudo gem install cocoapods     # atau: brew install cocoapods
```

### 4.2 Tambahkan platform iOS
```bash
npx cap add ios
npx cap sync ios
npx cap open ios
```

### 4.3 Di Xcode
1. Pilih target **App** → tab **Signing & Capabilities**.
2. Centang **Automatically manage signing**, pilih **Team** (Apple ID Anda).
3. Ubah **Bundle Identifier** agar unik, contoh `net.ddns.najwa.billing`.
4. Pilih perangkat iPhone (atau Simulator) di bagian atas, tekan **Run ▶**.
5. Di iPhone: **Pengaturan → Umum → VPN & Manajemen Perangkat → Trust** developer.

### 4.4 Kirim ke App Store / TestFlight
**Product → Archive** → **Distribute App** → **App Store Connect** → **Upload**.
Butuh akun Apple Developer aktif ($99/tahun).

---

## BAGIAN 5 — Ikon & splash screen sendiri

1. Buat folder `resources/` di root proyek.
2. Simpan `icon.png` ukuran **1024×1024** dan `splash.png` ukuran **2732×2732**.
3. Jalankan:
```bash
npx @capacitor/assets generate
npx cap sync
```
Semua ukuran ikon Android & iOS dibuat otomatis. Build ulang APK setelahnya.

---

## BAGIAN 6 — Update aplikasi

| Yang diubah | Perlu build APK baru? |
|---|---|
| Fitur/tampilan billing di server | **Tidak** — cukup update server, aplikasi ikut berubah |
| Nama aplikasi / ikon / splash | Ya |
| Alamat server (`SERVER_URL`) | Ya |

Update server (di PuTTY):
```bash
cd /opt/mikrotik-billing && \
sudo git fetch --all && sudo git reset --hard origin/main && \
sudo chown -R $USER:$USER . && \
sudo bash deploy/install-ubuntu.sh && \
sudo systemctl restart mikrotik-billing && \
sudo systemctl restart wa-gateway 2>/dev/null; echo "OK"
```

---

## BAGIAN 7 — Troubleshooting

| Gejala | Penyebab & solusi |
|---|---|
| Layar putih/kosong di aplikasi | `SERVER_URL` salah atau server tidak bisa diakses dari internet. Coba buka URL itu di browser HP pakai data seluler. |
| Layar putih hanya di iOS | Server masih `http://`. Wajib HTTPS untuk iOS — jalankan `deploy/go-online.sh`. |
| "SSL error" / sertifikat tidak valid | Let's Encrypt belum jadi. Cek `sudo certbot certificates` di server. |
| Gradle sync gagal | JDK bukan 17. Android Studio → **Settings → Build Tools → Gradle → Gradle JDK** → pilih 17. |
| `npx cap add android` error | Jalankan `npm install` dulu; pastikan folder `android/` belum ada. |
| `cap sync` bilang webDir tidak ada | Pastikan folder `mobile/www` ada (sudah disertakan di repo). |
| APK terinstall tapi minta login terus | Cookie diblokir. Pastikan diakses via HTTPS domain yang sama, bukan campur IP dan domain. |
| Login demo | user `demo` / password `demo` (hanya bisa melihat). Admin default `admin` / `admin`. |

---

## Catatan keamanan

- Port RADIUS (1812/1813) dan API MikroTik (8728) **tidak perlu** dibuka ke internet;
  cukup port web 80/443.
- Ganti password admin default di **Pengaturan → Login Billing**.
- Aktivasi lisensi tetap berlaku di aplikasi HP karena diverifikasi di server.
  Hubungi **085121063293** untuk lisensi aktivasi.
