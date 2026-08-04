export type MtCreds = {
  host: string;
  username: string;
  password: string;
  port?: number;
  useHttps?: boolean;
};

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type MtResult = {
  ok: boolean;
  status: number;
  data: Json;
  error?: string;
};

export type HotspotProfile = {
  ".id": string;
  name: string;
  "rate-limit"?: string;
  "session-timeout"?: string;
  "shared-users"?: string;
  "idle-timeout"?: string;
};

export type HotspotUser = {
  ".id": string;
  name: string;
  password?: string;
  profile?: string;
  comment?: string;
  uptime?: string;
  "limit-uptime"?: string;
  "bytes-in"?: string;
  "bytes-out"?: string;
  disabled?: string;
};

export type HotspotActive = {
  ".id": string;
  user: string;
  address?: string;
  "mac-address"?: string;
  uptime?: string;
  "session-time-left"?: string;
  "bytes-in"?: string;
  "bytes-out"?: string;
};

export type PppSecret = {
  ".id": string;
  name: string;
  password?: string;
  profile?: string;
  service?: string;
  comment?: string;
  disabled?: string;
  "last-logged-out"?: string;
};

export type PppActive = {
  ".id": string;
  name: string;
  address?: string;
  uptime?: string;
  "caller-id"?: string;
  service?: string;
};

/** Metadata voucher pada comment: blg|batch|harga|tanggal|loginPertama|expired */
export const VOUCHER_TAG = "blg";

export type VoucherMeta = {
  batch: string;
  price: number;
  date: string;
  /** ISO string waktu login pertama */
  first: string;
  /** ISO string waktu kedaluwarsa */
  exp: string;
};

export function encodeVoucherComment(
  batch: string,
  price: number,
  date: string,
  first = "",
  exp = "",
) {
  return `${VOUCHER_TAG}|${batch}|${price}|${date}|${first}|${exp}`;
}

export function parseVoucherComment(comment?: string): VoucherMeta | null {
  if (!comment || !comment.startsWith(`${VOUCHER_TAG}|`)) return null;
  const [, batch, price, date, first, exp] = comment.split("|");
  return {
    batch: batch ?? "-",
    price: Number(price) || 0,
    date: date ?? "",
    first: first ?? "",
    exp: exp ?? "",
  };
}

/** Metadata pelanggan PPPoE: bppp|jatuhTempo|harga|profilAsli */
export const PPP_TAG = "bppp";

export type PppMeta = { due: string; price: number; plan: string };

export function encodePppComment(due: string, price: number, plan: string) {
  return `${PPP_TAG}|${due}|${price}|${plan}`;
}

export function parsePppComment(comment?: string): PppMeta | null {
  if (!comment || !comment.startsWith(`${PPP_TAG}|`)) return null;
  const [, due, price, plan] = comment.split("|");
  return { due: due ?? "", price: Number(price) || 0, plan: plan ?? "" };
}

/** "1d2h30m" / "01:30:00" → detik */
export function parseDuration(value?: string): number {
  if (!value) return 0;
  const v = value.trim();
  if (/^\d+$/.test(v)) return Number(v);
  if (v.includes(":")) {
    const parts = v.split(":").map(Number);
    const [h = 0, m = 0, s = 0] = parts.length === 3 ? parts : [0, parts[0] ?? 0, parts[1] ?? 0];
    return h * 3600 + m * 60 + s;
  }
  let total = 0;
  const re = /(\d+)\s*(w|d|h|m|s)/g;
  const mult: Record<string, number> = { w: 604800, d: 86400, h: 3600, m: 60, s: 1 };
  let match: RegExpExecArray | null;
  while ((match = re.exec(v))) total += Number(match[1]) * (mult[match[2] ?? ""] ?? 0);
  return total;
}

export function formatDuration(seconds: number) {
  if (!seconds || seconds < 0) return "-";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d) return `${d}h ${h}j ${m}m`;
  if (h) return `${h}j ${m}m`;
  if (m) return `${m}m ${s}d`;
  return `${s}d`;
}

export function formatDateTime(iso?: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export function voucherQuota(u: HotspotUser) {
  return Number(u["bytes-in"] || 0) + Number(u["bytes-out"] || 0);
}

/** Sisa masa aktif (detik). null = belum dipakai / tidak dibatasi waktu. */
export function remainingSeconds(
  meta: VoucherMeta | null,
  now = Date.now(),
): number | null {
  if (!meta?.exp) return null;
  const t = new Date(meta.exp).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((t - now) / 1000));
}

/** Teks sisa masa aktif untuk tabel. */
export function remainingLabel(
  meta: VoucherMeta | null,
  u: HotspotUser,
  now = Date.now(),
) {
  const sisa = remainingSeconds(meta, now);
  if (sisa === null) {
    const limit = parseDuration(u["limit-uptime"]);
    return limit ? `${formatDuration(limit)} (belum jalan)` : "-";
  }
  return sisa > 0 ? formatDuration(sisa) : "Habis";
}

export function isExpired(meta: VoucherMeta | null, now = Date.now()) {
  if (!meta?.exp) return false;
  const t = new Date(meta.exp).getTime();
  return !Number.isNaN(t) && t <= now;
}

export function isUsed(u: HotspotUser) {
  return !!u.uptime && u.uptime !== "00:00:00" && u.uptime !== "0s";
}

export function formatIDR(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function formatBytes(value?: string | number) {
  const n = Number(value || 0);
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
