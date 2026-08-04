-- =====================================================================
--  Skema tambahan NAJWA_BILLING di atas skema bawaan FreeRADIUS
--  (radcheck, radreply, radgroupcheck, radgroupreply, radusergroup,
--   radacct, nas sudah dibuat oleh paket freeradius-mysql)
-- =====================================================================

CREATE TABLE IF NOT EXISTS billing_plan (
  name             VARCHAR(64) NOT NULL PRIMARY KEY,
  price            INT NOT NULL DEFAULT 0,
  cost_price       INT NOT NULL DEFAULT 0,
  rate_limit       VARCHAR(64) NOT NULL DEFAULT '',
  validity_seconds INT NOT NULL DEFAULT 0,
  shared_users     INT NOT NULL DEFAULT 1,
  service          ENUM('hotspot','pppoe') NOT NULL DEFAULT 'hotspot'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Kolom harga modal untuk instalasi lama
ALTER TABLE billing_plan ADD COLUMN cost_price INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS billing_voucher (
  username    VARCHAR(64) NOT NULL PRIMARY KEY,
  password    VARCHAR(64) NOT NULL,
  plan        VARCHAR(64) NOT NULL,
  batch       VARCHAR(64) NOT NULL DEFAULT '',
  price       INT NOT NULL DEFAULT 0,
  service     ENUM('hotspot','pppoe') NOT NULL DEFAULT 'hotspot',
  paid        TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  first_login DATETIME NULL,
  expires_at  DATETIME NULL,
  KEY idx_batch (batch),
  KEY idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Pengaturan global panel, termasuk akun login bersama dan koneksi router.
CREATE TABLE IF NOT EXISTS billing_setting (
  skey   VARCHAR(64) NOT NULL PRIMARY KEY,
  svalue TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Paket contoh (boleh dihapus/diubah lewat panel)
INSERT IGNORE INTO billing_plan (name, price, rate_limit, validity_seconds, shared_users, service)
VALUES
  ('1-Hari',  5000,  '3M/3M',  86400,   1, 'hotspot'),
  ('7-Hari',  25000, '5M/5M',  604800,  1, 'hotspot'),
  ('30-Hari', 90000, '10M/10M', 2592000, 1, 'hotspot'),
  ('PPPoE-10M', 150000, '10M/10M', 2592000, 1, 'pppoe');

-- Zona waktu per NAS (router). Diabaikan bila kolom sudah ada.
ALTER TABLE nas ADD COLUMN timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta';

-- Tagihan otomatis untuk paket masa aktif 30 hari (dibuat H-1 sebelum expired).
CREATE TABLE IF NOT EXISTS billing_invoice (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
