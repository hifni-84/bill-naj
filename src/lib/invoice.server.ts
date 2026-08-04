/**
 * Tagihan otomatis untuk paket masa aktif 30 hari (hotspot & PPPoE).
 * Tagihan dibuat otomatis H-1 sebelum expired dan dibayar lewat QRIS statis
 * / transfer, lalu dikonfirmasi admin (payment gateway API bisa ditambah nanti).
 */
import type { Invoice } from "./invoice-types";
import { parseInvoiceOptions } from "./invoice-types";
import { getSettings, query } from "./radius.server";

/** Rentang detik yang dianggap "paket 30 hari" (28–31 hari). */
const MIN_30 = 28 * 86400;
const MAX_30 = 31 * 86400;

const utc = (col: string) => `DATE_FORMAT(${col}, '%Y-%m-%dT%H:%i:%sZ')`;

let ready = false;
async function ensureTable() {
  if (ready) return;
  await query(
    `CREATE TABLE IF NOT EXISTS billing_invoice (
       id         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
       username   VARCHAR(64) NOT NULL,
       plan       VARCHAR(64) NOT NULL,
       service    ENUM('hotspot','pppoe') NOT NULL DEFAULT 'hotspot',
       amount     INT NOT NULL DEFAULT 0,
       due_date   DATETIME NULL,
       period_end DATETIME NULL,
       status     ENUM('unpaid','paid','cancelled') NOT NULL DEFAULT 'unpaid',
       created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
       paid_at    DATETIME NULL,
       note       VARCHAR(255) NOT NULL DEFAULT '',
       UNIQUE KEY uniq_periode (username, period_end),
       KEY idx_status (status),
       KEY idx_due (due_date)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );
  ready = true;
}

function radiusDate(iso: string) {
  const d = new Date(iso.endsWith("Z") ? iso : `${iso.replace(" ", "T")}Z`);
  const bulan = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())} ${bulan[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

const SELECT = `SELECT id, username, plan, service, amount, status, note,
        ${utc("due_date")} AS due_date,
        ${utc("period_end")} AS period_end,
        ${utc("created_at")} AS created_at,
        ${utc("paid_at")} AS paid_at
   FROM billing_invoice`;

export async function invoiceOptions() {
  return parseInvoiceOptions(await getSettings());
}

/**
 * Buat tagihan untuk semua user paket 30 hari yang akan expired dalam
 * `leadDays` hari (default H-1). Aman dipanggil berulang (UNIQUE per periode).
 */
export async function generateInvoices(): Promise<{ created: number; skipped: boolean }> {
  await ensureTable();
  const opt = await invoiceOptions();
  if (!opt.enabled) return { created: 0, skipped: true };

  const jatuh = await query<{
    username: string;
    plan: string;
    service: "hotspot" | "pppoe";
    price: number;
    expires_at: string;
  }>(
    `SELECT v.username, v.plan, v.service, p.price, v.expires_at
       FROM billing_voucher v
       JOIN billing_plan p ON p.name = v.plan
      WHERE p.validity_seconds BETWEEN ? AND ?
        AND v.expires_at IS NOT NULL
        AND v.expires_at > NOW()
        AND v.expires_at <= DATE_ADD(NOW(), INTERVAL ? DAY)
        AND NOT EXISTS (
          SELECT 1 FROM billing_invoice i
           WHERE i.username = v.username AND i.period_end = v.expires_at
        )`,
    [MIN_30, MAX_30, opt.leadDays],
  );

  let created = 0;
  for (const r of jatuh) {
    await query(
      `INSERT IGNORE INTO billing_invoice
         (username, plan, service, amount, due_date, period_end, status, created_at, note)
       VALUES (?,?,?,?,?,?, 'unpaid', NOW(), ?)`,
      [
        r.username,
        r.plan,
        r.service,
        Number(r.price) || 0,
        r.expires_at,
        r.expires_at,
        `Perpanjangan otomatis paket ${r.plan}`,
      ],
    );
    created += 1;
  }
  return { created, skipped: false };
}

export async function listInvoices(status?: "unpaid" | "paid" | "cancelled") {
  await ensureTable();
  if (status) {
    return query<Invoice>(`${SELECT} WHERE status = ? ORDER BY due_date ASC, id DESC LIMIT 500`, [
      status,
    ]);
  }
  return query<Invoice>(`${SELECT} ORDER BY status = 'unpaid' DESC, due_date ASC LIMIT 500`);
}

/** Tagihan milik satu pelanggan (dipakai portal publik, tanpa data sensitif). */
export async function invoicesFor(username: string) {
  await ensureTable();
  const u = username.trim();
  const kosong = {
    found: false as const,
    invoices: [] as Invoice[],
    expires_at: null,
    plan: "",
    usage: { download: 0, upload: 0, total: 0, sessionTime: 0 },
  };
  if (!u) return kosong;
  const user = await query<{ plan: string; expires_at: string | null }>(
    `SELECT plan, ${utc("expires_at")} AS expires_at FROM billing_voucher WHERE username = ? LIMIT 1`,
    [u],
  );
  if (!user[0]) {
    return kosong;
  }
  const invoices = await query<Invoice>(
    `${SELECT} WHERE username = ? ORDER BY due_date DESC LIMIT 24`,
    [u],
  );
  let usage = { download: 0, upload: 0, total: 0, sessionTime: 0 };
  try {
    const rows = await query<{ dl: number; ul: number; st: number }>(
      `SELECT COALESCE(SUM(acctoutputoctets),0) AS dl,
              COALESCE(SUM(acctinputoctets),0) AS ul,
              COALESCE(SUM(acctsessiontime),0) AS st
         FROM radacct WHERE username = ?`,
      [u],
    );
    const dl = Number(rows[0]?.dl ?? 0);
    const ul = Number(rows[0]?.ul ?? 0);
    usage = { download: dl, upload: ul, total: dl + ul, sessionTime: Number(rows[0]?.st ?? 0) };
  } catch {
    /* tabel radacct belum ada */
  }
  return {
    found: true as const,
    invoices,
    expires_at: user[0].expires_at,
    plan: user[0].plan,
    usage,
  };
}

/** Tandai tagihan lunas + perpanjang masa aktif user sesuai paket. */
export async function payInvoice(id: number, note = "") {
  await ensureTable();
  const rows = await query<{ username: string; plan: string; status: string }>(
    "SELECT username, plan, status FROM billing_invoice WHERE id = ? LIMIT 1",
    [id],
  );
  const inv = rows[0];
  if (!inv) throw new Error("Tagihan tidak ditemukan");
  if (inv.status === "paid") return { ok: true as const, renewed: false };

  const plan = await query<{ validity_seconds: number }>(
    "SELECT validity_seconds FROM billing_plan WHERE name = ? LIMIT 1",
    [inv.plan],
  );
  const validity = Number(plan[0]?.validity_seconds ?? 0);

  await query(
    "UPDATE billing_invoice SET status = 'paid', paid_at = NOW(), note = COALESCE(NULLIF(?,''), note) WHERE id = ?",
    [note, id],
  );

  if (validity > 0) {
    // Masa aktif ditambah dari tanggal expired lama (bila masih berjalan)
    await query(
      `UPDATE billing_voucher
          SET expires_at = DATE_ADD(GREATEST(COALESCE(expires_at, NOW()), NOW()), INTERVAL ? SECOND),
              paid = 1
        WHERE username = ?`,
      [validity, inv.username],
    );
    const baru = await query<{ exp: string; password: string }>(
      `SELECT ${utc("expires_at")} AS exp, password FROM billing_voucher WHERE username = ? LIMIT 1`,
      [inv.username],
    );
    const row = baru[0];
    if (row) {
      await query(
        "DELETE FROM radcheck WHERE username = ? AND attribute IN ('Cleartext-Password','Expiration')",
        [inv.username],
      );
      await query(
        "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)",
        [inv.username, row.password],
      );
      await query(
        "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Expiration', ':=', ?)",
        [inv.username, radiusDate(row.exp)],
      );
    }
  }
  return { ok: true as const, renewed: validity > 0 };
}

export async function cancelInvoice(id: number) {
  await ensureTable();
  await query("UPDATE billing_invoice SET status = 'cancelled' WHERE id = ?", [id]);
  return { ok: true as const };
}

export async function deleteInvoice(id: number) {
  await ensureTable();
  await query("DELETE FROM billing_invoice WHERE id = ?", [id]);
  return { ok: true as const };
}
