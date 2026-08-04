/**
 * Self-hosted WhatsApp API Gateway
 * --------------------------------
 * Layanan Node.js terpisah yang terhubung ke WhatsApp Web (pustaka Baileys)
 * dengan sekali pindai QR. Billing panel memanggil layanan ini lewat HTTP
 * localhost untuk mengirim pesan penagihan otomatis.
 *
 * Endpoint (bind 127.0.0.1, PORT default 3100):
 *   GET  /status  -> { state, user, qr }      status koneksi
 *   GET  /qr      -> { qr } (data URL PNG)    QR untuk dipindai
 *   POST /send    -> { phone, message }        kirim pesan teks
 *   POST /logout                            putus & hapus sesi (pindai ulang)
 *
 * Sesi tersimpan di folder ./auth sehingga restart tidak perlu pindai ulang.
 *
 * Jalankan:  npm install && npm start
 * PM2:       pm2 start deploy/wa-gateway/index.js --name wa-gateway
 */
import express from "express";
import pino from "pino";
import QRCode from "qrcode";
import {
  useMultiFileAuthState,
  makeWASocket,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.WA_PORT || 3100);
const AUTH_DIR = join(__dirname, "auth");

const logger = pino({ level: "silent" }); // matikan log berisik Baileys

let sock = null;
let lastQr = ""; // data URL QR terakhir
let connState = "connecting"; // connecting | open | close | qr
let waUser = ""; // nomor yang login (62xxx)

async function startSock() {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ["NAJWA-Billing", "Chrome", "1.0.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (upd) => {
    const { connection, lastDisconnect, qr } = upd;

    if (qr) {
      lastQr = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
      connState = "qr";
      console.log("[wa-gateway] QR siap dipindai — buka /qr di billing");
    }

    if (connection === "open") {
      connState = "open";
      lastQr = "";
      try {
        const me = sock.user?.id?.split(":")[0] || "";
        waUser = me;
        console.log(`[wa-gateway] Terhubung sebagai ${waUser}`);
      } catch {
        waUser = "";
      }
    }

    if (connection === "close") {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      connState = "close";
      console.log(`[wa-gateway] Terputus (kode ${reason}).`);
      // 5150 / 410 / 500 → buat ulang koneksi; 401 (logout) → jangan reconnect
      if (reason !== DisconnectReason.loggedOut) {
        setTimeout(startSock, 3000);
      } else {
        console.log("[wa-gateway] Sesi di-logout. Hapus folder auth & restart untuk pindai ulang.");
      }
    }
  });
}

/** Hapus folder auth untuk pindai QR baru. */
async function clearAuth() {
  lastQr = "";
  waUser = "";
  connState = "close";
  try {
    if (existsSync(AUTH_DIR)) {
      const { rmSync } = await import("node:fs");
      rmSync(AUTH_DIR, { recursive: true, force: true });
    }
  } catch (e) {
    console.error("[wa-gateway] Gagal hapus auth:", e.message);
  }
}

// ---- HTTP API ----
const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/status", (_req, res) => {
  res.json({ state: connState, user: waUser, qr: lastQr ? true : false });
});

app.get("/qr", (_req, res) => {
  if (!lastQr) {
    return res.status(404).json({ qr: "", error: "QR belum tersedia. Tunggu koneksi atau lakukan logout." });
  }
  res.json({ qr: lastQr });
});

app.post("/send", async (req, res) => {
  const { phone, message } = req.body || {};
  if (!phone || !message) return res.status(400).json({ ok: false, error: "phone & message wajib diisi" });
  if (connState !== "open" || !sock) return res.status(503).json({ ok: false, error: "WhatsApp belum terhubung" });

  // normalisasi nomor ke 62xxx@s.whatsapp.net
  let jid = String(phone).replace(/\D/g, "");
  if (jid.startsWith("0")) jid = `62${jid.slice(1)}`;
  else if (jid.startsWith("8")) jid = `62${jid}`;
  if (!jid.endsWith("@s.whatsapp.net")) jid = `${jid}@s.whatsapp.net`;

  try {
    await sock.sendMessage(jid, { text: String(message) });
    res.json({ ok: true, info: "baileys" });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message?.slice(0, 200) || "Gagal kirim" });
  }
});

app.post("/logout", async (_req, res) => {
  try {
    if (sock) await sock.logout().catch(() => {});
  } catch {
    /* ignore */
  }
  await clearAuth();
  setTimeout(startSock, 1500); // mulai ulang untuk QR baru
  res.json({ ok: true, info: "Sesi dihapus. QR baru akan tersedia." });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[wa-gateway] API berjalan di http://127.0.0.1:${PORT}`);
  startSock().catch((e) => console.error("[wa-gateway] Gagal mulai:", e.message));
});
