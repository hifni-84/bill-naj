import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, Plus, RefreshCw, Stethoscope, Trash2, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { wgAdd, wgInfo, wgPeers, wgRemove, wgScript, wgTest } from "@/lib/wireguard.functions";
import { useCreds } from "@/lib/router-store";

export const Route = createFileRoute("/vpn")({
  head: () => ({
    meta: [
      { title: "VPN Router — NAJWA_BILLING" },
      {
        name: "description",
        content:
          "Tambahkan MikroTik dari jaringan mana pun lewat tunnel WireGuard langsung dari panel billing, tanpa perintah manual di server.",
      },
      { property: "og:title", content: "VPN Router — NAJWA_BILLING" },
      {
        property: "og:description",
        content: "Kelola tunnel WireGuard dan daftarkan router baru ke billing dalam satu klik.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VpnPage,
});

function waktuHandshake(sec: number) {
  if (!sec) return "belum pernah";
  const detik = Math.max(0, Math.floor(Date.now() / 1000) - sec);
  if (detik < 60) return `${detik} detik lalu`;
  if (detik < 3600) return `${Math.floor(detik / 60)} menit lalu`;
  return `${Math.floor(detik / 3600)} jam lalu`;
}

function VpnPage() {
  const qc = useQueryClient();
  const { creds } = useCreds();
  const info = useQuery({ queryKey: ["wg", "info"], queryFn: () => wgInfo() });
  const peers = useQuery({
    queryKey: ["wg", "peers"],
    queryFn: () => wgPeers(),
    refetchInterval: 20000,
  });

  const [nama, setNama] = useState("");
  const [secret, setSecret] = useState("rahasia123");
  const [script, setScript] = useState<{ name: string; peerIp: string; text: string } | null>(null);
  const [diag, setDiag] = useState<string[] | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["wg"] });

  const tambah = useMutation({
    mutationFn: () => wgAdd({ data: { name: nama, secret } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error ?? "Gagal menambah router");
        return;
      }
      setScript({ name: res.name, peerIp: res.peerIp, text: res.script });
      setNama("");
      toast.success(
        res.applied
          ? `Router ${res.name} ditambahkan (${res.peerIp})`
          : `Router ${res.name} tersimpan (${res.peerIp}) — tunnel belum aktif: ${res.applyError ?? ""}`,
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lihatScript = useMutation({
    mutationFn: (id: number) => wgScript({ data: { id } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error ?? "Gagal mengambil konfigurasi");
        return;
      }
      setScript({ name: res.name, peerIp: res.peerIp, text: res.script });
    },
  });

  const hapus = useMutation({
    mutationFn: (id: number) => wgRemove({ data: { id } }),
    onSuccess: () => {
      setScript(null);
      toast.success("Router dihapus dari tunnel");
      invalidate();
    },
  });

  const tes = useMutation({
    mutationFn: (id: number) =>
      wgTest({
        data: {
          id,
          creds: {
            username: creds.username,
            password: creds.password,
            ...(creds.port !== undefined ? { port: creds.port } : {}),
            ...(creds.useHttps !== undefined ? { useHttps: creds.useHttps } : {}),
          },
        },
      }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error ?? "Gagal menguji");
        return;
      }
      const baris = [
        `Router: ${res.name} (${res.peerIp})`,
        `Peer terdaftar di server: ${res.inConf ? "ya" : "tidak"}`,
        `Handshake tunnel: ${res.lastHandshake ? waktuHandshake(res.lastHandshake) : "belum pernah"}`,
        `REST API router: ${res.api ? "terhubung" : `gagal — ${res.apiError ?? "-"}`}`,
        ...res.saran.map((s) => `• ${s}`),
      ];
      setDiag(baris);
      if (res.api && res.lastHandshake) toast.success("Router kedua terhubung penuh");
      else toast.warning("Belum terhubung — lihat hasil diagnosa");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const salin = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success("Konfigurasi disalin");
  };

  const d = info.data;
  const list = peers.data?.peers ?? [];

  return (
    <div>
      <PageHeader
        title="VPN Router (WireGuard)"
        description={`Tambahkan router ke-2 dan seterusnya dari panel ini — tanpa mengetik apa pun di server. Total router: ${list.length}`}
        action={
          <Button variant="outline" size="sm" onClick={invalidate}>
            <RefreshCw className="mr-2 size-4" /> Muat Ulang
          </Button>
        }
      />

      <div className="panel mb-6 p-5">
        <h2 className="mb-3 text-sm font-semibold">Status Server Tunnel</h2>
        <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Interface" value={d?.iface ?? "-"} />
          <Info label="Jaringan tunnel" value={d?.network ?? "-"} />
          <Info label="IP server (RADIUS)" value={d?.serverIp ?? "-"} />
          <Info label="Endpoint" value={d ? `${d.endpoint}:${d.listenPort}` : "-"} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              d?.up ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"
            }`}
          >
            {d?.up ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
            {d?.up ? "Tunnel aktif" : "Tunnel tidak aktif"}
          </span>
          {d?.error && <span className="text-[11px] text-destructive">{d.error}</span>}
        </div>
        {!d?.ready && (
          <p className="mt-3 rounded-md bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
            Server WireGuard belum disiapkan. Cukup sekali saja di server jalankan:{" "}
            <code className="mono-num">sudo bash deploy/install-wireguard.sh</code> lalu{" "}
            <code className="mono-num">sudo bash deploy/allow-wg-sudo.sh</code>. Setelah itu semua
            router berikutnya bisa ditambahkan dari halaman ini.
          </p>
        )}
      </div>

      <div className="panel mb-6 p-5">
        <h2 className="mb-1 text-sm font-semibold">Tambah Router</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          IP tunnel & kunci dibuat otomatis, router langsung didaftarkan sebagai NAS RADIUS.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nama router</Label>
            <Input
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="router2"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Secret RADIUS</Label>
            <Input value={secret} onChange={(e) => setSecret(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={!nama.trim() || tambah.isPending}
              onClick={() => tambah.mutate()}
            >
              <Plus className="mr-2 size-4" /> Tambah & Buat Konfigurasi
            </Button>
          </div>
        </div>
      </div>

      {script && (
        <div className="panel mb-6 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              Konfigurasi MikroTik — {script.name} ({script.peerIp})
            </h2>
            <Button size="sm" variant="outline" onClick={() => salin(script.text)}>
              <Copy className="mr-2 size-4" /> Salin
            </Button>
          </div>
          <pre className="max-h-80 overflow-auto rounded-md bg-muted/50 p-3 text-[11px] leading-relaxed">
            {script.text}
          </pre>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Tempel di terminal Winbox/SSH router. Di billing gunakan Host API{" "}
            <code className="mono-num">{script.peerIp}</code>.
          </p>
        </div>
      )}

      <div className="panel overflow-hidden">
        {diag && (
          <div className="border-b border-border px-4 py-3">
            <p className="mb-1 text-xs font-semibold">Hasil Diagnosa</p>
            <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
              {diag.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>IP Tunnel</TableHead>
                <TableHead>Handshake</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-xs text-muted-foreground">
                    {peers.data?.error ?? "Belum ada router di tunnel"}
                  </TableCell>
                </TableRow>
              )}
              {list.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="mono-num">{p.peerIp}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {waktuHandshake(p.lastHandshake)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="mr-2"
                      onClick={() => lihatScript.mutate(p.id)}
                    >
                      <Copy className="mr-1 size-3.5" /> Config
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mr-2"
                      disabled={tes.isPending}
                      onClick={() => tes.mutate(p.id)}
                    >
                      <Stethoscope className="mr-1 size-3.5" /> Tes
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => hapus.mutate(p.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mono-num truncate text-sm">{value}</p>
    </div>
  );
}
