/** Pemeriksaan status koneksi tiap NAS: RADIUS (radacct) dan REST API router. */
import { callRouterOs } from "./mikrotik.server";
import { listNas, query } from "./radius.server";
import type { MtCreds } from "./mikrotik-types";

export type NasStatus = {
  nasname: string;
  /** ada trafik RADIUS dari NAS ini dalam 15 menit terakhir */
  radius: boolean;
  radiusLast: string | null;
  radiusSessions: number;
  /** REST API router bisa dihubungi dengan kredensial panel */
  api: boolean;
  apiError: string | null;
  identity: string | null;
};

export async function nasStatuses(creds?: Partial<MtCreds>): Promise<NasStatus[]> {
  const nas = await listNas();

  let rows: { nasipaddress: string; sesi: number; terakhir: string | null }[] = [];
  try {
    rows = await query<{ nasipaddress: string; sesi: number; terakhir: string | null }>(
      `SELECT nasipaddress,
              SUM(acctstoptime IS NULL) AS sesi,
              DATE_FORMAT(MAX(COALESCE(acctupdatetime, acctstarttime)), '%Y-%m-%dT%H:%i:%sZ') AS terakhir
         FROM radacct
        WHERE COALESCE(acctupdatetime, acctstarttime) > (UTC_TIMESTAMP() - INTERVAL 1 DAY)
        GROUP BY nasipaddress`,
    );
  } catch {
    rows = [];
  }

  const byIp = new Map(rows.map((r) => [String(r.nasipaddress), r]));

  return Promise.all(
    nas.map(async (n) => {
      const r = byIp.get(n.nasname);
      const last = r?.terakhir ?? null;
      const fresh = last ? Date.now() - new Date(last).getTime() < 15 * 60 * 1000 : false;

      let api = false;
      let apiError: string | null = null;
      let identity: string | null = null;

      if (creds?.username) {
        const res = await callRouterOs(
          {
            host: n.nasname,
            username: creds.username ?? "admin",
            password: creds.password ?? "",
            ...(creds.port !== undefined ? { port: creds.port } : {}),
            ...(creds.useHttps !== undefined ? { useHttps: creds.useHttps } : {}),
          },
          "/system/identity",
          "GET",
        );
        api = res.ok;
        if (res.ok && res.data && typeof res.data === "object" && !Array.isArray(res.data)) {
          const name = (res.data as Record<string, unknown>)["name"];
          identity = typeof name === "string" ? name : null;
        }
        if (!res.ok) apiError = res.error ?? "gagal";
      } else {
        apiError = "Kredensial router belum diisi di Pengaturan";
      }

      return {
        nasname: n.nasname,
        radius: fresh || Number(r?.sesi ?? 0) > 0,
        radiusLast: last,
        radiusSessions: Number(r?.sesi ?? 0),
        api,
        apiError,
        identity,
      };
    }),
  );
}
