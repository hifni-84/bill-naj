import { useEffect, useState } from "react";

import { mt, mtList } from "./hotspot";
import type { HotspotProfile, HotspotUser, MtCreds, PppSecret } from "./mikrotik-types";
import type { RadiusPlan } from "./radius-types";
import { settingsGet, settingsSave } from "./radius.functions";

const HYBRID_KEY = "billing.hybrid";
const EVENT = "billing-hybrid-changed";

export type HybridOptions = {
  /** Mode hybrid: paket & voucher disimpan di RADIUS sekaligus di MikroTik. */
  enabled: boolean;
  /** Sinkronkan paket sebagai hotspot/ppp profile di router. */
  syncProfile: boolean;
  /** Sinkronkan voucher/user ke hotspot user atau ppp secret di router. */
  syncVoucher: boolean;
};

export const defaultHybrid: HybridOptions = {
  enabled: false,
  syncProfile: true,
  syncVoucher: true,
};

export function readHybrid(): HybridOptions {
  if (typeof window === "undefined") return defaultHybrid;
  try {
    const raw = window.localStorage.getItem(HYBRID_KEY);
    return raw ? { ...defaultHybrid, ...(JSON.parse(raw) as Partial<HybridOptions>) } : defaultHybrid;
  } catch {
    return defaultHybrid;
  }
}

export function writeHybrid(opts: HybridOptions) {
  window.localStorage.setItem(HYBRID_KEY, JSON.stringify(opts));
  window.dispatchEvent(new Event(EVENT));
  // simpan juga ke server agar semua perangkat memakai mode yang sama
  void settingsSave({ data: { entries: { [HYBRID_KEY]: JSON.stringify(opts) } } }).catch(
    () => undefined,
  );
}

/** Ambil mode hybrid dari server (sumber kebenaran) lalu simpan ke browser ini. */
export async function syncHybridFromServer(): Promise<HybridOptions | null> {
  try {
    const res = await settingsGet();
    const raw = res.data?.[HYBRID_KEY];
    if (!raw) return null;
    const remote = { ...defaultHybrid, ...(JSON.parse(raw) as Partial<HybridOptions>) };
    window.localStorage.setItem(HYBRID_KEY, JSON.stringify(remote));
    window.dispatchEvent(new Event(EVENT));
    return remote;
  } catch {
    return null;
  }
}

/** Hook aman-hidrasi untuk mode hybrid. */
export function useHybrid() {
  const [hybrid, setHybrid] = useState<HybridOptions>(defaultHybrid);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setHybrid(readHybrid());
    sync();
    setReady(true);
    void syncHybridFromServer().then((remote) => {
      if (remote) setHybrid(remote);
    });
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { hybrid, ready };
}

export type HybridSyncResult = { ok: boolean; created: number; updated: number; errors: string[] };

const empty = (): HybridSyncResult => ({ ok: true, created: 0, updated: 0, errors: [] });

function secondsToRouterOs(seconds: number) {
  if (!seconds || seconds <= 0) return "0s";
  return `${Math.round(seconds)}s`;
}

/** Upsert satu paket menjadi profile hotspot / ppp di MikroTik. */
export async function pushPlanToMikrotik(
  creds: MtCreds,
  plan: RadiusPlan,
): Promise<HybridSyncResult> {
  const out = empty();
  if (!creds.host.trim()) {
    out.ok = false;
    out.errors.push("Kredensial router belum diatur di Pengaturan");
    return out;
  }

  const base = plan.service === "pppoe" ? "/ppp/profile" : "/ip/hotspot/user/profile";
  const body: Record<string, unknown> =
    plan.service === "pppoe"
      ? { name: plan.name, "rate-limit": plan.rate_limit || undefined }
      : {
          name: plan.name,
          "rate-limit": plan.rate_limit || undefined,
          "shared-users": String(Math.max(1, plan.shared_users || 1)),
          "session-timeout": secondsToRouterOs(plan.validity_seconds),
        };

  try {
    const existing = await mtList<HotspotProfile>(creds, base);
    const found = existing.find((p) => p.name === plan.name);
    if (found) {
      const res = await mt(creds, `${base}/${encodeURIComponent(found[".id"])}`, "PATCH", body);
      if (!res.ok) {
        out.ok = false;
        out.errors.push(res.error ?? "Gagal memperbarui profile");
      } else out.updated += 1;
    } else {
      const res = await mt(creds, base, "PUT", body);
      if (!res.ok) {
        out.ok = false;
        out.errors.push(res.error ?? "Gagal membuat profile");
      } else out.created += 1;
    }
  } catch (e) {
    out.ok = false;
    out.errors.push((e as Error).message);
  }
  return out;
}

export type HybridVoucher = {
  username: string;
  password: string;
  plan: string;
  batch?: string;
  service: "hotspot" | "pppoe";
};

/** Upsert daftar voucher/user ke hotspot user atau ppp secret di MikroTik. */
export async function pushVouchersToMikrotik(
  creds: MtCreds,
  vouchers: HybridVoucher[],
): Promise<HybridSyncResult> {
  const out = empty();
  if (!vouchers.length) return out;
  if (!creds.host.trim()) {
    out.ok = false;
    out.errors.push("Kredensial router belum diatur di Pengaturan");
    return out;
  }

  const groups: Array<{ service: "hotspot" | "pppoe"; items: HybridVoucher[] }> = [
    { service: "hotspot", items: vouchers.filter((v) => v.service !== "pppoe") },
    { service: "pppoe", items: vouchers.filter((v) => v.service === "pppoe") },
  ];

  for (const group of groups) {
    if (!group.items.length) continue;
    const base = group.service === "pppoe" ? "/ppp/secret" : "/ip/hotspot/user";
    let existing: Array<{ ".id": string; name: string }> = [];
    try {
      existing =
        group.service === "pppoe"
          ? await mtList<PppSecret>(creds, base)
          : await mtList<HotspotUser>(creds, base);
    } catch (e) {
      out.ok = false;
      out.errors.push((e as Error).message);
      continue;
    }
    const byName = new Map(existing.map((u) => [u.name, u[".id"]]));

    for (const v of group.items) {
      const body: Record<string, unknown> = {
        name: v.username,
        password: v.password,
        profile: v.plan,
        comment: v.batch ? `billing:${v.batch}` : "billing",
      };
      if (group.service === "pppoe") body["service"] = "pppoe";

      const id = byName.get(v.username);
      const res = id
        ? await mt(creds, `${base}/${encodeURIComponent(id)}`, "PATCH", body)
        : await mt(creds, base, "PUT", body);
      if (!res.ok) {
        out.ok = false;
        if (out.errors.length < 5) out.errors.push(`${v.username}: ${res.error ?? "gagal"}`);
      } else if (id) out.updated += 1;
      else out.created += 1;
    }
  }

  return out;
}

/** Hapus voucher/user dari MikroTik (dipakai saat voucher dihapus di RADIUS). */
export async function removeVouchersFromMikrotik(
  creds: MtCreds,
  usernames: string[],
): Promise<HybridSyncResult> {
  const out = empty();
  if (!usernames.length || !creds.host.trim()) return out;
  const wanted = new Set(usernames);

  for (const base of ["/ip/hotspot/user", "/ppp/secret"]) {
    try {
      const existing = await mtList<{ ".id": string; name: string }>(creds, base);
      for (const u of existing) {
        if (!wanted.has(u.name)) continue;
        const res = await mt(creds, `${base}/${encodeURIComponent(u[".id"])}`, "DELETE");
        if (!res.ok) {
          out.ok = false;
          if (out.errors.length < 5) out.errors.push(`${u.name}: ${res.error ?? "gagal"}`);
        } else out.updated += 1;
      }
    } catch (e) {
      out.ok = false;
      out.errors.push((e as Error).message);
    }
  }
  return out;
}
