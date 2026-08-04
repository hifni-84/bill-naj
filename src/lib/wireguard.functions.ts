import { createServerFn } from "@tanstack/react-start";

export const wgInfo = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { wgServerInfo } = await import("./wireguard.server");
    return await wgServerInfo();
  } catch (e) {
    return {
      ready: false,
      iface: "wg0",
      network: "10.20.20.0/24",
      serverIp: "10.20.20.1",
      serverPublicKey: null as string | null,
      listenPort: 51820,
      endpoint: "",
      up: false,
      writable: false,
      error: e instanceof Error ? e.message : "WireGuard tidak tersedia di server ini",
    };
  }
});

export const wgPeers = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { wgListPeers, wgHandshakes } = await import("./wireguard.server");
    const [peers, hs] = await Promise.all([wgListPeers(), wgHandshakes()]);
    return {
      ok: true as const,
      error: null as string | null,
      peers: peers.map((p) => ({
        id: p.id,
        name: p.name,
        peerIp: p.peer_ip,
        publicKey: p.public_key,
        secret: p.secret,
        lastHandshake: hs[p.public_key]?.last ?? 0,
        rx: hs[p.public_key]?.rx ?? 0,
        tx: hs[p.public_key]?.tx ?? 0,
      })),
    };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message, peers: [] };
  }
});

export const wgAdd = createServerFn({ method: "POST" })
  .inputValidator((d: { name: string; secret?: string; registerNas?: boolean }) => d)
  .handler(async ({ data }) => {
    try {
      const { wgAddPeer } = await import("./wireguard.server");
      return await wgAddPeer(data);
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const wgScript = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    try {
      const { wgPeerScript } = await import("./wireguard.server");
      return { ok: true as const, ...(await wgPeerScript(data.id)) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const wgRemove = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    try {
      const { wgDeletePeer } = await import("./wireguard.server");
      return await wgDeletePeer(data.id);
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const wgTest = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      id: number;
      creds?: { username?: string; password?: string; port?: number; useHttps?: boolean };
    }) => d,
  )
  .handler(async ({ data }) => {
    try {
      const { wgTestPeer } = await import("./wireguard.server");
      return { ok: true as const, ...(await wgTestPeer(data.id, data.creds)) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });
