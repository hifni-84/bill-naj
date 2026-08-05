import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Aplikasi Android & iOS untuk NR Billing.
 *
 * Billing ini butuh server (MySQL/RADIUS/MikroTik API), jadi aplikasi native
 * berjalan sebagai wrapper yang menampilkan panel billing dari server Anda.
 * Ubah `SERVER_URL` ke domain/IP publik server billing Anda.
 */
const SERVER_URL = process.env["MOBILE_SERVER_URL"] ?? "https://najwa.ddns.net";

const config: CapacitorConfig = {
  appId: "net.ddns.najwa.billing",
  appName: "NR Billing",
  webDir: "mobile/www",
  server: {
    url: SERVER_URL,
    cleartext: SERVER_URL.startsWith("http://"),
    androidScheme: "https",
  },
  android: {
    allowMixedContent: true,
  },
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#0b1220",
      showSpinner: false,
    },
  },
};

export default config;