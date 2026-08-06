import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { mt, mtList } from "./hotspot";
import { readRouters } from "./routers-store";
import type {
  HotspotActive,
  HotspotProfile,
  HotspotUser,
  MtCreds,
  PppSecret,
} from "./mikrotik-types";
import { parseDuration } from "./mikrotik-types";
import type { RadiusPlan } from "./radius-types";
import { radiusStampRouterLogins, settingsGet, settingsSave } from "./radius.functions";

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
    return raw
      ? { ...defaultHybrid, ...(JSON.parse(raw) as Partial<HybridOptions>) }
      : defaultHybrid;
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

/** Router utama + semua router tambahan (router ke-2 dan seterusnya). */
export function allRouterTargets(primary: MtCreds): Array<{ name: string; creds: MtCreds }> {
  const list: Array<{ name: string; creds: MtCreds }> = [];
  if (primary.host?.trim()) list.push({ name: "Router utama", creds: primary });
  for (const r of readRouters()) {
    if (!r.host?.trim()) continue;
    if (list.some((x) => x.creds.host === r.host)) continue;
    list.push({
      name: r.name || r.host,
      creds: {
        host: r.host,
        username: r.username,
        password: r.password,
        ...(r.port !== undefined ? { port: r.port } : {}),
        ...(r.useHttps !== undefined ? { useHttps: r.useHttps } : {}),
      },
    });
  }
  return list;
}

async function forEachRouter(
  primary: MtCreds,
  job: (creds: MtCreds) => Promise<HybridSyncResult>,
  target: string = "all",
): Promise<HybridSyncResult> {
  const out = empty();
  const all = allRouterTargets(primary);
  const targets = target === "all" ? all : all.filter((t) => t.creds.host === target);
  if (!targets.length) {
    out.ok = false;
    out.errors.push(
      target === "all"
        ? "Kredensial router belum diatur di Pengaturan"
        : `Router ${target} tidak ditemukan di daftar router`,
    );
    return out;
  }
  for (const t of targets) {
    const res = await job(t.creds).catch(
      (e): HybridSyncResult => ({ ok: false, created: 0, updated: 0, errors: [(e as Error).message] }),
    );
    out.created += res.created;
    out.updated += res.updated;
    if (!res.ok) {
      out.ok = false;
      for (const err of res.errors) {
        if (out.errors.length < 5) out.errors.push(`${t.name}: ${err}`);
      }
    }
  }
  return out;
}

/** Upsert paket ke semua router, atau hanya satu router (pakai host sebagai target). */
export function pushPlanToAllRouters(primary: MtCreds, plan: RadiusPlan, target: string = "all") {
  return forEachRouter(primary, (c) => pushPlanToMikrotik(c, plan), target);
}

/** Upsert voucher ke SEMUA router (utama + tambahan). */
export function pushVouchersToAllRouters(primary: MtCreds, vouchers: HybridVoucher[]) {
  return forEachRouter(primary, (c) => pushVouchersToMikrotik(c, vouchers));
}

/** Hapus voucher di SEMUA router (utama + tambahan). */
export function removeVouchersFromAllRouters(primary: MtCreds, usernames: string[]) {
  return forEachRouter(primary, (c) => removeVouchersFromMikrotik(c, usernames));
}

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

/** Daftar voucher yang sudah dipakai di router (mode hybrid) + lama pakainya. */
export async function collectRouterLogins(
  creds: MtCreds,
): Promise<Array<{ username: string; uptimeSeconds: number }>> {
  if (!creds.host?.trim()) return [];
  const map = new Map<string, number>();
  const catat = (name?: string, uptime?: string) => {
    if (!name) return;
    const detik = parseDuration(uptime);
    if (detik <= 0) return;
    map.set(name, Math.max(map.get(name) ?? 0, detik));
  };

  try {
    const users = await mtList<HotspotUser>(creds, "/ip/hotspot/user");
    for (const u of users) catat(u.name, u.uptime);
  } catch {
    /* router tidak terjangkau */
  }
  try {
    const aktif = await mtList<HotspotActive>(creds, "/ip/hotspot/active");
    for (const a of aktif) catat(a.user, a.uptime);
  } catch {
    /* abaikan */
  }
  try {
    const ppp = await mtList<{ name?: string; uptime?: string }>(creds, "/ppp/active");
    for (const p of ppp) catat(p.name, p.uptime);
  } catch {
    /* abaikan */
  }

  return [...map.entries()].map(([username, uptimeSeconds]) => ({ username, uptimeSeconds }));
}

/** Login dari router utama + semua router tambahan (uptime terbesar dipakai). */
export async function collectLoginsAllRouters(
  primary: MtCreds,
): Promise<Array<{ username: string; uptimeSeconds: number }>> {
  const map = new Map<string, number>();
  for (const t of allRouterTargets(primary)) {
    const items = await collectRouterLogins(t.creds).catch(() => []);
    for (const it of items) {
      map.set(it.username, Math.max(map.get(it.username) ?? 0, it.uptimeSeconds));
    }
  }
  return [...map.entries()].map(([username, uptimeSeconds]) => ({ username, uptimeSeconds }));
}

/**
 * MODE HYBRID: voucher yang login di user lokal MikroTik tidak lewat RADIUS,
 * jadi billing tidak melihatnya. Hook ini memeriksa router tiap 30 detik dan
 * mencatat login pertama + pendapatan ke billing.
 */
export function useHybridLoginSync(creds: MtCreds, enabled: boolean) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    let stop = false;

    const tick = async () => {
      try {
        const items = await collectLoginsAllRouters(creds);
        if (stop || !items.length) return;
        const res = await radiusStampRouterLogins({ data: { items } });
        if (!stop && res.stamped) qc.invalidateQueries({ queryKey: ["radius"] });
      } catch {
        /* dicoba lagi pada siklus berikutnya */
      }
    };

    void tick();
    const id = setInterval(() => void tick(), 30_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [creds, enabled, qc]);
}
