import { useEffect, useState } from "react";
import type { MtCreds } from "./mikrotik-types";
import { settingsGet, settingsSave } from "./radius.functions";

const CREDS_KEY = "mikrotik.creds";
const PRICES_KEY = "mikrotik.prices";

export const emptyCreds: MtCreds = {
  host: "",
  username: "admin",
  password: "",
  port: 80,
  useHttps: false,
};

export function readCreds(): MtCreds {
  if (typeof window === "undefined") return emptyCreds;
  try {
    const raw = window.localStorage.getItem(CREDS_KEY);
    return raw ? { ...emptyCreds, ...JSON.parse(raw) } : emptyCreds;
  } catch {
    return emptyCreds;
  }
}

export function writeCreds(creds: MtCreds) {
  window.localStorage.setItem(CREDS_KEY, JSON.stringify(creds));
  window.dispatchEvent(new Event("mikrotik-creds-changed"));
  // simpan juga di server agar perangkat / jaringan lain memakai setelan sama
  void settingsSave({ data: { entries: { "mikrotik.creds": JSON.stringify(creds) } } }).catch(
    () => undefined,
  );
}

/** Ambil setelan dari server (sumber kebenaran) lalu simpan ke browser ini. */
export async function syncCredsFromServer(): Promise<MtCreds | null> {
  try {
    const res = await settingsGet();
    const raw = res.data?.["mikrotik.creds"];
    if (!raw) return null;
    const remote = { ...emptyCreds, ...(JSON.parse(raw) as Partial<MtCreds>) };
    window.localStorage.setItem(CREDS_KEY, JSON.stringify(remote));
    window.dispatchEvent(new Event("mikrotik-creds-changed"));
    return remote;
  } catch {
    return null;
  }
}

export function readPrices(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(PRICES_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function writePrices(prices: Record<string, number>) {
  window.localStorage.setItem(PRICES_KEY, JSON.stringify(prices));
  window.dispatchEvent(new Event("mikrotik-creds-changed"));
}

/** Hook aman-hidrasi: nilai baru dibaca setelah mount. */
export function useCreds() {
  const [creds, setCreds] = useState<MtCreds>(emptyCreds);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setCreds(readCreds());
    sync();
    setReady(true);
    void syncCredsFromServer().then((remote) => {
      if (remote) setCreds(remote);
    });
    window.addEventListener("mikrotik-creds-changed", sync);
    return () => window.removeEventListener("mikrotik-creds-changed", sync);
  }, []);

  return { creds, ready, configured: ready && creds.host.trim().length > 0 };
}

export function usePrices() {
  const [prices, setPrices] = useState<Record<string, number>>({});
  useEffect(() => {
    const sync = () => setPrices(readPrices());
    sync();
    window.addEventListener("mikrotik-creds-changed", sync);
    return () => window.removeEventListener("mikrotik-creds-changed", sync);
  }, []);
  return prices;
}
