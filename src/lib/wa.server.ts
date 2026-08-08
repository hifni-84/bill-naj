/**
 * WhatsApp Gateway untuk penagihan otomatis.
 * Mendukung Fonnte, Wablas, dan endpoint custom (POST JSON).
 * Pesan berisi link ke portal pembayaran pelanggan.
 */
import {
  normalizeWaNumber,
  parseWaOptions,
  rupiah,
  type Invoice,
  type WaOptions,
} from "./invoice-types";
import { getSettings, query } from "./radius.server";

export async function waOptions(): Promise<WaOptions> {
  return parseWaOptions(await getSettings());
}

let phoneReady = false;
/** Kolom nomor WA pelanggan pada billing_voucher. */
export async function ensurePhoneColumn() {
  if (phoneReady) return;
  try {
    await query("ALTER TABLE billing_voucher ADD COLUMN phone VARCHAR(32) NOT NULL DEFAULT ''");
  } catch {
    /* kolom sudah ada */
  }
  phoneReady = true;
}

let waLogReady = false;
async function ensureLogTable() {
  if (waLogReady) return;
  await query(
    `CREATE TABLE IF NOT EXISTS billing_wa_log (
       id         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
       invoice_id INT NOT NULL DEFAULT 0,
       phone      VARCHAR(32) NOT NULL DEFAULT '',
       ok         TINYINT(1) NOT NULL DEFAULT 0,
       info       VARCHAR(255) NOT NULL DEFAULT '',
       sent_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       KEY idx_inv (invoice_id)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );
  waLogReady = true;
}

/** Alamat publik panel: dari pengaturan payment gateway atau Akses Publik. */
export async function publicBaseUrl() {
  const s = await getSettings();
  const gw = (s["billing.pay.baseUrl"] ?? "").trim().replace(/\/+$/, "");
  if (gw) return gw;
  const host = (s["billing.public.host"] ?? "").trim();
  if (!host) return "";
  const port = (s["billing.public.port"] ?? "").trim();
  const proto = s["billing.public.https"] === "1" ? "https" : "http";
  return `${proto}://${host}${port ? `:${port}` : ""}`;
}

const tanggal = (v: string | null) =>
  v
    ? new Date(v.endsWith("Z") ? v : `${v.replace(" ", "T")}Z`).toLocaleString("id-ID", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
      })
    : "-";

export function buildInvoiceMessage(
  tpl: string,
  inv: Pick<Invoice, "username" | "plan" | "amount" | "due_date">,
  merchant: string,
  link: string,
) {
  return tpl
    .replaceAll("{nama}", inv.username)
    .replaceAll("{username}", inv.username)
    .replaceAll("{paket}", inv.plan)
    .replaceAll("{nominal}", rupiah(Number(inv.amount) || 0))
    .replaceAll("{jatuh_tempo}", tanggal(inv.due_date ?? null))
    .replaceAll("{merchant}", merchant)
    .replaceAll("{link}", link);
}

/** Kirim satu pesan WhatsApp lewat gateway yang dipilih. */
export async function sendWa(to: string, message: string, opt?: WaOptions) {
  const o = opt ?? (await waOptions());
  const target = normalizeWaNumber(to);
  if (!target) throw new Error("Nomor WhatsApp pelanggan belum diisi");

  if (o.provider === "self") {
    const base = (o.apiUrl || "http://127.0.0.1:3100").replace(/\/+$/, "");
    const res = await fetch(`${base}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: target, message }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || json.ok === false) {
      throw new Error(json.error || `Self-hosted WA gagal (${res.status})`);
    }
    return { ok: true as const, info: "Self-hosted (QR)" };
  }

  if (!o.token && o.provider !== "custom") throw new Error("Token WhatsApp gateway belum diisi");

  if (o.provider === "fonnte") {
    const body = new URLSearchParams({ target, message });
    if (o.sender) body.set("countryCode", "62");
    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: o.token },
      body,
    });
    const json = (await res.json().catch(() => ({}))) as { status?: boolean; reason?: string };
    if (!res.ok || json.status === false) {
      throw new Error(json.reason || `Fonnte gagal (${res.status})`);
    }
    return { ok: true as const, info: "Fonnte" };
  }

  if (o.provider === "wablas") {
    const host = (o.apiUrl || "https://console.wablas.com").replace(/\/+$/, "");
    const auth = o.secret ? `${o.token}.${o.secret}` : o.token;
    const res = await fetch(`${host}/api/send-message`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ phone: target, message, ...(o.sender ? { secret: o.sender } : {}) }),
    });
    const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string };
    if (!res.ok || json.status === false) {
      throw new Error(json.message || `Wablas gagal (${res.status})`);
    }
    return { ok: true as const, info: "Wablas" };
  }

  if (!o.apiUrl) throw new Error("URL API WhatsApp gateway belum diisi");
  const res = await fetch(o.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(o.token ? { Authorization: o.token } : {}),
    },
    body: JSON.stringify({ target, phone: target, number: target, message, sender: o.sender }),
  });
  if (!res.ok) throw new Error(`Gateway gagal (${res.status}): ${await res.text()}`);
  return { ok: true as const, info: "Custom gateway" };
}

/* --------- Helper untuk provider self-hosted (QR scan) --------- */

export type WaSelfStatus = {
  state: "open" | "qr" | "close" | "connecting" | "offline";
  user: string;
  hasQr: boolean;
};

/** Cek status koneksi gateway self-hosted. */
export async function selfWaStatus(apiUrl?: string): Promise<WaSelfStatus> {
  const o = await waOptions();
  const base = (apiUrl || o.apiUrl || "http://127.0.0.1:3100").replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/status`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { state: "offline", user: "", hasQr: false };
    const j = (await res.json()) as { state?: string; user?: string; qr?: boolean };
    const st = j.state;
    return {
      state: st === "open" || st === "qr" || st === "close" || st === "connecting" ? st : "offline",
      user: j.user ?? "",
      hasQr: !!j.qr,
    };
  } catch {
    return { state: "offline", user: "", hasQr: false };
  }
}

/** Ambil QR code (data URL PNG) dari gateway self-hosted. */
export async function selfWaQr(apiUrl?: string): Promise<string> {
  const o = await waOptions();
  const base = (apiUrl || o.apiUrl || "http://127.0.0.1:3100").replace(/\/+$/, "");
  const res = await fetch(`${base}/qr`, { signal: AbortSignal.timeout(4000) });
  const j = (await res.json().catch(() => ({}))) as { qr?: string; error?: string };
  if (!res.ok || !j.qr) throw new Error(j.error || "QR belum tersedia");
  return j.qr;
}

/** Logout / pindai ulang di gateway self-hosted. */
export async function selfWaLogout(apiUrl?: string): Promise<void> {
  const o = await waOptions();
  const base = (apiUrl || o.apiUrl || "http://127.0.0.1:3100").replace(/\/+$/, "");
  const res = await fetch(`${base}/logout`, {
    method: "POST",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Logout gagal (${res.status})`);
}

/** Kirim tagihan tertentu ke nomor pelanggan (link ke portal pembayaran). */
export async function sendInvoiceWa(invoiceId: number, phoneOverride?: string) {
  await ensurePhoneColumn();
  await ensureLogTable();
  const o = await waOptions();
  if (!o.enabled) throw new Error("WhatsApp gateway belum diaktifkan di Pengaturan");

  const rows = await query<{
    id: number;
    username: string;
    plan: string;
    amount: number;
    due_date: string;
    phone: string | null;
  }>(
    `SELECT i.id, i.username, i.plan, i.amount,
            DATE_FORMAT(i.due_date, '%Y-%m-%dT%H:%i:%sZ') AS due_date, v.phone
       FROM billing_invoice i
       LEFT JOIN billing_voucher v ON v.username = i.username
      WHERE i.id = ? LIMIT 1`,
    [invoiceId],
  );
  const inv = rows[0];
  if (!inv) throw new Error("Tagihan tidak ditemukan");

  const phone = normalizeWaNumber(phoneOverride || inv.phone || "");
  if (!phone) throw new Error(`Nomor WhatsApp untuk ${inv.username} belum diisi`);

  const base = (await publicBaseUrl()).trim().replace(/\/+$/,"").replace(/\/portal$/i,"").replace(/^(?!https?:\/\/)/i,"https://");
  const link = `${base || ""}/portal?u=${encodeURIComponent(inv.username)}`;
  const { merchant } = parseInvoiceMerchant(await getSettings());
  const message = buildInvoiceMessage(o.template, inv, merchant, link);

  try {
    const res = await sendWa(phone, message, o);
    await query("INSERT INTO billing_wa_log (invoice_id, phone, ok, info) VALUES (?,?,1,?)", [
      inv.id,
      phone,
      res.info,
    ]);
    return { ok: true as const, phone, error: null as string | null };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 200);
    await query("INSERT INTO billing_wa_log (invoice_id, phone, ok, info) VALUES (?,?,0,?)", [
      inv.id,
      phone,
      msg,
    ]);
    throw new Error(msg);
  }
}

function parseInvoiceMerchant(s: Record<string, string>) {
  return { merchant: s["billing.invoice.merchant"] || "NAJWA.NET" };
}

/** Simpan / ubah nomor WhatsApp pelanggan. */
export async function setUserPhone(username: string, phone: string) {
  await ensurePhoneColumn();
  await query("UPDATE billing_voucher SET phone = ? WHERE username = ?", [
    normalizeWaNumber(phone),
    username.trim(),
  ]);
  return { ok: true as const };
}

/** Kirim tagihan belum dibayar yang punya nomor WA (dipakai penagihan otomatis). */
export async function blastUnpaid(ids?: number[]) {
  await ensurePhoneColumn();
  const o = await waOptions();
  if (!o.enabled) return { sent: 0, failed: 0, skipped: true as const, errors: [] as string[] };
  const rows = await query<{ id: number }>(
    `SELECT i.id FROM billing_invoice i
       LEFT JOIN billing_voucher v ON v.username = i.username
      WHERE i.status = 'unpaid' AND COALESCE(v.phone,'') <> ''
        ${ids?.length ? `AND i.id IN (${ids.map(() => "?").join(",")})` : ""}
      ORDER BY i.due_date ASC LIMIT 200`,
    ids?.length ? ids : [],
  );
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const r of rows) {
    try {
      await sendInvoiceWa(r.id);
      sent += 1;
    } catch (e) {
      failed += 1;
      if (errors.length < 5) errors.push((e as Error).message);
    }
  }
  return { sent, failed, skipped: false as const, errors };
}
