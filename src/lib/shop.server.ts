/**
 * Pembelian voucher langsung oleh pelanggan lewat portal.
 * Alur: pilih paket (yang ditandai tampil di portal) -> buat pesanan ->
 * bayar lewat payment gateway -> voucher dibuat otomatis saat pembayaran lunas.
 */
import { query, createUsers, ensurePortalColumn } from "./radius.server";

export type PortalPlan = {
  name: string;
  price: number;
  rate_limit: string;
  validity_seconds: number;
  service: "hotspot" | "pppoe";
};

export type Order = {
  id: number;
  code: string;
  plan: string;
  amount: number;
  status: "pending" | "paid" | "cancelled";
  username: string;
  password: string;
  pay_url: string;
  created_at: string;
  paid_at: string | null;
};

const utc = (col: string) => `DATE_FORMAT(${col}, '%Y-%m-%dT%H:%i:%sZ')`;

let ready = false;
async function ensureTable() {
  if (ready) return;
  await query(
    `CREATE TABLE IF NOT EXISTS billing_order (
       id           INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
       code         VARCHAR(24) NOT NULL,
       plan         VARCHAR(64) NOT NULL,
       phone        VARCHAR(24) NOT NULL DEFAULT '',
       amount       INT NOT NULL DEFAULT 0,
       username     VARCHAR(64) NOT NULL DEFAULT '',
       password     VARCHAR(64) NOT NULL DEFAULT '',
       status       ENUM('pending','paid','cancelled') NOT NULL DEFAULT 'pending',
       pay_provider VARCHAR(16) NOT NULL DEFAULT '',
       pay_ref      VARCHAR(64) NOT NULL DEFAULT '',
       pay_url      VARCHAR(512) NOT NULL DEFAULT '',
       created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       paid_at      DATETIME NULL,
       UNIQUE KEY uniq_code (code),
       KEY idx_status (status)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );
  ready = true;
}

const SELECT = `SELECT id, code, plan, amount, status, username, password, pay_url,
        ${utc("created_at")} AS created_at, ${utc("paid_at")} AS paid_at
   FROM billing_order`;

/** Paket yang ditandai tampil di portal pelanggan. */
export async function portalPlans(): Promise<PortalPlan[]> {
  await ensurePortalColumn();
  return query<PortalPlan>(
    `SELECT name, price, rate_limit, validity_seconds, service
       FROM billing_plan WHERE portal = 1 ORDER BY price, name`,
  );
}

const rnd = (n: number, chars = "0123456789") =>
  Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

async function freeUsername() {
  for (let i = 0; i < 30; i += 1) {
    const u = rnd(5);
    const ada = await query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM billing_voucher WHERE username = ?",
      [u],
    );
    if (Number(ada[0]?.n ?? 0) === 0) return u;
  }
  return `v${Date.now().toString(36)}`;
}

/** Buat pesanan voucher + link pembayaran. */
export async function createOrder(planName: string, phone = "") {
  await ensureTable();
  await ensurePortalColumn();
  const rows = await query<{ name: string; price: number; portal: number }>(
    "SELECT name, price, portal FROM billing_plan WHERE name = ? LIMIT 1",
    [planName.trim()],
  );
  const plan = rows[0];
  if (!plan || !Number(plan.portal)) throw new Error("Paket tidak tersedia untuk dibeli");
  const amount = Math.max(1, Math.round(Number(plan.price) || 0));

  const code = `V${rnd(8, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789")}`;
  const { normalizeWaNumber } = await import("./invoice-types");
  const res = await query<{ insertId?: number }>(
    `INSERT INTO billing_order (code, plan, phone, amount, status, created_at)
     VALUES (?,?,?,?, 'pending', NOW())`,
    [code, plan.name, normalizeWaNumber(phone), amount],
  );
  const idRow = await query<{ id: number }>("SELECT id FROM billing_order WHERE code = ? LIMIT 1", [
    code,
  ]);
  const id = Number(idRow[0]?.id ?? (res as unknown as { insertId?: number }).insertId ?? 0);
  if (!id) throw new Error("Pesanan gagal dibuat");

  const ref = `ORD-${id}-${Date.now().toString(36)}`;
  const { checkoutUrl } = await import("./payment.server");
  const pay = await checkoutUrl(ref, amount, { plan: plan.name, username: code });
  await query("UPDATE billing_order SET pay_provider = ?, pay_ref = ?, pay_url = ? WHERE id = ?", [
    pay.provider,
    ref,
    pay.url,
    id,
  ]);
  return { code, url: pay.url, amount, plan: plan.name };
}

/** Dipanggil webhook gateway saat pembayaran lunas: buat voucher-nya. */
export async function settleOrder(id: number, label = "gateway") {
  await ensureTable();
  const rows = await query<{ plan: string; phone: string; status: string; username: string }>(
    "SELECT plan, phone, status, username FROM billing_order WHERE id = ? LIMIT 1",
    [id],
  );
  const o = rows[0];
  if (!o) return { ok: false as const, reason: "order-not-found" };
  if (o.status === "paid") return { ok: true as const, username: o.username };

  const username = await freeUsername();
  const password = rnd(5);
  await createUsers([
    {
      username,
      password,
      plan: o.plan,
      batch: `PORTAL-${label}`,
      price: 0,
      service: "hotspot",
      paid: true,
      phone: o.phone,
    },
  ]);
  await query(
    "UPDATE billing_order SET status = 'paid', paid_at = NOW(), username = ?, password = ? WHERE id = ?",
    [username, password, id],
  );

  // Kirim kode voucher ke WhatsApp pembeli bila gateway WA aktif.
  if (o.phone) {
    try {
      const { sendWa } = await import("./wa.server");
      await sendWa(
        o.phone,
        `Pembayaran diterima. Voucher internet Anda:\nUsername: ${username}\nPassword: ${password}\nPaket: ${o.plan}`,
      );
    } catch {
      /* gateway WA belum siap */
    }
  }
  return { ok: true as const, username, password };
}

/** Cek status pesanan (dipakai portal setelah kembali dari pembayaran). */
export async function orderStatus(code: string) {
  await ensureTable();
  const rows = await query<Order>(`${SELECT} WHERE code = ? LIMIT 1`, [code.trim()]);
  return rows[0] ?? null;
}
