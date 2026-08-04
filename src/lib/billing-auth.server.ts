import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { getSettings, saveSettings } from "./radius.server";

export type BillingRole = "admin" | "reseller";
export const billingRoles: BillingRole[] = ["admin", "reseller"];

const defaults: Record<BillingRole, { username: string; password: string | null }> = {
  admin: { username: "admin", password: "admin" },
  reseller: { username: "reseller", password: null },
};

function keys(role: BillingRole) {
  return {
    username: `billing.auth.${role}.username`,
    hash: `billing.auth.${role}.passwordHash`,
    salt: `billing.auth.${role}.passwordSalt`,
  };
}

// Kunci lama (tanpa peran) tetap dibaca sebagai akun admin.
const legacy = {
  username: "billing.auth.username",
  hash: "billing.auth.passwordHash",
  salt: "billing.auth.passwordSalt",
};

/** Settings memakai MySQL RADIUS; jika DB belum siap, pakai nilai default. */
async function safeSettings(): Promise<Record<string, string>> {
  try {
    return await getSettings();
  } catch {
    return {};
  }
}

function passwordHash(password: string, salt: string) {
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

function readRole(settings: Record<string, string>, role: BillingRole) {
  const k = keys(role);
  const useLegacy = role === "admin" && !settings[k.hash] && Boolean(settings[legacy.hash]);
  const src = useLegacy ? legacy : k;
  return {
    username: settings[src.username] ?? defaults[role].username,
    hash: settings[src.hash],
    salt: settings[src.salt],
  };
}

export async function getBillingAccounts() {
  const settings = await safeSettings();
  return billingRoles.map((role) => {
    const entry = readRole(settings, role);
    return {
      role,
      username: entry.username,
      configured: Boolean(entry.hash && entry.salt),
    };
  });
}

export async function verifyBillingAccount(username: string, password: string) {
  const settings = await safeSettings();
  const supplied = username.trim();

  for (const role of billingRoles) {
    const entry = readRole(settings, role);
    if (supplied !== entry.username) continue;

    if (!entry.hash || !entry.salt) {
      const fallback = defaults[role].password;
      if (fallback && password === fallback) return { ok: true as const, role };
      continue;
    }

    const a = Buffer.from(passwordHash(password, entry.salt), "hex");
    const b = Buffer.from(entry.hash, "hex");
    if (a.length === b.length && timingSafeEqual(a, b)) return { ok: true as const, role };
  }

  return { ok: false as const, role: null };
}

export async function saveBillingAccount(role: BillingRole, username: string, password: string) {
  const k = keys(role);
  const salt = randomBytes(16).toString("hex");
  await saveSettings({
    [k.username]: username.trim(),
    [k.salt]: salt,
    [k.hash]: passwordHash(password, salt),
  });
  return { ok: true as const };
}
