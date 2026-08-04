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
