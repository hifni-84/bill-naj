/**
 * Pembayaran online tagihan lewat Midtrans (Snap) atau Tripay.
 * Kunci API disimpan di tabel billing_setting (menu Pengaturan), bukan di kode.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { parseGatewayOptions, type GatewayOptions } from "./invoice-types";
import { getSettings, query } from "./radius.server";

export async function gatewayOptions(): Promise<GatewayOptions> {
  return parseGatewayOptions(await getSettings());
}

let colsReady = false;
async function ensureColumns() {
  if (colsReady) return;
  for (const sql of [
    "ALTER TABLE billing_invoice ADD COLUMN pay_provider VARCHAR(16) NOT NULL DEFAULT ''",
    "ALTER TABLE billing_invoice ADD COLUMN pay_ref VARCHAR(64) NOT NULL DEFAULT ''",
    "ALTER TABLE billing_invoice ADD COLUMN pay_url VARCHAR(512) NOT NULL DEFAULT ''",
  ]) {
    try {
      await query(sql);
    } catch {
      /* kolom sudah ada */
    }
  }
  colsReady = true;
}

type InvRow = {
  id: number;
  username: string;
  plan: string;
  amount: number;
  status: string;
  pay_provider: string;
  pay_ref: string;
  pay_url: string;
};

/** Buat (atau pakai ulang) link pembayaran online untuk satu tagihan. */
export async function createPayment(invoiceId: number) {
  await ensureColumns();
  const opt = await gatewayOptions();
  if (opt.provider === "none") throw new Error("Payment gateway belum diaktifkan");

  const rows = await query<InvRow>(
    `SELECT id, username, plan, amount, status, pay_provider, pay_ref, pay_url
       FROM billing_invoice WHERE id = ? LIMIT 1`,
    [invoiceId],
  );
  const inv = rows[0];
  if (!inv) throw new Error("Tagihan tidak ditemukan");
  if (inv.status !== "unpaid") throw new Error("Tagihan ini tidak berstatus belum dibayar");
  if (inv.pay_url && inv.pay_provider === opt.provider) {
    return { url: inv.pay_url, ref: inv.pay_ref, provider: opt.provider, reused: true as const };
  }

  const amount = Math.max(1, Math.round(Number(inv.amount) || 0));
  const ref = `INV-${inv.id}-${Date.now().toString(36)}`;
  const url =
    opt.provider === "midtrans"
      ? await midtransSnap(opt, ref, amount, inv)
      : await tripayTransaction(opt, ref, amount, inv);

  await query(
    "UPDATE billing_invoice SET pay_provider = ?, pay_ref = ?, pay_url = ? WHERE id = ?",
    [opt.provider, ref, url, inv.id],
  );
  return { url, ref, provider: opt.provider, reused: false as const };
}

type Item = { plan: string; username: string };

/** Buat link checkout gateway untuk referensi apa pun (tagihan atau pesanan voucher). */
export async function checkoutUrl(ref: string, amount: number, item: Item) {
  const opt = await gatewayOptions();
  if (opt.provider === "none") throw new Error("Payment gateway belum diaktifkan");
  const url =
    opt.provider === "midtrans"
      ? await midtransSnap(opt, ref, amount, item)
      : await tripayTransaction(opt, ref, amount, item);
  return { url, provider: opt.provider };
}

async function midtransSnap(opt: GatewayOptions, ref: string, amount: number, inv: Item) {
  if (!opt.midtransServerKey) throw new Error("Server Key Midtrans belum diisi");
  const host = opt.sandbox ? "https://app.sandbox.midtrans.com" : "https://app.midtrans.com";
  const res = await fetch(`${host}/snap/v1/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${opt.midtransServerKey}:`).toString("base64")}`,
    },
    body: JSON.stringify({
      transaction_details: { order_id: ref, gross_amount: amount },
      item_details: [{ id: inv.plan, price: amount, quantity: 1, name: `Paket ${inv.plan}` }],
      customer_details: { first_name: inv.username },
      callbacks: opt.baseUrl ? { finish: `${opt.baseUrl}/portal` } : undefined,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    redirect_url?: string;
    error_messages?: string[];
  };
  if (!res.ok || !json.redirect_url) {
    throw new Error(json.error_messages?.join(", ") || `Midtrans gagal (${res.status})`);
  }
  return json.redirect_url;
}

async function tripayTransaction(opt: GatewayOptions, ref: string, amount: number, inv: Item) {
  if (!opt.tripayApiKey || !opt.tripayPrivateKey || !opt.tripayMerchantCode) {
    throw new Error("API Key / Private Key / Merchant Code Tripay belum lengkap");
  }
  const host = opt.sandbox ? "https://tripay.co.id/api-sandbox" : "https://tripay.co.id/api";
  const signature = createHmac("sha256", opt.tripayPrivateKey)
    .update(`${opt.tripayMerchantCode}${ref}${amount}`)
    .digest("hex");
  const res = await fetch(`${host}/transaction/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opt.tripayApiKey}`,
    },
    body: JSON.stringify({
      method: opt.tripayMethod || "QRIS",
      merchant_ref: ref,
      amount,
      customer_name: inv.username,
      customer_email: `${inv.username.replace(/[^a-zA-Z0-9._-]/g, "")}@pelanggan.local`,
      order_items: [{ sku: inv.plan, name: `Paket ${inv.plan}`, price: amount, quantity: 1 }],
      return_url: opt.baseUrl ? `${opt.baseUrl}/portal` : undefined,
      expired_time: Math.floor(Date.now() / 1000) + 24 * 3600,
      signature,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    data?: { checkout_url?: string };
  };
  const url = json.data?.checkout_url;
  if (!res.ok || !json.success || !url) {
    throw new Error(json.message || `Tripay gagal (${res.status})`);
  }
  return url;
}

const invoiceIdOf = (ref: string) => Number(/^INV-(\d+)/.exec(ref ?? "")?.[1] ?? 0);

function sameHex(a: string, b: string) {
  const x = Buffer.from(a || "", "utf8");
  const y = Buffer.from(b || "", "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Webhook Midtrans: verifikasi signature_key lalu lunasi tagihan. */
export async function handleMidtransCallback(raw: string) {
  const opt = await gatewayOptions();
  if (!opt.midtransServerKey) return { ok: false as const, reason: "not-configured" };
  const body = JSON.parse(raw) as {
    order_id?: string;
    status_code?: string;
    gross_amount?: string;
    signature_key?: string;
    transaction_status?: string;
    fraud_status?: string;
  };
  const expect = createHash("sha512")
    .update(
      `${body.order_id ?? ""}${body.status_code ?? ""}${body.gross_amount ?? ""}${opt.midtransServerKey}`,
    )
    .digest("hex");
  if (!sameHex(body.signature_key ?? "", expect)) {
    return { ok: false as const, reason: "bad-signature" };
  }
  const lunas =
    body.transaction_status === "settlement" ||
    (body.transaction_status === "capture" && body.fraud_status !== "deny");
  if (!lunas) return { ok: true as const, paid: false };
  return settleRef(body.order_id ?? "", "Midtrans");
}

/** Webhook Tripay: verifikasi X-Callback-Signature (HMAC raw body). */
export async function handleTripayCallback(raw: string, signature: string) {
  const opt = await gatewayOptions();
  if (!opt.tripayPrivateKey) return { ok: false as const, reason: "not-configured" };
  const expect = createHmac("sha256", opt.tripayPrivateKey).update(raw).digest("hex");
  if (!sameHex(signature, expect)) return { ok: false as const, reason: "bad-signature" };
  const body = JSON.parse(raw) as { merchant_ref?: string; status?: string };
  if ((body.status ?? "").toUpperCase() !== "PAID") return { ok: true as const, paid: false };
  return settleRef(body.merchant_ref ?? "", "Tripay");
}

/** Referensi bisa berupa tagihan (INV-) atau pesanan voucher portal (ORD-). */
async function settleRef(ref: string, label: string) {
  const orderId = Number(/^ORD-(\d+)/.exec(ref ?? "")?.[1] ?? 0);
  if (orderId) {
    const { settleOrder } = await import("./shop.server");
    const res = await settleOrder(orderId, label);
    return { ok: true as const, paid: res.ok, renewed: false };
  }
  return settle(invoiceIdOf(ref), label);
}

async function settle(id: number, label: string) {
  if (!id) return { ok: false as const, reason: "invoice-not-found" };
  const { payInvoice } = await import("./invoice.server");
  const res = await payInvoice(id, `Dibayar otomatis via ${label}`);
  return { ok: true as const, paid: true, renewed: res.renewed };
}