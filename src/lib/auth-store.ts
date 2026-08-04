import { useEffect, useState } from "react";

import { billingAccountLogin } from "./radius.functions";

const ACCOUNT_KEY = "billing.account";
const SESSION_KEY = "billing.session";
const ROLE_KEY = "billing.role";
const OPTS_KEY = "billing.options";
const EVENT = "billing-auth-changed";

export type Account = { username: string; password: string };
export type BillingRole = "admin" | "reseller";
export type AppOptions = { autoDeleteExpired: boolean };

export const defaultAccount: Account = { username: "admin", password: "admin" };
export const defaultOptions: AppOptions = { autoDeleteExpired: true };

function encode(value: string) {
  // penyandian ringan agar tidak tersimpan sebagai teks polos
  return typeof window === "undefined" ? value : window.btoa(unescape(encodeURIComponent(value)));
}

function decode(value: string) {
  try {
    return decodeURIComponent(escape(window.atob(value)));
  } catch {
    return "";
  }
}

export function readAccount(): Account {
  if (typeof window === "undefined") return defaultAccount;
  try {
    const raw = window.localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return defaultAccount;
    const parsed = JSON.parse(raw) as { username: string; password: string };
    return { username: parsed.username, password: decode(parsed.password) };
  } catch {
    return defaultAccount;
  }
}

export function writeAccount(acc: Account) {
  window.localStorage.setItem(
    ACCOUNT_KEY,
    JSON.stringify({ username: acc.username, password: encode(acc.password) }),
  );
  window.dispatchEvent(new Event(EVENT));
}

export function readOptions(): AppOptions {
  if (typeof window === "undefined") return defaultOptions;
  try {
    const raw = window.localStorage.getItem(OPTS_KEY);
    return raw ? { ...defaultOptions, ...JSON.parse(raw) } : defaultOptions;
  } catch {
    return defaultOptions;
  }
}

export function writeOptions(opts: AppOptions) {
  window.localStorage.setItem(OPTS_KEY, JSON.stringify(opts));
  window.dispatchEvent(new Event(EVENT));
}

export function isLoggedIn() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SESSION_KEY) === "1";
}

export async function login(username: string, password: string) {
  const result = await billingAccountLogin({ data: { username: username.trim(), password } });
  if (!result.ok) return false;
  window.localStorage.setItem(SESSION_KEY, "1");
  if (result.role) window.localStorage.setItem(ROLE_KEY, result.role);
  window.dispatchEvent(new Event(EVENT));
  return true;
}

export function logout() {
  window.localStorage.removeItem(SESSION_KEY);
  window.localStorage.removeItem(ROLE_KEY);
  window.dispatchEvent(new Event(EVENT));
}

export function currentRole(): BillingRole {
  if (typeof window === "undefined") return "admin";
  return window.localStorage.getItem(ROLE_KEY) === "reseller" ? "reseller" : "admin";
}

/** Hook aman-hidrasi untuk status login. */
export function useAuth() {
  const [authed, setAuthed] = useState(false);
  const [role, setRole] = useState<BillingRole>("admin");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setAuthed(isLoggedIn());
      setRole(currentRole());
    };
    sync();
    setReady(true);
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { authed, ready, role };
}

export function useOptions() {
  const [opts, setOpts] = useState<AppOptions>(defaultOptions);
  useEffect(() => {
    const sync = () => setOpts(readOptions());
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return opts;
}
