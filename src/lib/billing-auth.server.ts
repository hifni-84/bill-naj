import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { getSettings, saveSettings } from "./radius.server";

const USERNAME_KEY = "billing.auth.username";
const PASSWORD_HASH_KEY = "billing.auth.passwordHash";
const PASSWORD_SALT_KEY = "billing.auth.passwordSalt";

function passwordHash(password: string, salt: string) {
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

export async function getBillingAccount() {
  const settings = await getSettings();
  return {
    username: settings[USERNAME_KEY] ?? "admin",
    configured: Boolean(settings[PASSWORD_HASH_KEY] && settings[PASSWORD_SALT_KEY]),
  };
}

export async function verifyBillingAccount(username: string, password: string) {
  const settings = await getSettings();
  const storedUsername = settings[USERNAME_KEY] ?? "admin";
  const salt = settings[PASSWORD_SALT_KEY];
  const storedHash = settings[PASSWORD_HASH_KEY];

  if (username.trim() !== storedUsername) return false;
  if (!salt || !storedHash) return password === "admin";

  const supplied = Buffer.from(passwordHash(password, salt), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function saveBillingAccount(username: string, password: string) {
  const salt = randomBytes(16).toString("hex");
  await saveSettings({
    [USERNAME_KEY]: username.trim(),
    [PASSWORD_SALT_KEY]: salt,
    [PASSWORD_HASH_KEY]: passwordHash(password, salt),
  });
  return { ok: true as const };
}
