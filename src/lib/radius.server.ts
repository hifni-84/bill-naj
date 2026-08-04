/**
 * Akses langsung ke database FreeRADIUS (MySQL/MariaDB) di server Ubuntu.
 * Semua data voucher/pelanggan tersimpan di sini, BUKAN di MikroTik.
 */
import mysql from "mysql2/promise";

import type { RadiusPlan, RadiusSession, RadiusUser } from "./radius-types";

let pool: mysql.Pool | null = null;

function db() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env["RADIUS_DB_HOST"] ?? "127.0.0.1",
      port: Number(process.env["RADIUS_DB_PORT"] ?? 3306),
      user: process.env["RADIUS_DB_USER"] ?? "radius",
      password: process.env["RADIUS_DB_PASSWORD"] ?? "radpass",
      database: process.env["RADIUS_DB_NAME"] ?? "radius",
      connectionLimit: 5,
      dateStrings: true,
      waitForConnections: true,
      // Semua waktu disimpan & dibaca dalam UTC supaya tampilan di browser
      // (WIB/WITA/WIT) selalu sesuai jam setempat.
      timezone: "Z",
    });
    pool.on("connection", (conn) => {
      conn.query("SET time_zone = '+00:00'");
    });
  }
  return pool;
}

/** Kolom waktu MySQL -> string ISO UTC agar browser mengubah ke jam lokal. */
function utc(col: string) {
  return `DATE_FORMAT(${col}, '%Y-%m-%dT%H:%i:%sZ')`;
}

type Row = Record<string, unknown>;

let paidReady = false;
/** Menambahkan kolom paid pada billing_voucher bila belum ada. */
async function ensurePaidColumn() {
  if (paidReady) return;
  try {
    await query("ALTER TABLE billing_voucher ADD COLUMN paid TINYINT(1) NOT NULL DEFAULT 1");
  } catch {
    /* kolom sudah ada */
  }
  paidReady = true;
}

let nasColReady = false;
/** Menambahkan kolom nas pada billing_voucher bila belum ada. */
async function ensureNasColumn() {
  if (nasColReady) return;
  try {
    await query("ALTER TABLE billing_voucher ADD COLUMN nas VARCHAR(128) NOT NULL DEFAULT ''");
  } catch {
    /* kolom sudah ada */
  }
  nasColReady = true;
}

export async function query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await db().query(sql, params);
  return rows as T[];
}

/**
 * Format tanggal untuk atribut Expiration FreeRADIUS: "21 Aug 2026 10:00:00".
 * Nilai masuk berupa waktu UTC dari database dan dibaca sebagai UTC juga,
 * sama seperti jam server FreeRADIUS.
 */
function radiusDate(iso: string) {
  const d = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
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
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())} ${bulan[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export async function pingDb() {
  const rows = await query<{ v: string }>("SELECT VERSION() AS v");
  const users = await query<{ n: number }>("SELECT COUNT(*) AS n FROM radcheck");
  return { version: rows[0]?.v ?? "?", users: Number(users[0]?.n ?? 0) };
}

/* ----------------------------- PAKET / PLAN ----------------------------- */

let costColReady = false;
/** Menambahkan kolom cost_price (harga modal) pada billing_plan bila belum ada. */
async function ensureCostColumn() {
  if (costColReady) return;
  try {
    await query("ALTER TABLE billing_plan ADD COLUMN cost_price INT NOT NULL DEFAULT 0");
  } catch {
    /* kolom sudah ada */
  }
  costColReady = true;
}

export async function listPlans(): Promise<RadiusPlan[]> {
  await ensureCostColumn();
  return query<RadiusPlan>(
    "SELECT name, price, cost_price, rate_limit, validity_seconds, shared_users, service FROM billing_plan ORDER BY service, name",
  );
}

export async function savePlan(p: RadiusPlan) {
  await ensureCostColumn();
  await query(
    `INSERT INTO billing_plan (name, price, cost_price, rate_limit, validity_seconds, shared_users, service)
     VALUES (?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE price=VALUES(price), cost_price=VALUES(cost_price), rate_limit=VALUES(rate_limit),
       validity_seconds=VALUES(validity_seconds), shared_users=VALUES(shared_users), service=VALUES(service)`,
    [
      p.name,
      p.price,
      p.cost_price ?? 0,
      p.rate_limit,
      p.validity_seconds,
      p.shared_users,
      p.service,
    ],
  );

  // atribut grup dipakai FreeRADIUS untuk membalas ke MikroTik
  await query("DELETE FROM radgroupreply WHERE groupname = ?", [p.name]);
  await query("DELETE FROM radgroupcheck WHERE groupname = ?", [p.name]);
  if (p.rate_limit.trim()) {
    await query(
      "INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (?, 'Mikrotik-Rate-Limit', ':=', ?)",
      [p.name, p.rate_limit.trim()],
    );
  }
  await query(
    "INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (?, 'Acct-Interim-Interval', ':=', '60')",
    [p.name],
  );
  if (p.validity_seconds > 0) {
    // batas durasi sesi -> MikroTik otomatis memutus saat masa aktif habis
    await query(
      "INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (?, 'Session-Timeout', ':=', ?)",
      [p.name, String(p.validity_seconds)],
    );
  }

  if (p.shared_users > 0) {
    await query(
      "INSERT INTO radgroupcheck (groupname, attribute, op, value) VALUES (?, 'Simultaneous-Use', ':=', ?)",
      [p.name, String(p.shared_users)],
    );
  }
  return { ok: true };
}

export async function deletePlan(name: string) {
  await query("DELETE FROM billing_plan WHERE name = ?", [name]);
  await query("DELETE FROM radgroupreply WHERE groupname = ?", [name]);
  await query("DELETE FROM radgroupcheck WHERE groupname = ?", [name]);
  return { ok: true };
}

/* --------------------------- USER / VOUCHER ----------------------------- */

export async function listUsers(): Promise<RadiusUser[]> {
  await ensurePaidColumn();
  await ensureNasColumn();
  return query<RadiusUser>(
    `SELECT v.username, v.password, v.plan, v.batch, v.price, v.service, v.paid, v.nas,
            ${utc("v.created_at")} AS created_at,
            ${utc("v.first_login")} AS first_login,
            ${utc("v.expires_at")} AS expires_at,
            (SELECT COUNT(*) FROM radacct a
              WHERE a.username = v.username AND a.acctstoptime IS NULL
                AND COALESCE(a.acctupdatetime, a.acctstarttime) > NOW() - INTERVAL 10 MINUTE
            ) AS online
       FROM billing_voucher v
      ORDER BY v.created_at DESC, v.username`,
  );
}

export type NewUser = {
  username: string;
  password: string;
  plan: string;
  batch: string;
  price: number;
  service: "hotspot" | "pppoe";
  /** true = sudah dibayar saat generate (pendapatan langsung dihitung) */
  paid?: boolean;
  /** IP NAS (router) pembatas login. Kosong = boleh dari semua NAS. */
  nas?: string;
};

export async function createUsers(users: NewUser[]) {
  await ensurePaidColumn();
  await ensureNasColumn();
  const { ensurePhoneColumn } = await import("./wa.server");
  const { normalizeWaNumber } = await import("./invoice-types");
  await ensurePhoneColumn();
  let created = 0;
  for (const u of users) {
    // Harga dan layanan harus mengikuti paket di database. Jangan bergantung
    // pada nilai dari browser karena daftar paket bisa belum tersinkron.
    const paket = await query<{ price: number; service: "hotspot" | "pppoe" }>(
      "SELECT price, service FROM billing_plan WHERE name = ? LIMIT 1",
      [u.plan],
    );
    const plan = paket[0];
    if (!plan) throw new Error(`Paket ${u.plan} tidak ditemukan`);
    const price = Number(plan.price) || 0;
    await query(
      `INSERT INTO billing_voucher (username, password, plan, batch, price, service, paid, nas, phone, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,NOW())
       ON DUPLICATE KEY UPDATE password=VALUES(password), plan=VALUES(plan),
         batch=VALUES(batch), price=VALUES(price), service=VALUES(service), paid=VALUES(paid),
         nas=VALUES(nas), phone=VALUES(phone)`,
      [
        u.username,
        u.password,
        u.plan,
        u.batch,
        price,
        plan.service,
        u.paid === false ? 0 : 1,
        (u.nas ?? "").trim(),
        normalizeWaNumber(u.phone ?? ""),
      ],
    );
    await query("DELETE FROM radcheck WHERE username = ?", [u.username]);
    await query(
      "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)",
      [u.username, u.password],
    );
    if ((u.nas ?? "").trim()) {
      // voucher hanya bisa dipakai pada router (NAS) yang dipilih
      await query(
        "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'NAS-IP-Address', '==', ?)",
        [u.username, (u.nas ?? "").trim()],
      );
    }
    await query("DELETE FROM radusergroup WHERE username = ?", [u.username]);
    await query("INSERT INTO radusergroup (username, groupname, priority) VALUES (?, ?, 1)", [
      u.username,
      u.plan,
    ]);
    created += 1;
  }
  return { created };
}

export async function deleteUsers(usernames: string[]) {
  if (!usernames.length) return { deleted: 0 };
  const marks = usernames.map(() => "?").join(",");
  await query(`DELETE FROM billing_voucher WHERE username IN (${marks})`, usernames);
  await query(`DELETE FROM radcheck WHERE username IN (${marks})`, usernames);
  await query(`DELETE FROM radreply WHERE username IN (${marks})`, usernames);
  await query(`DELETE FROM radusergroup WHERE username IN (${marks})`, usernames);
  return { deleted: usernames.length };
}

/* ------------------------------- SESI ----------------------------------- */

export async function listSessions(): Promise<RadiusSession[]> {
  return query<RadiusSession>(
    `SELECT radacctid, username, nasipaddress, framedipaddress, callingstationid,
            ${utc("acctstarttime")} AS acctstarttime,
            acctsessiontime, acctinputoctets, acctoutputoctets
       FROM radacct WHERE acctstoptime IS NULL ORDER BY acctstarttime DESC LIMIT 500`,
  );
}

export type RadiusReport = {
  daily: { date: string; total: number; count: number }[];
  monthly: { month: string; total: number; count: number }[];
  todayRevenue: number;
  todayCount: number;
  monthRevenue: number;
  monthCount: number;
  totalRevenue: number;
  totalUsers: number;
  used: number;
  online: number;
};

export async function report(): Promise<RadiusReport> {
  await ensurePaidColumn();
  await ensureCostColumn();
  // Semua waktu di database disimpan UTC. Laporan harian/bulanan memakai
  // zona waktu lokal (default WIB +07:00) sehingga satu hari dihitung dari
  // 00:00:01 sampai 00:00:00 waktu setempat.
  const offsetMenit = Number(process.env["RADIUS_TZ_OFFSET_MINUTES"] ?? 420);
  const lokal = (col: string) => `(${col} + INTERVAL ${offsetMenit} MINUTE)`;
  const hariIni = lokal("NOW()");
  // Login pertama diambil langsung dari radacct bila belum sempat dicatat,
  // supaya voucher yang baru login langsung masuk pendapatan.
  const login =
    "COALESCE(v.first_login, (SELECT MIN(a.acctstarttime) FROM radacct a WHERE a.username = v.username))";
  // Voucher PAID: dihitung sejak dibuat. Voucher UNPAID: baru dihitung
  // setelah dipakai (login pertama di MikroTik).
  const jual = `CASE WHEN v.paid = 1 THEN v.created_at ELSE ${login} END`;
  // Pendapatan dihitung HANYA dari HARGA MODAL paket (cost_price).
  // Paket tanpa harga modal dihitung 0, tidak memakai harga jual.
  const harga = "COALESCE(p.cost_price, 0)";
  const bayar = `(v.paid = 1 OR ${login} IS NOT NULL)`;
  const tgl = lokal(`(${jual})`);
  const daily = await query<{ date: string; total: number; count: number }>(
    `SELECT DATE(${tgl}) AS date, SUM(${harga}) AS total, COUNT(*) AS count
       FROM billing_voucher v LEFT JOIN billing_plan p ON p.name = v.plan
      WHERE ${bayar} GROUP BY DATE(${tgl}) ORDER BY date DESC LIMIT 30`,
  );
  const monthly = await query<{ month: string; total: number; count: number }>(
    `SELECT DATE_FORMAT(${tgl}, '%Y-%m') AS month, SUM(${harga}) AS total, COUNT(*) AS count
       FROM billing_voucher v LEFT JOIN billing_plan p ON p.name = v.plan
      WHERE ${bayar} GROUP BY DATE_FORMAT(${tgl}, '%Y-%m') ORDER BY month DESC LIMIT 12`,
  );
  const agg = await query<{ total: number; users: number; used: number }>(
    `SELECT COALESCE(SUM(CASE WHEN ${bayar} THEN ${harga} END),0) AS total, COUNT(*) AS users,
            COALESCE(SUM(${login} IS NOT NULL),0) AS used
       FROM billing_voucher v LEFT JOIN billing_plan p ON p.name = v.plan`,
  );
  const now = await query<{ dTotal: number; dCount: number; mTotal: number; mCount: number }>(
    `SELECT COALESCE(SUM(CASE WHEN ${bayar} AND DATE(${tgl}) = DATE(${hariIni}) THEN ${harga} END),0) AS dTotal,
            COALESCE(SUM(${bayar} AND DATE(${tgl}) = DATE(${hariIni})),0) AS dCount,
            COALESCE(SUM(CASE WHEN ${bayar} AND DATE_FORMAT(${tgl},'%Y-%m') = DATE_FORMAT(${hariIni},'%Y-%m') THEN ${harga} END),0) AS mTotal,
            COALESCE(SUM(${bayar} AND DATE_FORMAT(${tgl},'%Y-%m') = DATE_FORMAT(${hariIni},'%Y-%m')),0) AS mCount
       FROM billing_voucher v LEFT JOIN billing_plan p ON p.name = v.plan`,
  );

  const on = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM radacct WHERE acctstoptime IS NULL
       AND COALESCE(acctupdatetime, acctstarttime) > NOW() - INTERVAL 10 MINUTE`,
  );
  return {
    daily: daily
      .map((d) => ({ date: d.date, total: Number(d.total), count: Number(d.count) }))
      .reverse(),
    monthly: monthly
      .map((m) => ({ month: m.month, total: Number(m.total), count: Number(m.count) }))
      .reverse(),
    todayRevenue: Number(now[0]?.dTotal ?? 0),
    todayCount: Number(now[0]?.dCount ?? 0),
    monthRevenue: Number(now[0]?.mTotal ?? 0),
    monthCount: Number(now[0]?.mCount ?? 0),
    totalRevenue: Number(agg[0]?.total ?? 0),
    totalUsers: Number(agg[0]?.users ?? 0),
    used: Number(agg[0]?.used ?? 0),
    online: Number(on[0]?.n ?? 0),
  };
}

/* ---------------------------- PEMELIHARAAN ------------------------------ */

/**
 * Mencatat login pertama dari radacct, menghitung expired, dan menghapus
 * voucher yang sudah habis masa aktifnya.
 */
export async function maintenance(hapusExpired = true) {
  const result = { stamped: 0, expired: 0, purged: 0 };

  // 0) Pastikan tiap paket punya Session-Timeout (paket lama ikut diperbarui)
  await query(
    `INSERT IGNORE INTO radgroupreply (groupname, attribute, op, value)
       SELECT name, 'Session-Timeout', ':=', validity_seconds
         FROM billing_plan WHERE validity_seconds > 0
          AND name NOT IN (SELECT groupname FROM radgroupreply WHERE attribute = 'Session-Timeout')`,
  );

  // 0b) Tutup sesi "nyangkut" (router restart / stop hilang) supaya status
  //     online tidak salah tampil selamanya.
  await query(
    `UPDATE radacct
        SET acctstoptime = COALESCE(acctupdatetime, acctstarttime),
            acctterminatecause = COALESCE(NULLIF(acctterminatecause,''), 'Stale-Session')
      WHERE acctstoptime IS NULL
        AND COALESCE(acctupdatetime, acctstarttime) < NOW() - INTERVAL 15 MINUTE`,
  );

  // 1) Catat login pertama + hitung expired (perhitungan penuh di sisi MySQL
  //    supaya tidak ada selisih zona waktu antara panel dan FreeRADIUS).
  //    Termasuk backfill voucher lama yang sudah punya login pertama tapi
  //    expired-nya masih kosong.
  const belum = await query<{
    username: string;
    first: string | null;
    exp: string | null;
  }>(
    `SELECT v.username,
            COALESCE(v.first_login,
              (SELECT MIN(a.acctstarttime) FROM radacct a WHERE a.username = v.username)) AS first,
            DATE_ADD(
              COALESCE(v.first_login,
                (SELECT MIN(a.acctstarttime) FROM radacct a WHERE a.username = v.username)),
              INTERVAL p.validity_seconds SECOND
            ) AS exp
       FROM billing_voucher v
       JOIN billing_plan p ON p.name = v.plan
      WHERE p.validity_seconds > 0
        AND (v.first_login IS NULL OR v.expires_at IS NULL)`,
  );

  for (const r of belum) {
    if (!r.first || !r.exp) continue;
    await query("UPDATE billing_voucher SET first_login = ?, expires_at = ? WHERE username = ?", [
      r.first,
      r.exp,
      r.username,
    ]);
    // Atribut Expiration ditolak FreeRADIUS setelah tanggal ini
    await query(
      "DELETE FROM radcheck WHERE username = ? AND attribute IN ('Expiration','Session-Timeout')",
      [r.username],
    );
    await query(
      "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Expiration', ':=', ?)",
      [r.username, radiusDate(r.exp.replace(" ", "T"))],
    );
    result.stamped += 1;
  }

  // 1b) Voucher tanpa masa aktif di paket: tetap catat login pertama saja.
  await query(
    `UPDATE billing_voucher v
        SET v.first_login = (SELECT MIN(a.acctstarttime) FROM radacct a WHERE a.username = v.username)
      WHERE v.first_login IS NULL
        AND EXISTS (SELECT 1 FROM radacct a WHERE a.username = v.username)`,
  );

  // 1c) Voucher UNPAID yang sudah login -> otomatis jadi PAID (sudah terjual)
  await ensurePaidColumn();
  await query(
    `UPDATE billing_voucher v
        SET v.paid = 1
      WHERE v.paid = 0
        AND (v.first_login IS NOT NULL
             OR EXISTS (SELECT 1 FROM radacct a WHERE a.username = v.username))`,
  );

  // 2) Perbarui sisa waktu sesi user aktif agar router memutus tepat waktu
  const aktif = await query<{ username: string; sisa: number }>(
    `SELECT username, GREATEST(TIMESTAMPDIFF(SECOND, NOW(), expires_at), 0) AS sisa
       FROM billing_voucher
      WHERE first_login IS NOT NULL AND expires_at IS NOT NULL AND expires_at > NOW()`,
  );
  for (const a of aktif) {
    await query("DELETE FROM radreply WHERE username = ? AND attribute = 'Session-Timeout'", [
      a.username,
    ]);
    await query(
      "INSERT INTO radreply (username, attribute, op, value) VALUES (?, 'Session-Timeout', ':=', ?)",
      [a.username, String(Math.max(60, Number(a.sisa)))],
    );
  }

  // 3) Voucher habis masa aktif -> diblokir (data tetap tersimpan)
  const habis = await query<{ username: string }>(
    "SELECT username FROM billing_voucher WHERE expires_at IS NOT NULL AND expires_at <= NOW()",
  );
  if (habis.length) {
    const marks = habis.map(() => "?").join(",");
    const names = habis.map((h) => h.username);
    await query(
      `DELETE FROM radcheck WHERE attribute = 'Cleartext-Password' AND username IN (${marks})`,
      names,
    );
  }
  result.expired = habis.length;

  // 4) Bersihkan otomatis voucher yang sudah expired lebih dari 2 bulan
  if (hapusExpired) {
    const lama = await query<{ username: string }>(
      "SELECT username FROM billing_voucher WHERE expires_at IS NOT NULL AND expires_at <= NOW() - INTERVAL 2 MONTH",
    );
    if (lama.length) await deleteUsers(lama.map((l) => l.username));
    result.purged = lama.length;
  }

  // 5) Tagihan otomatis H-1 untuk paket masa aktif 30 hari (bila diaktifkan)
  try {
    const { generateInvoices } = await import("./invoice.server");
    await generateInvoices();
  } catch {
    /* tagihan otomatis nonaktif / tabel belum siap */
  }
  return result;
}

/** Hapus semua voucher yang sudah expired (manual dari menu). */
export async function deleteExpiredUsers() {
  const rows = await query<{ username: string }>(
    "SELECT username FROM billing_voucher WHERE expires_at IS NOT NULL AND expires_at <= NOW()",
  );
  if (!rows.length) return { deleted: 0 };
  return deleteUsers(rows.map((r) => r.username));
}

/**
 * Aktifkan kembali voucher expired: masa aktif dihitung ulang dari login
 * berikutnya (first_login & expires_at dikosongkan, password dipulihkan).
 */
export async function reactivateUsers(usernames: string[]) {
  if (!usernames.length) return { reactivated: 0 };
  const marks = usernames.map(() => "?").join(",");
  const rows = await query<{ username: string; password: string; plan: string }>(
    `SELECT username, password, plan FROM billing_voucher WHERE username IN (${marks})`,
    usernames,
  );
  for (const r of rows) {
    await query(
      "UPDATE billing_voucher SET first_login = NULL, expires_at = NULL WHERE username = ?",
      [r.username],
    );
    await query(
      "DELETE FROM radcheck WHERE username = ? AND attribute IN ('Cleartext-Password','Expiration','Session-Timeout')",
      [r.username],
    );
    await query(
      "INSERT INTO radcheck (username, attribute, op, value) VALUES (?, 'Cleartext-Password', ':=', ?)",
      [r.username, r.password],
    );
    await query("DELETE FROM radreply WHERE username = ? AND attribute = 'Session-Timeout'", [
      r.username,
    ]);
    await query("DELETE FROM radusergroup WHERE username = ?", [r.username]);
    await query("INSERT INTO radusergroup (username, groupname, priority) VALUES (?, ?, 1)", [
      r.username,
      r.plan,
    ]);
  }
  return { reactivated: rows.length };
}

/**
 * Loop pemeliharaan di sisi server (tidak bergantung pada browser yang terbuka),
 * berjalan tiap 60 detik selama panel hidup.
 */
let timer: ReturnType<typeof setInterval> | null = null;
export function startAutoMaintenance(hapusExpired = true) {
  if (timer) return;
  timer = setInterval(() => {
    maintenance(hapusExpired).catch(() => {});
  }, 60_000);
  maintenance(hapusExpired).catch(() => {});
}

/** Daftar user yang sedang online + sudah expired (untuk diputus dari router). */
export async function expiredOnline(): Promise<string[]> {
  const rows = await query<{ username: string }>(
    `SELECT DISTINCT v.username FROM billing_voucher v
       JOIN radacct a ON a.username = v.username AND a.acctstoptime IS NULL
      WHERE v.expires_at IS NOT NULL AND v.expires_at <= NOW()`,
  );
  return rows.map((r) => r.username);
}

/**
 * Semua voucher yang sudah expired (data tetap tersimpan di billing).
 * Dipakai untuk menghapus user/secret-nya di MikroTik saja.
 */
export async function expiredUsernames(): Promise<string[]> {
  const rows = await query<{ username: string }>(
    "SELECT username FROM billing_voucher WHERE expires_at IS NOT NULL AND expires_at <= NOW() LIMIT 1000",
  );
  return rows.map((r) => r.username);
}

/**
 * MODE HYBRID: voucher yang login lewat user lokal MikroTik tidak pernah
 * tercatat di radacct, sehingga billing tidak tahu voucher sudah dipakai.
 * Fungsi ini mencatat login pertama (dari uptime di router) + menghitung
 * masa aktif & menandai voucher sebagai terjual.
 */
export async function stampRouterLogins(
  items: Array<{ username: string; uptimeSeconds?: number }>,
) {
  if (!items.length) return { stamped: 0 };
  await ensurePaidColumn();
  let stamped = 0;
  for (const it of items) {
    const rows = await query<{ username: string; validity: number }>(
      `SELECT v.username, COALESCE(p.validity_seconds, 0) AS validity
         FROM billing_voucher v LEFT JOIN billing_plan p ON p.name = v.plan
        WHERE v.username = ? AND v.first_login IS NULL LIMIT 1`,
      [it.username],
    );
    const row = rows[0];
    if (!row) continue;
    const lalu = Math.max(0, Math.floor(Number(it.uptimeSeconds ?? 0)));
    const validity = Number(row.validity ?? 0);
    if (validity > 0) {
      await query(
        `UPDATE billing_voucher
            SET first_login = DATE_SUB(NOW(), INTERVAL ? SECOND),
                expires_at = DATE_ADD(DATE_SUB(NOW(), INTERVAL ? SECOND), INTERVAL ? SECOND),
                paid = 1
          WHERE username = ?`,
        [lalu, lalu, validity, it.username],
      );
    } else {
      await query(
        `UPDATE billing_voucher
            SET first_login = DATE_SUB(NOW(), INTERVAL ? SECOND), paid = 1
          WHERE username = ?`,
        [lalu, it.username],
      );
    }
    stamped += 1;
  }
  return { stamped };
}

/* --------------------------------- NAS ---------------------------------- */

let nasTzReady = false;
/** Menambahkan kolom timezone pada tabel nas bila belum ada. */
async function ensureNasTimezone() {
  if (nasTzReady) return;
  try {
    await query("ALTER TABLE nas ADD COLUMN timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta'");
  } catch {
    /* kolom sudah ada */
  }
  nasTzReady = true;
}

export async function listNas(): Promise<import("./radius-types").RadiusNas[]> {
  await ensureNasTimezone();
  return query(
    "SELECT id, nasname, shortname, type, ports, secret, description, timezone FROM nas ORDER BY nasname",
  );
}

export async function saveNas(n: {
  id?: number;
  nasname: string;
  shortname: string;
  secret: string;
  description: string;
  timezone?: string;
}) {
  await ensureNasTimezone();
  const tz = n.timezone?.trim() || "Asia/Jakarta";
  if (n.id) {
    await query(
      "UPDATE nas SET nasname=?, shortname=?, secret=?, description=?, timezone=? WHERE id=?",
      [n.nasname, n.shortname, n.secret, n.description, tz, n.id],
    );
  } else {
    await query(
      `INSERT INTO nas (nasname, shortname, type, ports, secret, description, timezone)
       VALUES (?,?,'mikrotik',1812,?,?,?)`,
      [n.nasname, n.shortname, n.secret, n.description, tz],
    );
  }
  return { ok: true };
}

export async function deleteNas(id: number) {
  await query("DELETE FROM nas WHERE id = ?", [id]);
  return { ok: true };
}

/* --------------------------- PENGATURAN GLOBAL --------------------------- */
/**
 * Pengaturan (kredensial router, dsb.) disimpan di database server, bukan di
 * browser, sehingga panel yang dibuka dari jaringan luar / perangkat lain
 * tetap memakai konfigurasi yang sama.
 */
let settingReady = false;
async function ensureSettingTable() {
  if (settingReady) return;
  await query(
    `CREATE TABLE IF NOT EXISTS billing_setting (
       skey VARCHAR(64) NOT NULL PRIMARY KEY,
       svalue TEXT NOT NULL
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );
  settingReady = true;
}

export async function getSettings(): Promise<Record<string, string>> {
  await ensureSettingTable();
  const rows = await query<{ skey: string; svalue: string }>(
    "SELECT skey, svalue FROM billing_setting",
  );
  const out: Record<string, string> = {};
  for (const r of rows) out[r.skey] = r.svalue;
  return out;
}

export async function saveSettings(entries: Record<string, string>) {
  await ensureSettingTable();
  for (const [k, v] of Object.entries(entries)) {
    await query(
      "INSERT INTO billing_setting (skey, svalue) VALUES (?,?) ON DUPLICATE KEY UPDATE svalue = VALUES(svalue)",
      [k, v],
    );
  }
  return { ok: true as const };
}
