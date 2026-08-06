import { useEffect, useState } from "react";
import type { MtCreds } from "./mikrotik-types";
import { settingsGet, settingsSave } from "./radius.functions";

export const ROUTERS_KEY = "mikrotik.routers";

export type ExtraRouter = MtCreds & { id: string; name: string };

export const emptyExtraRouter = (): ExtraRouter => ({
  id: Math.random().toString(36).slice(2, 10),
  name: "",
  host: "",
  username: "admin",
  password: "",
  port: 8728,
  useHttps: false,
});

function parse(raw: string | undefined | null): ExtraRouter[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as ExtraRouter[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function readRouters(): ExtraRouter[] {
  if (typeof window === "undefined") return [];
  return parse(window.localStorage.getItem(ROUTERS_KEY));
}

export async function saveRouters(list: ExtraRouter[]) {
  window.localStorage.setItem(ROUTERS_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("mikrotik-routers-changed"));
  await settingsSave({ data: { entries: { [ROUTERS_KEY]: JSON.stringify(list) } } }).catch(
    () => undefined,
  );
}

export async function syncRoutersFromServer(): Promise<ExtraRouter[] | null> {
  try {
    const res = await settingsGet();
    const raw = res.data?.[ROUTERS_KEY];
    if (!raw) return null;
    const list = parse(raw);
    window.localStorage.setItem(ROUTERS_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event("mikrotik-routers-changed"));
    return list;
  } catch {
    return null;
  }
}

/** Daftar router tambahan (router ke-2 dan seterusnya) yang memakai port API. */
export function useRouters() {
  const [routers, setRouters] = useState<ExtraRouter[]>([]);

  useEffect(() => {
    const sync = () => setRouters(readRouters());
    sync();
    void syncRoutersFromServer().then((remote) => {
      if (remote) setRouters(remote);
    });
    window.addEventListener("mikrotik-routers-changed", sync);
    return () => window.removeEventListener("mikrotik-routers-changed", sync);
  }, []);

  return routers;
}
