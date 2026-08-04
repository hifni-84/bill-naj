import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { mt, mtList } from "./hotspot";
import {
  encodePppComment,
  encodeVoucherComment,
  isExpired,
  isUsed,
  parseDuration,
  parsePppComment,
  parseVoucherComment,
  type HotspotActive,
  type HotspotProfile,
  type HotspotUser,
  type MtCreds,
  type PppActive,
  type PppSecret,
} from "./mikrotik-types";

/** Pemeriksaan cepat supaya login pertama langsung tercatat. */
export const MAINTENANCE_INTERVAL_MS = 30 * 1000;

/** Masa aktif voucher (detik) dari limit-uptime user atau session-timeout profil. */
function voucherLifetime(u: HotspotUser, profiles: HotspotProfile[]) {
  const own = parseDuration(u["limit-uptime"]);
  if (own) return own;
  const prof = profiles.find((p) => p.name === u.profile);
  return parseDuration(prof?.["session-timeout"]);
}

export type MaintenanceResult = { stamped: number; expired: number; isolated: number };

export async function runMaintenance(
  creds: MtCreds,
  hapusExpired = true,
): Promise<MaintenanceResult> {
  const result: MaintenanceResult = { stamped: 0, expired: 0, isolated: 0 };
  const now = Date.now();

  const [users, profiles, active] = await Promise.all([
    mtList<HotspotUser>(creds, "/ip/hotspot/user"),
    mtList<HotspotProfile>(creds, "/ip/hotspot/user/profile"),
    mtList<HotspotActive>(creds, "/ip/hotspot/active"),
  ]);

  for (const u of users) {
    const meta = parseVoucherComment(u.comment);
    if (!meta) continue;

    const sesiAktif = active.find((a) => a.user === u.name);
    const sudahDipakai = isUsed(u) || !!sesiAktif;

    // 1. Catat waktu login pertama + hitung expired
    if (!meta.first && sudahDipakai) {
      // mundurkan sesuai uptime/sesi berjalan agar akurat walau baru terdeteksi
      const jalan = Math.max(parseDuration(u.uptime), parseDuration(sesiAktif?.uptime)) * 1000;
      const firstMs = now - jalan;
      const first = new Date(firstMs).toISOString();
      const life = voucherLifetime(u, profiles);
      const exp = life ? new Date(firstMs + life * 1000).toISOString() : "";
      await mt(creds, `/ip/hotspot/user/${u[".id"]}`, "PATCH", {
        comment: encodeVoucherComment(meta.batch, meta.price, meta.date, first, exp),
      });
      result.stamped += 1;
      continue;
    }


    // 2. Voucher expired: putus sesi lalu hapus (atau nonaktifkan bila opsi dimatikan)
    if (isExpired(meta, now)) {
      const sesi = active.find((a) => a.user === u.name);
      if (sesi) await mt(creds, `/ip/hotspot/active/${sesi[".id"]}`, "DELETE");
      if (hapusExpired) {
        await mt(creds, `/ip/hotspot/user/${u[".id"]}`, "DELETE");
        result.expired += 1;
      } else if (u.disabled !== "true") {
        await mt(creds, `/ip/hotspot/user/${u[".id"]}`, "PATCH", { disabled: "yes" });
        result.expired += 1;
      }
    }
  }

  // 3. Isolir PPPoE jatuh tempo
  try {
    const [secrets, pppActive] = await Promise.all([
      mtList<PppSecret>(creds, "/ppp/secret"),
      mtList<PppActive>(creds, "/ppp/active"),
    ]);
    for (const s of secrets) {
      const meta = parsePppComment(s.comment);
      if (!meta?.due) continue;
      const due = new Date(`${meta.due}T23:59:59`).getTime();
      if (Number.isNaN(due) || due > now) continue;
      if (s.disabled === "true") continue;
      await mt(creds, `/ppp/secret/${s[".id"]}`, "PATCH", {
        disabled: "yes",
        comment: encodePppComment(meta.due, meta.price, meta.plan || s.profile || ""),
      });
      const sesi = pppActive.find((a) => a.name === s.name);
      if (sesi) await mt(creds, `/ppp/active/${sesi[".id"]}`, "DELETE");
      result.isolated += 1;
    }
  } catch {
    /* router tanpa PPP diabaikan */
  }

  return result;
}

/** Jalankan pemeriksaan expired & isolir tiap 5 menit. */
export function useMaintenance(creds: MtCreds, enabled: boolean, hapusExpired = true) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled || !creds.host) return;
    let stop = false;

    const tick = async () => {
      try {
        const res = await runMaintenance(creds, hapusExpired);
        if (stop) return;
        if (res.stamped || res.expired || res.isolated) {
          qc.invalidateQueries({ queryKey: ["users"] });
          qc.invalidateQueries({ queryKey: ["ppp-secret"] });
          qc.invalidateQueries({ queryKey: ["active"] });
        }
      } catch {
        /* diam saja, dicoba lagi 5 menit berikutnya */
      }
    };

    tick();
    const id = window.setInterval(tick, MAINTENANCE_INTERVAL_MS);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [creds, enabled, hapusExpired, qc]);
}
