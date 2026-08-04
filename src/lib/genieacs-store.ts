import { useEffect, useState } from "react";

export type AcsCreds = {
  /** URL NBI GenieACS, contoh: http://192.168.1.10:7557 */
  url: string;
  username: string;
  password: string;
};

const KEY = "genieacs.creds";

export const emptyAcs: AcsCreds = { url: "", username: "", password: "" };

export function readAcs(): AcsCreds {
  if (typeof window === "undefined") return emptyAcs;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...emptyAcs, ...JSON.parse(raw) } : emptyAcs;
  } catch {
    return emptyAcs;
  }
}

export function writeAcs(creds: AcsCreds) {
  window.localStorage.setItem(KEY, JSON.stringify(creds));
  window.dispatchEvent(new Event("genieacs-creds-changed"));
}

export function useAcs() {
  const [creds, setCreds] = useState<AcsCreds>(emptyAcs);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setCreds(readAcs());
    sync();
    setReady(true);
    window.addEventListener("genieacs-creds-changed", sync);
    return () => window.removeEventListener("genieacs-creds-changed", sync);
  }, []);

  return { creds, ready, configured: ready && creds.url.trim().length > 0 };
}
