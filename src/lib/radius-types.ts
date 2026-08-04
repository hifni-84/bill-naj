/** Tipe bersama untuk billing RADIUS (aman dipakai di browser). */

export type RadiusPlan = {
  name: string;
  /** harga jual ke pelanggan */
  price: number;
  /** harga modal — dipakai untuk perhitungan pendapatan */
  cost_price: number;
  /** contoh: 2M/2M */
  rate_limit: string;
  /** masa aktif dalam detik, dihitung sejak login pertama */
  validity_seconds: number;
  shared_users: number;
  service: "hotspot" | "pppoe";
};

export type RadiusUser = {
  username: string;
  password: string;
  plan: string;
  batch: string;
  price: number;
  service: "hotspot" | "pppoe";
  /** 1 = sudah dibayar (paid), 0 = belum dibayar (unpaid) */
  paid?: number;
  /** IP NAS pembatas login, kosong = semua NAS */
  nas?: string | null;
  created_at: string;
  first_login: string | null;
  expires_at: string | null;
  online: number;
};

export type RadiusSession = {
  radacctid: number;
  username: string;
  nasipaddress: string;
  framedipaddress: string | null;
  callingstationid: string | null;
  acctstarttime: string | null;
  acctsessiontime: number;
  acctinputoctets: number;
  acctoutputoctets: number;
};

export type RadiusStatus =
  | { ok: true; version: string }
  | { ok: false; error: string };

export function isRadiusExpired(u: RadiusUser, now = Date.now()) {
  if (!u.expires_at) return false;
  const t = new Date(u.expires_at).getTime();
  return !Number.isNaN(t) && t <= now;
}

export function radiusRemainingSeconds(u: RadiusUser, now = Date.now()) {
  if (!u.expires_at) return null;
  const t = new Date(u.expires_at).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((t - now) / 1000));
}

export type RadiusNas = {
  id: number;
  nasname: string;
  shortname: string;
  type: string;
  ports: number | null;
  secret: string;
  description: string | null;
  timezone?: string | null;
};

/** Pilihan zona waktu untuk NAS (router). */
export const ZONA_WAKTU = [
  { value: "Asia/Jakarta", label: "WIB — Asia/Jakarta (UTC+7)" },
  { value: "Asia/Makassar", label: "WITA — Asia/Makassar (UTC+8)" },
  { value: "Asia/Jayapura", label: "WIT — Asia/Jayapura (UTC+9)" },
  { value: "Asia/Kuala_Lumpur", label: "Asia/Kuala_Lumpur (UTC+8)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (UTC+8)" },
  { value: "UTC", label: "UTC (UTC+0)" },
];
