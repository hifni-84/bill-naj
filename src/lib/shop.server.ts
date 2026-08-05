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
  qty: number;
  vouchers: { username: string; password: string }[];
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
  // Kolom jumlah voucher per pesanan (instalasi lama).
  try {
    await query("ALTER TABLE billing_order ADD COLUMN qty INT NOT NULL DEFAULT 1");
  } catch {
    /* kolom sudah ada */
  }
  try {
    await query("ALTER TABLE billing_order ADD COLUMN vouchers TEXT NULL");
  } catch {
    /* kolom sudah ada */
  }
  ready = true;
}

const SELECT = `SELECT id, code, plan, amount, status, username, password, qty, vouchers, pay_url,
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
export async function createOrder(planName: string, phone = "", qty = 1) {
  await ensureTable();
  await ensurePortalColumn();
  const jumlah = Math.min(50, Math.max(1, Math.round(Number(qty) || 1)));
  const rows = await query<{ name: string; price: number; portal: number }>(
    "SELECT name, price, portal FROM billing_plan WHERE name = ? LIMIT 1",
    [planName.trim()],
  );
  const plan = rows[0];
  if (!plan || !Number(plan.portal)) throw new Error("Paket tidak tersedia untuk dibeli");
  const amount = Math.max(1, Math.round(Number(plan.price) || 0)) * jumlah;

  const code = `V${rnd(8, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789")}`;
  const { normalizeWaNumber } = await import("./invoice-types");
  const res = await query<{ insertId?: number }>(
    `INSERT INTO billing_order (code, plan, phone, amount, qty, status, created_at)
     VALUES (?,?,?,?,?, 'pending', NOW())`,
    [code, plan.name, normalizeWaNumber(phone), amount, jumlah],
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
  return { code, url: pay.url, amount, plan: plan.name, qty: jumlah };
}

/** Dipanggil webhook gateway saat pembayaran lunas: buat voucher-nya. */
export async function settleOrder(id: number, label = "gateway") {
  await ensureTable();
  const rows = await query<{
    plan: string;
    phone: string;
    status: string;
    username: string;
    qty: number;
  }>(
    "SELECT plan, phone, status, username, qty FROM billing_order WHERE id = ? LIMIT 1",
    [id],
  );
  const o = rows[0];
  if (!o) return { ok: false as const, reason: "order-not-found" };
  if (o.status === "paid") return { ok: true as const, username: o.username };

  const jumlah = Math.min(50, Math.max(1, Number(o.qty) || 1));
  const dibuat: { username: string; password: string }[] = [];
  for (let i = 0; i < jumlah; i += 1) {
    dibuat.push({ username: await freeUsername(), password: rnd(5) });
  }
  await createUsers(
    dibuat.map((v) => ({
      username: v.username,
      password: v.password,
      plan: o.plan,
      batch: `PORTAL-${label}`,
      price: 0,
      service: "hotspot" as const,
      paid: true,
      phone: o.phone,
    })),
  );
  const username = dibuat[0]?.username ?? "";
  const password = dibuat[0]?.password ?? "";
  await query(
    "UPDATE billing_order SET status = 'paid', paid_at = NOW(), username = ?, password = ?, vouchers = ? WHERE id = ?",
    [username, password, JSON.stringify(dibuat), id],
  );

  // Kirim kode voucher ke WhatsApp pembeli bila gateway WA aktif.
  if (o.phone) {
    try {
      const { sendWa } = await import("./wa.server");
      const daftar = dibuat.map((v, i) => `${i + 1}. ${v.username} / ${v.password}`).join("\n");
      await sendWa(
        o.phone,
        `Pembayaran diterima. Voucher internet Anda (${jumlah}x ${o.plan}):\n${daftar}`,
      );
    } catch {
      /* gateway WA belum siap */
    }
  }
  return { ok: true as const, username, password, vouchers: dibuat };
}

/** Cek status pesanan (dipakai portal setelah kembali dari pembayaran). */
export async function orderStatus(code: string) {
  await ensureTable();
  const rows = await query<Omit<Order, "vouchers"> & { vouchers: unknown }>(
    `${SELECT} WHERE code = ? LIMIT 1`,
    [code.trim()],
  );
  const row = rows[0];
  if (!row) return null;
  let list: { username: string; password: string }[] = [];
  try {
    const raw = row.vouchers;
    if (typeof raw === "string" && raw.trim()) list = JSON.parse(raw);
    else if (Array.isArray(raw)) list = raw as { username: string; password: string }[];
  } catch {
    list = [];
  }
  if (!list.length && row.username) list = [{ username: row.username, password: row.password }];
  return { ...row, qty: Number(row.qty) || 1, vouchers: list } satisfies Order;
}
