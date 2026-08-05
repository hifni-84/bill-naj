import { createHmac, createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { hostname } from "node:os";

import { getSettings, saveSettings } from "./radius.server";
import { callRouterOs } from "./mikrotik.server";
import {
  durationDays,
  durationLabel,
  formatLicenseCode,
  normalizeId,
  normalizeLicenseCode,
  type LicenseDuration,
  type LicenseState,
} from "./license-types";

/** Alfabet tanpa huruf/angka yang mudah tertukar (0/O, 1/I). */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_SECRET = "NAJWA-BILLING-2026-LICENSE-V1";

const KEY = {
  code: "license.code",
  duration: "license.duration",
  activatedAt: "license.activatedAt",
  expiresAt: "license.expiresAt",
  mikrotik: "license.mikrotikId",
};

function secret() {
  return process.env["LICENSE_SECRET"] || DEFAULT_SECRET;
}

function toBase32(buf: Buffer, length: number) {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[buf[i % buf.length]! % ALPHABET.length];
  return out;
}

/** ID unik server billing — stabil selama mesin/instalasi sama. */
export async function softwareId() {
  let seed = "";
  for (const file of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
    try {
      seed = (await fs.readFile(file, "utf8")).trim();
      if (seed) break;
    } catch {
      /* abaikan */
    }
  }
  if (!seed) seed = hostname();
  const digest = createHash("sha256").update(`najwa-billing:${seed}`).digest();
  return formatLicenseCode(toBase32(digest, 12));
}

/** Kode unik dihitung dari Software ID billing + Software ID MikroTik + masa aktif. */
export function makeLicenseCode(
  sid: string,
  mikrotikId: string,
  duration: LicenseDuration,
): string {
  const payload = `${normalizeId(sid)}|${normalizeId(mikrotikId)}|${duration}`;
  const mac = createHmac("sha256", secret()).update(payload).digest();
  return formatLicenseCode(duration + toBase32(mac, 11));
}

function parse(code: string) {
  const clean = normalizeLicenseCode(code);
  if (clean.length !== 12) return null;
  const duration = clean[0] as LicenseDuration;
  if (!["T", "B", "Y", "L"].includes(duration)) return null;
  return { clean, duration };
}

/** Ambil Software ID RouterOS dari router yang tersimpan di pengaturan. */
export async function mikrotikSoftwareId(): Promise<string> {
  try {
    const settings = await getSettings();
    const raw = settings["mikrotik.creds"];
    if (!raw) return "";
    const creds = JSON.parse(raw) as {
      host?: string;
      username?: string;
      password?: string;
      port?: number;
      useHttps?: boolean;
    };
    if (!creds.host) return "";
    const res = await callRouterOs(
      {
        host: creds.host,
        username: creds.username ?? "admin",
        password: creds.password ?? "",
        port: creds.port ?? 80,
        useHttps: Boolean(creds.useHttps),
      },
      "/system/license",
      "GET",
    );
    if (!res.ok) return "";
    const data = Array.isArray(res.data) ? res.data[0] : res.data;
    if (!data || typeof data !== "object") return "";
    const rec = data as Record<string, unknown>;
    const id = rec["software-id"] ?? rec["system-id"] ?? rec["software_id"];
    return id ? String(id) : "";
  } catch {
    return "";
  }
}

export async function licenseState(): Promise<LicenseState> {
  const sid = await softwareId();
  let settings: Record<string, string> = {};
  let error: string | null = null;
  try {
    settings = await getSettings();
  } catch (e) {
    error = e instanceof Error ? e.message : "Database billing tidak tersambung";
  }

  const code = settings[KEY.code] ?? null;
  const duration = (settings[KEY.duration] as LicenseDuration | undefined) ?? null;
  const activatedAt = settings[KEY.activatedAt] ?? null;
  const expiresAt = settings[KEY.expiresAt] || null;
  const mikrotikLicense = settings[KEY.mikrotik] ?? "";

  let expired = false;
  let remainingDays: number | null = null;
  if (expiresAt) {
    const t = new Date(expiresAt).getTime();
    expired = !Number.isNaN(t) && t <= Date.now();
    remainingDays = Number.isNaN(t)
      ? null
      : Math.max(0, Math.ceil((t - Date.now()) / 86_400_000));
  }

  const valid = Boolean(code && duration) && !expired;

  return {
    softwareId: sid,
    mikrotikLicense,
    active: valid,
    expired,
    duration,
    durationLabel: duration ? durationLabel(duration) : "Belum aktif",
    activatedAt,
    expiresAt,
    remainingDays,
    code,
    error,
  };
}

export async function activateLicense(input: { code: string; mikrotikId: string }) {
  const parsed = parse(input.code);
  if (!parsed) return { ok: false as const, error: "Format kode aktivasi tidak valid" };

  const sid = await softwareId();
  const mikrotikId = normalizeId(input.mikrotikId);
  if (!mikrotikId) {
    return { ok: false as const, error: "Software ID MikroTik wajib diisi" };
  }

  const expected = normalizeLicenseCode(makeLicenseCode(sid, mikrotikId, parsed.duration));
  if (expected !== parsed.clean) {
    return {
      ok: false as const,
      error: "Kode aktivasi tidak cocok dengan Software ID billing / lisensi MikroTik ini",
    };
  }

  const days = durationDays(parsed.duration);
  const now = new Date();
  const expiresAt = days ? new Date(now.getTime() + days * 86_400_000) : null;

  await saveSettings({
    [KEY.code]: formatLicenseCode(parsed.clean),
    [KEY.duration]: parsed.duration,
    [KEY.mikrotik]: mikrotikId,
    [KEY.activatedAt]: now.toISOString(),
    [KEY.expiresAt]: expiresAt ? expiresAt.toISOString() : "",
  });

  return {
    ok: true as const,
    duration: parsed.duration,
    durationLabel: durationLabel(parsed.duration),
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
  };
}

export async function deactivateLicense() {
  await saveSettings({
    [KEY.code]: "",
    [KEY.duration]: "",
    [KEY.activatedAt]: "",
    [KEY.expiresAt]: "",
  });
  return { ok: true as const };
}
