import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  radiusMaintenance,
  radiusNasList,
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

/** Pemeriksaan expired tiap 30 detik + putus sesi user expired di MikroTik. */
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
