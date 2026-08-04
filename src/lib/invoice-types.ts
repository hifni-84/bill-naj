/** Tipe & default tagihan otomatis (aman dipakai di browser). */

export type InvoiceStatus = "unpaid" | "paid" | "cancelled";

export type Invoice = {
  id: number;
  username: string;
  plan: string;
  service: "hotspot" | "pppoe";
  amount: number;
  /** Batas bayar (= tanggal expired paket saat ini) */
  due_date: string;
  /** Tanggal expired paket yang ditagih (kunci anti duplikat) */
  period_end: string;
  status: InvoiceStatus;
  created_at: string;
  paid_at: string | null;
  note: string;
  /** Nomor WhatsApp pelanggan (dari data voucher/user) */
  phone?: string;
};

export type InvoiceOptions = {
  /** Tagihan otomatis aktif */
  enabled: boolean;
  /** Dibuat berapa hari sebelum expired (default 1 = H-1) */
  leadDays: number;
  /** Nama merchant / nama usaha di tagihan */
  merchant: string;
  /** URL gambar QRIS statis */
  qrisUrl: string;
  /** Petunjuk bayar (rekening, e-wallet, dll) */
  payInfo: string;
  /** Nomor WhatsApp admin untuk konfirmasi */
  whatsapp: string;
};

export const defaultInvoiceOptions: InvoiceOptions = {
  enabled: false,
  leadDays: 1,
  merchant: "NAJWA.NET",
  qrisUrl: "",
  payInfo: "",
  whatsapp: "",
};

export const invoiceKeys = {
  enabled: "billing.invoice.enabled",
  leadDays: "billing.invoice.leadDays",
  merchant: "billing.invoice.merchant",
  qrisUrl: "billing.invoice.qrisUrl",
  payInfo: "billing.invoice.payInfo",
  whatsapp: "billing.invoice.whatsapp",
} as const;

export function parseInvoiceOptions(s: Record<string, string>): InvoiceOptions {
  return {
    enabled: s[invoiceKeys.enabled] === "1",
    leadDays: Math.min(30, Math.max(1, Number(s[invoiceKeys.leadDays] ?? 1) || 1)),
    merchant: s[invoiceKeys.merchant] ?? defaultInvoiceOptions.merchant,
    qrisUrl: s[invoiceKeys.qrisUrl] ?? "",
    payInfo: s[invoiceKeys.payInfo] ?? "",
    whatsapp: s[invoiceKeys.whatsapp] ?? "",
  };
}

export function serializeInvoiceOptions(o: InvoiceOptions): Record<string, string> {
  return {
    [invoiceKeys.enabled]: o.enabled ? "1" : "0",
    [invoiceKeys.leadDays]: String(o.leadDays),
    [invoiceKeys.merchant]: o.merchant,
    [invoiceKeys.qrisUrl]: o.qrisUrl,
    [invoiceKeys.payInfo]: o.payInfo,
    [invoiceKeys.whatsapp]: o.whatsapp,
  };
}

export const rupiah = (n: number) => `Rp ${Number(n || 0).toLocaleString("id-ID")}`;

export const statusLabel: Record<InvoiceStatus, string> = {
  unpaid: "Belum dibayar",
  paid: "Sudah dibayar",
  cancelled: "Dibatalkan",
};

/* ------------------------- Payment gateway (Midtrans / Tripay) ------------------------- */

export type GatewayProvider = "none" | "midtrans" | "tripay";

export type GatewayOptions = {
  provider: GatewayProvider;
  /** Mode uji coba (sandbox) */
  sandbox: boolean;
  /** URL publik panel, untuk callback & halaman kembali. Contoh: https://najwa.ddns.net */
  baseUrl: string;
  midtransServerKey: string;
  tripayApiKey: string;
  tripayPrivateKey: string;
  tripayMerchantCode: string;
  /** Kode channel Tripay, contoh QRIS / BRIVA / DANA */
  tripayMethod: string;
};

export const defaultGatewayOptions: GatewayOptions = {
  provider: "none",
  sandbox: true,
  baseUrl: "",
  midtransServerKey: "",
  tripayApiKey: "",
  tripayPrivateKey: "",
  tripayMerchantCode: "",
  tripayMethod: "QRIS",
};

export const gatewayKeys = {
  provider: "billing.pay.provider",
  sandbox: "billing.pay.sandbox",
  baseUrl: "billing.pay.baseUrl",
  midtransServerKey: "billing.pay.midtrans.serverKey",
  tripayApiKey: "billing.pay.tripay.apiKey",
  tripayPrivateKey: "billing.pay.tripay.privateKey",
  tripayMerchantCode: "billing.pay.tripay.merchantCode",
  tripayMethod: "billing.pay.tripay.method",
} as const;

export function parseGatewayOptions(s: Record<string, string>): GatewayOptions {
  const p = s[gatewayKeys.provider];
  return {
    provider: p === "midtrans" || p === "tripay" ? p : "none",
    sandbox: (s[gatewayKeys.sandbox] ?? "1") === "1",
    baseUrl: (s[gatewayKeys.baseUrl] ?? "").replace(/\/+$/, ""),
    midtransServerKey: s[gatewayKeys.midtransServerKey] ?? "",
    tripayApiKey: s[gatewayKeys.tripayApiKey] ?? "",
    tripayPrivateKey: s[gatewayKeys.tripayPrivateKey] ?? "",
    tripayMerchantCode: s[gatewayKeys.tripayMerchantCode] ?? "",
    tripayMethod: s[gatewayKeys.tripayMethod] || "QRIS",
  };
}

export function serializeGatewayOptions(o: GatewayOptions): Record<string, string> {
  return {
    [gatewayKeys.provider]: o.provider,
    [gatewayKeys.sandbox]: o.sandbox ? "1" : "0",
    [gatewayKeys.baseUrl]: o.baseUrl.replace(/\/+$/, ""),
    [gatewayKeys.midtransServerKey]: o.midtransServerKey,
    [gatewayKeys.tripayApiKey]: o.tripayApiKey,
    [gatewayKeys.tripayPrivateKey]: o.tripayPrivateKey,
    [gatewayKeys.tripayMerchantCode]: o.tripayMerchantCode,
    [gatewayKeys.tripayMethod]: o.tripayMethod,
  };
}

/** Ringkasan aman untuk browser (tanpa kunci rahasia). */
export type GatewayPublic = { provider: GatewayProvider; sandbox: boolean; method: string };

/* ------------------------- WhatsApp Gateway (penagihan otomatis) ------------------------- */

export type WaProvider = "fonnte" | "wablas" | "custom" | "self";

export type WaOptions = {
  /** Kirim tagihan otomatis lewat WhatsApp */
  enabled: boolean;
  provider: WaProvider;
  /** Token / API key gateway */
  token: string;
  /** Wablas: secret key. Custom: header Authorization tambahan (opsional) */
  secret: string;
  /** Endpoint API (wajib untuk provider custom, contoh: https://domain/send-message) */
  apiUrl: string;
  /** Nomor pengirim (opsional, dipakai bila gateway punya beberapa device) */
  sender: string;
  /** Isi pesan; mendukung {nama} {paket} {nominal} {jatuh_tempo} {link} {merchant} */
  template: string;
  /** Kirim otomatis setiap tagihan baru dibuat */
  autoSend: boolean;
};

export const defaultWaTemplate =
  "Halo {nama},\n\nTagihan internet {merchant} paket *{paket}* sebesar *{nominal}* jatuh tempo {jatuh_tempo}.\n\nBayar sekarang di portal pembayaran:\n{link}\n\nTerima kasih 🙏";

export const defaultWaOptions: WaOptions = {
  enabled: false,
  provider: "fonnte",
  token: "",
  secret: "",
  apiUrl: "",
  sender: "",
  template: defaultWaTemplate,
  autoSend: true,
};

export const waKeys = {
  enabled: "billing.wa.enabled",
  provider: "billing.wa.provider",
  token: "billing.wa.token",
  secret: "billing.wa.secret",
  apiUrl: "billing.wa.apiUrl",
  sender: "billing.wa.sender",
  template: "billing.wa.template",
  autoSend: "billing.wa.autoSend",
} as const;

export function parseWaOptions(s: Record<string, string>): WaOptions {
  const p = s[waKeys.provider];
  const provider: WaProvider = p === "wablas" || p === "custom" || p === "self" ? p : "fonnte";
  const apiUrl = (s[waKeys.apiUrl] ?? "").trim();
  return {
    enabled: s[waKeys.enabled] === "1",
    provider,
    token: s[waKeys.token] ?? "",
    secret: s[waKeys.secret] ?? "",
    // URL default untuk provider self-hosted (QR scan) jika belum diisi.
    apiUrl: provider === "self" && !apiUrl ? "http://127.0.0.1:3100" : apiUrl,
    sender: s[waKeys.sender] ?? "",
    template: s[waKeys.template] || defaultWaTemplate,
    autoSend: (s[waKeys.autoSend] ?? "1") === "1",
  };
}

export function serializeWaOptions(o: WaOptions): Record<string, string> {
  return {
    [waKeys.enabled]: o.enabled ? "1" : "0",
    [waKeys.provider]: o.provider,
    [waKeys.token]: o.token,
    [waKeys.secret]: o.secret,
    [waKeys.apiUrl]: o.apiUrl.trim(),
    [waKeys.sender]: o.sender,
    [waKeys.template]: o.template,
    [waKeys.autoSend]: o.autoSend ? "1" : "0",
  };
}

/** Normalisasi nomor ke format internasional Indonesia (62xxxx). */
export function normalizeWaNumber(raw: string) {
  let n = (raw ?? "").replace(/\D/g, "");
  if (!n) return "";
  if (n.startsWith("0")) n = `62${n.slice(1)}`;
  else if (n.startsWith("8")) n = `62${n}`;
  return n;
}
