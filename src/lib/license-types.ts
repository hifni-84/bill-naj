/** Tipe & util lisensi aktivasi (aman dipakai di browser). */

export type LicenseDuration = "T" | "B" | "Y" | "L";

export const licenseDurations: Array<{
  code: LicenseDuration;
  label: string;
  days: number | null;
}> = [
  { code: "T", label: "3 Hari", days: 3 },
  { code: "B", label: "1 Bulan", days: 30 },
  { code: "Y", label: "1 Tahun", days: 365 },
  { code: "L", label: "Selamanya (Lifetime)", days: null },
];

export function durationLabel(code: string) {
  return licenseDurations.find((d) => d.code === code)?.label ?? "Tidak diketahui";
}

export function durationDays(code: string): number | null {
  return licenseDurations.find((d) => d.code === code)?.days ?? null;
}

export type LicenseState = {
  /** ID software billing (dihitung dari server tempat billing dipasang) */
  softwareId: string;
  /** Software ID RouterOS (MikroTik) yang dipakai saat aktivasi */
  mikrotikLicense: string;
  active: boolean;
  expired: boolean;
  duration: LicenseDuration | null;
  durationLabel: string;
  activatedAt: string | null;
  expiresAt: string | null;
  remainingDays: number | null;
  code: string | null;
  error?: string | null;
};

/** XXXX-XXXX-XXXX */
export function formatLicenseCode(raw: string) {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (clean.match(/.{1,4}/g) ?? []).join("-");
}

export function normalizeLicenseCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizeId(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
