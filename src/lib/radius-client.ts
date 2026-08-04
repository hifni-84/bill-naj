import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  radiusMaintenance,
  radiusNasList,
  radiusNasStatus,
  radiusPing,
  radiusPlans,
  radiusReport,
  radiusSessions,
  radiusUsers,
} from "./radius.functions";
import { mt } from "./hotspot";
import { readCreds } from "./router-store";

export function useRadiusPing() {
  return useQuery({ queryKey: ["radius", "ping"], queryFn: () => radiusPing() });
}

export function useRadiusPlans() {
  return useQuery({ queryKey: ["radius", "plans"], queryFn: () => radiusPlans() });
}

export function useRadiusUsers() {
  return useQuery({
    queryKey: ["radius", "users"],
    queryFn: () => radiusUsers(),
    refetchInterval: 15000,
  });
}

export function useRadiusSessions() {
  return useQuery({
    queryKey: ["radius", "sessions"],
    queryFn: () => radiusSessions(),
    refetchInterval: 10000,
  });
}

export function useRadiusReport() {
  return useQuery({
    queryKey: ["radius", "report"],
    queryFn: () => radiusReport(),
    refetchInterval: 15000,
  });
}

export function useRadiusInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["radius"] });
}

export function useRadiusMutation<TVars>(fn: (v: TVars) => Promise<unknown>) {
  const invalidate = useRadiusInvalidate();
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}

/** Pemeriksaan expired tiap 1 menit + putus sesi user expired di MikroTik. */
export function useRadiusMaintenance(enabled: boolean, hapusExpired = true) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    let stop = false;

    const tick = async () => {
      try {
        const res = await radiusMaintenance({ data: { hapusExpired } });
        if (stop) return;
        // putus sesi user expired lewat REST MikroTik (kalau router terkonfigurasi)
        const creds = readCreds();
        if (creds.host && res.expiredOnline.length) {
          for (const name of res.expiredOnline) {
            const aktif = await mt(creds, "/ip/hotspot/active");
            const list = Array.isArray(aktif.data) ? aktif.data : [];
            for (const s of list as { user?: string; ".id"?: string }[]) {
              if (s.user === name && s[".id"]) {
                await mt(creds, `/ip/hotspot/active/${s[".id"]}`, "DELETE");
              }
            }
          }
        }
        // Voucher expired: hapus user-nya di MikroTik saja, data di billing tetap
        // tersimpan dengan status expired.
        const expiredNames: string[] = res.expiredNames ?? [];
        if (creds.host && expiredNames.length) {
          const set = new Set(expiredNames);
          const [hs, ppp] = await Promise.all([
            mt(creds, "/ip/hotspot/user"),
            mt(creds, "/ppp/secret"),
          ]);
          const hsList = (Array.isArray(hs.data) ? hs.data : []) as {
            name?: string;
            ".id"?: string;
          }[];
          const pppList = (Array.isArray(ppp.data) ? ppp.data : []) as {
            name?: string;
            ".id"?: string;
          }[];
          for (const u of hsList) {
            if (u.name && set.has(u.name) && u[".id"]) {
              await mt(creds, `/ip/hotspot/user/${u[".id"]}`, "DELETE");
            }
          }
          for (const u of pppList) {
            if (u.name && set.has(u.name) && u[".id"]) {
              await mt(creds, `/ppp/secret/${u[".id"]}`, "DELETE");
            }
          }
          if (stop) return;
        }
        if (res.stamped || res.expired) qc.invalidateQueries({ queryKey: ["radius"] });
      } catch {
        /* database belum siap, dicoba lagi */
      }
    };

    tick();
    const id = window.setInterval(tick, 30000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [enabled, hapusExpired, qc]);
}

export function useRadiusNas() {
  return useQuery({ queryKey: ["radius", "nas"], queryFn: () => radiusNasList() });
}

/** Status terhubung/tidak: RADIUS (radacct) + REST API router. */
export function useRadiusNasStatus() {
  return useQuery({
    queryKey: ["radius", "nas-status"],
    queryFn: () => {
      const c = readCreds();
      return radiusNasStatus({
        data: {
          creds: {
            username: c.username,
            password: c.password,
            ...(c.port !== undefined ? { port: c.port } : {}),
            ...(c.useHttps !== undefined ? { useHttps: c.useHttps } : {}),
          },
        },
      });
    },
    refetchInterval: 20000,
  });
}
