/**
 * Penyimpanan gambar QRIS statis di database server sehingga admin bisa
 * mengunggah langsung dari halaman Pengaturan tanpa image hosting eksternal.
 */
import { query } from "./radius.server";

let ready = false;
async function ensureTable() {
  if (ready) return;
  await query(
    `CREATE TABLE IF NOT EXISTS billing_asset (
       akey VARCHAR(64) NOT NULL PRIMARY KEY,
       mime VARCHAR(64) NOT NULL,
       adata MEDIUMTEXT NOT NULL,
       updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );
  ready = true;
}

const KEY = "qris";

export async function saveQrisImage(mime: string, base64: string) {
  await ensureTable();
  await query(
    `INSERT INTO billing_asset (akey, mime, adata) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE mime = VALUES(mime), adata = VALUES(adata)`,
    [KEY, mime, base64],
  );
  return { ok: true as const };
}

export async function getQrisImage() {
  await ensureTable();
  const rows = await query<{ mime: string; adata: string; updated_at: string }>(
    "SELECT mime, adata, updated_at FROM billing_asset WHERE akey = ? LIMIT 1",
    [KEY],
  );
  return rows[0] ?? null;
}

export async function deleteQrisImage() {
  await ensureTable();
  await query("DELETE FROM billing_asset WHERE akey = ?", [KEY]);
  return { ok: true as const };
}
