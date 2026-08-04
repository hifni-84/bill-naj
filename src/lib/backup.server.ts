/**
 * Backup & restore seluruh data billing: pengaturan, paket (profile hotspot &
 * pppoe), voucher/user, dan daftar NAS. Semua diambil dari database RADIUS.
 */
import { query } from "./radius.server";
import type { RadiusNas, RadiusPlan } from "./radius-types";

export type BackupVoucher = {
  username: string;
  password: string;
  plan: string;
  batch: string;
  price: number;
  service: "hotspot" | "pppoe";
  paid: number;
  nas: string | null;
  created_at: string | null;
  first_login: string | null;
  expires_at: string | null;
};

export type BackupData = {
  version: 1;
  createdAt: string;
  settings: Record<string, string>;
  plans: RadiusPlan[];
  vouchers: BackupVoucher[];
  nas: RadiusNas[];
};

export async function exportBackup(): Promise<BackupData> {
  const { getSettings, listPlans, listNas } = await import("./radius.server");
  const settings = await getSettings();
  const plans = await listPlans();
  const nas = await listNas();
  const vouchers = await query<BackupVoucher>(
    `SELECT username, password, plan, batch, price, service, paid, nas,
            DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at,
            DATE_FORMAT(first_login, '%Y-%m-%dT%H:%i:%sZ') AS first_login,
            DATE_FORMAT(expires_at, '%Y-%m-%dT%H:%i:%sZ') AS expires_at
       FROM billing_voucher ORDER BY created_at`,
  );
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    settings,
    plans,
    vouchers,
    nas,
  };
}

function sql(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export async function importBackup(data: BackupData, replace: boolean) {
  const { saveSettings, savePlan, saveNas } = await import("./radius.server");

  if (replace) {
    await query("DELETE FROM billing_voucher");
    await query("DELETE FROM radcheck");
    await query("DELETE FROM radreply");
    await query("DELETE FROM radusergroup");
    await query("DELETE FROM billing_plan");
    await query("DELETE FROM radgroupreply");
    await query("DELETE FROM radgroupcheck");
  }

  if (data.settings && Object.keys(data.settings).length) {
    await saveSettings(data.settings);
  }

  let plans = 0;
  for (const p of data.plans ?? []) {
    await savePlan({
      name: p.name,
      price: Number(p.price) || 0,
      cost_price: Number(p.cost_price) || 0,
      rate_limit: p.rate_limit ?? "",
      validity_seconds: Number(p.validity_seconds) || 0,
      shared_users: Number(p.shared_users) || 0,
      service: p.service === "pppoe" ? "pppoe" : "hotspot",
    });
    plans += 1;
  }

  let vouchers = 0;
  for (const v of data.vouchers ?? []) {
    await query(
      `INSERT INTO billing_voucher
         (username, password, plan, batch, price, service, paid, nas, created_at, first_login, expires_at)
       VALUES (?,?,?,?,?,?,?,?,COALESCE(?, NOW()),?,?)
       ON DUPLICATE KEY UPDATE password=VALUES(password), plan=VALUES(plan), batch=VALUES(batch),
         price=VALUES(price), service=VALUES(service), paid=VALUES(paid), nas=VALUES(nas),
         created_at=VALUES(created_at), first_login=VALUES(first_login), expires_at=VALUES(expires_at)`,
      [
        v.username,
        v.password,
        v.plan,
        v.batch ?? "",
        Number(v.price) || 0,
        v.service === "pppoe" ? "pppoe" : "hotspot",
        Number(v.paid) ? 1 : 0,
        (v.nas ?? "") || "",
        sql(v.created_at),
        sql(v.first_login),
        sql(v.expires_at),
      ],
    );
    await query("DELETE FROM radcheck WHERE username = ?", [v.username]);
    await query(
      "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)",
      [v.username, v.password],
    );
    if ((v.nas ?? "").trim()) {
      await query(
        "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'NAS-IP-Address', '==', ?)",
        [v.username, (v.nas ?? "").trim()],
      );
    }
    await query("DELETE FROM radusergroup WHERE username = ?", [v.username]);
    await query("INSERT INTO radusergroup (username, groupname, priority) VALUES (?, ?, 1)", [
      v.username,
      v.plan,
    ]);
    vouchers += 1;
  }

  let nas = 0;
  for (const n of data.nas ?? []) {
    const exist = await query<{ id: number }>("SELECT id FROM nas WHERE nasname = ? LIMIT 1", [
      n.nasname,
    ]);
    await saveNas({
      ...(exist[0]?.id ? { id: exist[0].id } : {}),
      nasname: n.nasname,
      shortname: n.shortname,
      secret: n.secret,
      description: n.description ?? "",
      timezone: n.timezone ?? "Asia/Jakarta",
    });
    nas += 1;
  }

  return { ok: true as const, plans, vouchers, nas };
}
