/**
 * Manajemen peer WireGuard langsung dari panel billing.
 * Router ke-2 dan seterusnya bisa ditambahkan tanpa menyentuh terminal server:
 * kunci dibuat di server, config wg0 diperbarui, dan skrip MikroTik dicetak.
 */
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import { promisify } from "node:util";

import { query } from "./radius.server";

const exec = promisify(execFile);

const WG_IF = process.env["WG_IF"] ?? "wg0";
const WG_NET = process.env["WG_NET"] ?? "10.20.20";
const CONF = `/etc/wireguard/${WG_IF}.conf`;
const SERVER_PUB = "/etc/wireguard/server.pub";

export type WgPeer = {
  id: number;
  name: string;
  peer_ip: string;
  public_key: string;
  private_key: string;
  secret: string;
  created_at: string | null;
};

export type WgServerInfo = {
  ready: boolean;
  iface: string;
  network: string;
  serverIp: string;
  serverPublicKey: string | null;
  listenPort: number;
  endpoint: string;
  up: boolean;
  writable: boolean;
  error: string | null;
};

/* ------------------------------ util server ------------------------------ */

async function run(cmd: string, args: string[]) {
  try {
    return (await exec(cmd, args)).stdout;
  } catch {
    // service billing biasanya tidak berjalan sebagai root -> coba lewat sudo
    return (await exec("sudo", ["-n", cmd, ...args])).stdout;
  }
}

async function readConf(): Promise<string> {
  try {
    return await fs.readFile(CONF, "utf8");
  } catch {
    return await run("cat", [CONF]);
  }
}

async function writeConf(text: string) {
  try {
    await fs.writeFile(CONF, text, { mode: 0o600 });
  } catch {
    const tmp = `/tmp/${WG_IF}.conf.billing`;
    await fs.writeFile(tmp, text, { mode: 0o600 });
    await run("install", ["-m", "600", tmp, CONF]);
  }
}

/** Kunci WireGuard (Curve25519, base64) dibuat murni dengan Node crypto. */
function genKeys() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("x25519");
  const priv = privateKey.export({ type: "pkcs8", format: "der" }).subarray(-32);
  const pub = publicKey.export({ type: "spki", format: "der" }).subarray(-32);
  return { privateKey: priv.toString("base64"), publicKey: pub.toString("base64") };
}

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await query(
    `CREATE TABLE IF NOT EXISTS wg_peer (
       id INT AUTO_INCREMENT PRIMARY KEY,
       name VARCHAR(64) NOT NULL UNIQUE,
       peer_ip VARCHAR(45) NOT NULL,
       public_key VARCHAR(128) NOT NULL,
       private_key VARCHAR(128) NOT NULL,
       secret VARCHAR(64) NOT NULL DEFAULT 'rahasia123',
       created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );
  tableReady = true;
}

/* --------------------- endpoint manual (IP publik/DDNS) -------------------- */

let optTableReady = false;
async function ensureOptTable() {
  if (optTableReady) return;
  await query(
    `CREATE TABLE IF NOT EXISTS wg_option (
       name VARCHAR(64) NOT NULL PRIMARY KEY,
       value VARCHAR(190) NOT NULL
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );
  optTableReady = true;
}

export async function wgGetEndpointOverride(): Promise<string> {
  try {
    await ensureOptTable();
    const rows = await query<{ value: string }>(
      "SELECT value FROM wg_option WHERE name = 'endpoint' LIMIT 1",
    );
    return rows[0]?.value?.trim() ?? "";
  } catch {
    return "";
  }
}

export async function wgSetEndpointOverride(endpoint: string) {
  await ensureOptTable();
  const clean = endpoint.trim();
  if (clean) {
    await query(
      "INSERT INTO wg_option (name, value) VALUES ('endpoint', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
      [clean],
    );
  } else {
    await query("DELETE FROM wg_option WHERE name = 'endpoint'");
  }
  return { ok: true as const, endpoint: clean };
}

/* ------------------------------- info server ------------------------------ */

export async function wgServerInfo(): Promise<WgServerInfo> {
  const info: WgServerInfo = {
    ready: false,
    iface: WG_IF,
    network: `${WG_NET}.0/24`,
    serverIp: `${WG_NET}.1`,
    serverPublicKey: null,
    listenPort: Number(process.env["WG_PORT"] ?? 51820),
    endpoint: "",
    up: false,
    writable: false,
    error: null,
  };

  try {
    const conf = await readConf();
    info.ready = true;
    const port = /ListenPort\s*=\s*(\d+)/.exec(conf);
    if (port?.[1]) info.listenPort = Number(port[1]);
  } catch (e) {
    info.error = e instanceof Error ? e.message : "Config WireGuard tidak ditemukan";
  }

  try {
    info.serverPublicKey = (await fs.readFile(SERVER_PUB, "utf8")).trim();
  } catch {
    try {
      info.serverPublicKey = (await run("cat", [SERVER_PUB])).trim();
    } catch {
      /* biarkan null */
    }
  }

  try {
    const out = await run("wg", ["show", WG_IF]);
    info.up = out.includes("interface");
    info.writable = true;
  } catch {
    info.up = false;
  }

  // Prioritas: endpoint manual dari panel -> env PUBLIC_HOST -> deteksi otomatis
  const manual = await wgGetEndpointOverride();
  info.endpoint = manual || (process.env["PUBLIC_HOST"] ?? "");

  if (!info.endpoint) {
    try {
      const res = await fetch("https://api.ipify.org", {
        signal: AbortSignal.timeout(4000),
      });
      info.endpoint = (await res.text()).trim();
    } catch {
      info.endpoint = "IP_PUBLIK_ATAU_DDNS_SERVER";
    }
  }

  return info;
}

/* --------------------------------- peers --------------------------------- */

export async function wgListPeers(): Promise<WgPeer[]> {
  await ensureTable();
  return query<WgPeer>(
    "SELECT id, name, peer_ip, public_key, private_key, secret, created_at FROM wg_peer ORDER BY id",
  );
}

export function mikrotikScript(p: {
  peerIp: string;
  privateKey: string;
  serverPublicKey: string;
  endpoint: string;
  listenPort: number;
  serverIp: string;
  network: string;
  secret: string;
}) {
  return `/interface wireguard
add name=wg-billing listen-port=13231 mtu=1420 private-key="${p.privateKey}"

/ip address
add address=${p.peerIp}/24 interface=wg-billing

/interface wireguard peers
add interface=wg-billing public-key="${p.serverPublicKey}" \\
    endpoint-address=${p.endpoint} endpoint-port=${p.listenPort} \\
    allowed-address=${p.network} persistent-keepalive=25s

# REST API (dipakai billing untuk hapus user / putus sesi) + API lama
/ip service set www disabled=no
/ip service set api disabled=no

/ip firewall filter
add chain=input in-interface=wg-billing action=accept comment="WG Billing" place-before=0

/radius
add address=${p.serverIp} secret=${p.secret} service=hotspot,ppp timeout=3s
/ip hotspot profile set [find] use-radius=yes
/ppp aaa set use-radius=yes

# Cek dari router: harus reply
/ping ${p.serverIp} count=3`;
}

/** Diagnosa satu peer: handshake tunnel + REST API router. */
export async function wgTestPeer(
  id: number,
  creds?: { username?: string; password?: string; port?: number; useHttps?: boolean },
) {
  const peers = await wgListPeers();
  const p = peers.find((x) => x.id === id);
  if (!p) throw new Error("Router tidak ditemukan");

  const hs = await wgHandshakes();
  const last = hs[p.public_key]?.last ?? 0;
  const inConf = (await readConf().catch(() => "")).includes(p.public_key);

  const { callRouterOs } = await import("./mikrotik.server");
  const res = creds?.username
    ? await callRouterOs(
        {
          host: p.peer_ip,
          username: creds.username,
          password: creds.password ?? "",
          ...(creds.port !== undefined ? { port: creds.port } : {}),
          ...(creds.useHttps !== undefined ? { useHttps: creds.useHttps } : {}),
        },
        "/system/identity",
        "GET",
      )
    : null;

  const saran: string[] = [];
  if (!inConf) saran.push(`Public key peer tidak ada di ${CONF} — hapus lalu tambah ulang router.`);
  if (!last)
    saran.push(
      "Belum ada handshake: pastikan skrip sudah dijalankan di router, endpoint & port UDP server terbuka, dan private-key di router sama dengan yang ditampilkan panel.",
    );
  if (last && res && !res.ok)
    saran.push(
      "Tunnel sudah handshake tapi REST API gagal: aktifkan /ip service set www disabled=no dan izinkan chain=input in-interface=wg-billing, serta pastikan user/password router sama dengan Pengaturan.",
    );

  return {
    name: p.name,
    peerIp: p.peer_ip,
    inConf,
    lastHandshake: last,
    api: Boolean(res?.ok),
    apiError: res && !res.ok ? (res.error ?? "gagal") : creds?.username ? null : "Kredensial router belum diisi di Pengaturan",
    saran,
  };
}

export async function wgAddPeer(input: { name: string; secret?: string; registerNas?: boolean }) {
  await ensureTable();
  const name = input.name.trim().replace(/\s+/g, "-");
  if (!name) throw new Error("Nama router wajib diisi");

  const secret = (input.secret ?? "").trim() || "rahasia123";
  const peers = await wgListPeers();
  if (peers.some((p) => p.name === name)) throw new Error(`Router "${name}" sudah ada`);

  // IP berikutnya: lihat DB + config (mulai dari .2)
  const used = new Set<number>([1]);
  for (const p of peers) {
    const n = Number(p.peer_ip.split(".").pop());
    if (Number.isFinite(n)) used.add(n);
  }
  let conf = "";
  try {
    conf = await readConf();
    for (const m of conf.matchAll(new RegExp(`AllowedIPs\\s*=\\s*${WG_NET}\\.(\\d+)`, "g"))) {
      used.add(Number(m[1]));
    }
  } catch {
    throw new Error(
      `Config ${CONF} belum ada. Jalankan sekali di server: sudo bash deploy/install-wireguard.sh`,
    );
  }
  let next = 2;
  while (used.has(next)) next += 1;
  const peerIp = `${WG_NET}.${next}`;

  const { privateKey, publicKey } = genKeys();

  const block = `\n# peer: ${name}\n[Peer]\nPublicKey = ${publicKey}\nAllowedIPs = ${peerIp}/32\n`;
  await writeConf(`${conf.replace(/\s*$/, "\n")}${block}`);

  let applied = true;
  let applyError: string | null = null;
  try {
    await run("wg", ["set", WG_IF, "peer", publicKey, "allowed-ips", `${peerIp}/32`]);
  } catch (e) {
    applied = false;
    applyError = e instanceof Error ? e.message : "gagal menerapkan ke interface";
  }

  await query(
    "INSERT INTO wg_peer (name, peer_ip, public_key, private_key, secret) VALUES (?,?,?,?,?)",
    [name, peerIp, publicKey, privateKey, secret],
  );

  if (input.registerNas !== false) {
    try {
      const { saveNas } = await import("./radius.server");
      await saveNas({
        nasname: peerIp,
        shortname: name,
        secret,
        description: `WireGuard ${name}`,
      });
    } catch {
      /* NAS bisa ditambah manual di Pengaturan */
    }
  }

  const info = await wgServerInfo();
  return {
    ok: true as const,
    name,
    peerIp,
    applied,
    applyError,
    script: mikrotikScript({
      peerIp,
      privateKey,
      serverPublicKey: info.serverPublicKey ?? "PUBLIC_KEY_SERVER",
      endpoint: info.endpoint,
      listenPort: info.listenPort,
      serverIp: info.serverIp,
      network: info.network,
      secret,
    }),
  };
}

export async function wgPeerScript(id: number) {
  const peers = await wgListPeers();
  const p = peers.find((x) => x.id === id);
  if (!p) throw new Error("Router tidak ditemukan");
  const info = await wgServerInfo();
  return {
    name: p.name,
    peerIp: p.peer_ip,
    script: mikrotikScript({
      peerIp: p.peer_ip,
      privateKey: p.private_key,
      serverPublicKey: info.serverPublicKey ?? "PUBLIC_KEY_SERVER",
      endpoint: info.endpoint,
      listenPort: info.listenPort,
      serverIp: info.serverIp,
      network: info.network,
      secret: p.secret,
    }),
  };
}

export async function wgDeletePeer(id: number) {
  await ensureTable();
  const peers = await wgListPeers();
  const p = peers.find((x) => x.id === id);
  if (!p) return { ok: true as const };

  try {
    const conf = await readConf();
    const cleaned = conf
      .replace(new RegExp(`\\n?# peer: ${p.name}\\n\\[Peer\\][^[]*`, "g"), "\n")
      .replace(/\n{3,}/g, "\n\n");
    await writeConf(cleaned);
  } catch {
    /* config tidak bisa dibaca/ditulis */
  }
  try {
    await run("wg", ["set", WG_IF, "peer", p.public_key, "remove"]);
  } catch {
    /* interface tidak aktif */
  }
  await query("DELETE FROM wg_peer WHERE id = ?", [id]);
  try {
    await query("DELETE FROM nas WHERE nasname = ?", [p.peer_ip]);
  } catch {
    /* abaikan */
  }
  return { ok: true as const };
}

/** Status handshake tiap peer dari `wg show <if> dump`. */
export async function wgHandshakes(): Promise<Record<string, { last: number; rx: number; tx: number }>> {
  const out: Record<string, { last: number; rx: number; tx: number }> = {};
  try {
    const dump = await run("wg", ["show", WG_IF, "dump"]);
    for (const line of dump.trim().split("\n").slice(1)) {
      const f = line.split("\t");
      if (f[0]) out[f[0]] = { last: Number(f[4] ?? 0), rx: Number(f[5] ?? 0), tx: Number(f[6] ?? 0) };
    }
  } catch {
    /* interface belum aktif */
  }
  return out;
}
