import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Cpu,
  RefreshCw,
  Power,
  Save,
  Search,
  Wifi,
  Settings2,
  Globe,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  acsAddWan,
  acsDeleteWan,
  acsDevices,
  acsReboot,
  acsRefresh,
  acsSetWifi,
} from "@/lib/genieacs.functions";
import { readAcs, useAcs, writeAcs, type AcsCreds } from "@/lib/genieacs-store";
import type { AcsDevice } from "@/lib/genieacs-types";

export const Route = createFileRoute("/tr069")({
  head: () => ({
    meta: [
      { title: "TR-069 GenieACS — NAJWA_BILLING" },
      {
        name: "description",
        content:
          "Monitor semua ONU ZTE, Huawei, dan VSOL melalui GenieACS API serta ubah SSID dan password WiFi pelanggan dari satu panel.",
      },
      { property: "og:title", content: "TR-069 GenieACS — NAJWA_BILLING" },
      {
        property: "og:description",
        content: "Monitoring ONU dan pengaturan SSID/password WiFi via TR-069 GenieACS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Tr069Page,
});

function fmtUptime(s: number) {
  if (!s) return "-";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}h ${h}j` : h ? `${h}j ${m}m` : `${m}m`;
}

function Tr069Page() {
  const { creds, configured } = useAcs();
  const [form, setForm] = useState<AcsCreds | null>(null);
  const conf = form ?? creds;

  const [cari, setCari] = useState("");
  const [merek, setMerek] = useState("all");
  const [edit, setEdit] = useState<AcsDevice | null>(null);
  const [ssid, setSsid] = useState("");
  const [pass, setPass] = useState("");
  const [wlanIdx, setWlanIdx] = useState(0);
  const [wanDev, setWanDev] = useState<AcsDevice | null>(null);
  const [wan, setWan] = useState({
    parentPath: "",
    kind: "PPPoE" as "PPPoE" | "IP",
    name: "",
    username: "",
    password: "",
    vlan: "",
    addressingType: "DHCP",
    ip: "",
    netmask: "",
    gateway: "",
    dns: "",
  });

  const devices = useQuery({
    queryKey: ["acs-devices", creds.url],
    enabled: configured,
    refetchInterval: 30000,
    queryFn: () => acsDevices({ data: { creds: readAcs() } }),
  });

  const list = devices.data?.devices ?? [];
  const filtered = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return list.filter((d) => {
      if (merek !== "all" && d.vendor !== merek) return false;
      if (!q) return true;
      return [d.id, d.serial, d.model, d.ppp, d.ip, ...d.wlans.map((w) => w.ssid)]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [list, cari, merek]);

  const online = list.filter((d) => d.online).length;

  const simpanWifi = useMutation({
    mutationFn: async () => {
      if (!edit) return;
      const w = edit.wlans[wlanIdx];
      if (!w) throw new Error("WLAN tidak ditemukan pada perangkat ini");
      const values: Array<{ path: string; value: string }> = [];
      if (ssid.trim()) values.push({ path: w.ssidPath, value: ssid.trim() });
      if (pass.trim()) values.push({ path: w.passwordPath, value: pass.trim() });
      if (!values.length) throw new Error("Isi SSID atau password terlebih dahulu");
      const res = await acsSetWifi({ data: { creds: readAcs(), deviceId: edit.id, values } });
      if (!res.ok) throw new Error((res as { error?: string }).error ?? "Gagal mengirim tugas");
    },
    onSuccess: () => {
      toast.success("Perubahan WiFi dikirim ke ONU");
      setEdit(null);
      void devices.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const aksi = useMutation({
    mutationFn: async (p: { id: string; tipe: "refresh" | "reboot" }) => {
      const fn = p.tipe === "refresh" ? acsRefresh : acsReboot;
      const res = await fn({ data: { creds: readAcs(), deviceId: p.id } });
      if (!res.ok) throw new Error((res as { error?: string }).error ?? "Gagal");
      return p.tipe;
    },
    onSuccess: (tipe) => {
      toast.success(tipe === "refresh" ? "Data ONU diperbarui" : "Perintah reboot dikirim");
      void devices.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const simpanWan = useMutation({
    mutationFn: async () => {
      if (!wanDev) return;
      if (!wan.parentPath) throw new Error("Pilih tipe/slot WAN terlebih dahulu");
      if (wan.kind === "PPPoE" && !wan.username.trim())
        throw new Error("Username PPPoE wajib diisi");
      const res = await acsAddWan({
        data: { creds: readAcs(), deviceId: wanDev.id, wan },
      });
      if (!res.ok) throw new Error((res as { error?: string }).error ?? "Gagal menambah WAN");
    },
    onSuccess: () => {
      toast.success("WAN baru dikirim ke ONU");
      setWanDev(null);
      void devices.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hapusWan = useMutation({
    mutationFn: async (p: { deviceId: string; path: string }) => {
      const res = await acsDeleteWan({ data: { creds: readAcs(), ...p } });
      if (!res.ok) throw new Error((res as { error?: string }).error ?? "Gagal menghapus WAN");
    },
    onSuccess: () => {
      toast.success("WAN dihapus");
      void devices.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Kandidat path induk untuk WAN baru pada perangkat terpilih */
  function wanParents(d: AcsDevice) {
    const set = new Map<string, string>();
    for (const w of d.wans) set.set(w.parentPath, w.kind);
    if (!set.size) {
      set.set("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.", "PPPoE");
      set.set("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.", "IP");
    }
    return [...set.entries()].map(([path, kind]) => ({ path, kind: kind as "PPPoE" | "IP" }));
  }

  function bukaWan(d: AcsDevice) {
    const parents = wanParents(d);
    const first = parents[0]!;
    setWan({
      parentPath: first.path,
      kind: first.kind,
      name: "",
      username: "",
      password: "",
      vlan: "",
      addressingType: "DHCP",
      ip: "",
      netmask: "",
      gateway: "",
      dns: "",
    });
    setWanDev(d);
  }

  return (
    <div>
      <PageHeader
        title="TR-069 · GenieACS API"
        description="Monitor ONU ZTE, Huawei, dan VSOL serta ubah SSID/password WiFi pelanggan."
        action={
          <Button variant="outline" onClick={() => void devices.refetch()} disabled={!configured}>
            <RefreshCw className={`size-4 ${devices.isFetching ? "animate-spin" : ""}`} /> Muat ulang
          </Button>
        }
      />

      <section className="panel mb-6 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Settings2 className="size-4 text-primary" /> Koneksi GenieACS NBI
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Label>URL API</Label>
            <Input
              placeholder="http://192.168.1.10:7557"
              value={conf.url}
              onChange={(e) => setForm({ ...conf, url: e.target.value })}
            />
          </div>
          <div>
            <Label>Username</Label>
            <Input
              value={conf.username}
              onChange={(e) => setForm({ ...conf, username: e.target.value })}
            />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              type="password"
              value={conf.password}
              onChange={(e) => setForm({ ...conf, password: e.target.value })}
            />
          </div>
        </div>
        <Button
          className="mt-3"
          onClick={() => {
            writeAcs(conf);
            setForm(null);
            toast.success("Koneksi GenieACS disimpan");
          }}
        >
          <Save className="size-4" /> Simpan
        </Button>
      </section>

      {devices.data && !devices.data.ok && (
        <p className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {devices.data.error}
        </p>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Total ONU", value: list.length, icon: Cpu },
          { label: "Online", value: online, icon: Wifi },
          { label: "Offline", value: list.length - online, icon: Power },
        ].map((s) => (
          <div key={s.label} className="panel flex items-center gap-3 p-4">
            <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-primary">
              <s.icon className="size-4" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-lg font-semibold">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <section className="panel p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Cari serial, SSID, PPPoE, IP…"
              value={cari}
              onChange={(e) => setCari(e.target.value)}
            />
          </div>
          <Select value={merek} onValueChange={setMerek}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua merek</SelectItem>
              <SelectItem value="ZTE">ZTE</SelectItem>
              <SelectItem value="Huawei">Huawei</SelectItem>
              <SelectItem value="VSOL">VSOL</SelectItem>
              <SelectItem value="Lainnya">Lainnya</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-3">Serial / ID</th>
                <th className="py-2 pr-3">Merek</th>
                <th className="py-2 pr-3">Model</th>
                <th className="py-2 pr-3">SSID</th>
                <th className="py-2 pr-3">PPPoE / IP</th>
                <th className="py-2 pr-3">RX Power</th>
                <th className="py-2 pr-3">Uptime</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3 font-mono text-xs">{d.serial}</td>
                  <td className="py-2 pr-3">
                    <Badge variant="secondary">{d.vendor}</Badge>
                  </td>
                  <td className="py-2 pr-3">{d.model || "-"}</td>
                  <td className="py-2 pr-3">{d.wlans[0]?.ssid || "-"}</td>
                  <td className="py-2 pr-3">{d.ppp || d.ip || "-"}</td>
                  <td className="py-2 pr-3">{d.rxPower || "-"}</td>
                  <td className="py-2 pr-3">{fmtUptime(d.uptime)}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        d.online
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {d.online ? "Online" : "Offline"}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Ubah SSID / password"
                        onClick={() => {
                          setEdit(d);
                          setWlanIdx(0);
                          setSsid(d.wlans[0]?.ssid ?? "");
                          setPass("");
                        }}
                      >
                        <Wifi className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Refresh data"
                        onClick={() => aksi.mutate({ id: d.id, tipe: "refresh" })}
                      >
                        <RefreshCw className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Kelola / tambah WAN"
                        onClick={() => bukaWan(d)}
                      >
                        <Globe className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Reboot ONU"
                        onClick={() => aksi.mutate({ id: d.id, tipe: "reboot" })}
                      >
                        <Power className="size-4" />
                      </Button>

                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                    {configured
                      ? "Belum ada ONU yang terdaftar di GenieACS."
                      : "Isi URL GenieACS terlebih dahulu."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ubah WiFi — {edit?.serial}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>WLAN</Label>
              <Select
                value={String(wlanIdx)}
                onValueChange={(v) => {
                  const i = Number(v);
                  setWlanIdx(i);
                  setSsid(edit?.wlans[i]?.ssid ?? "");
                  setPass("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(edit?.wlans ?? []).map((w, i) => (
                    <SelectItem key={w.ssidPath} value={String(i)}>
                      WLAN {w.index} · {w.band} · {w.ssid || "(kosong)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>SSID baru</Label>
              <Input value={ssid} onChange={(e) => setSsid(e.target.value)} />
            </div>
            <div>
              <Label>Password baru</Label>
              <Input
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="Kosongkan bila tidak diubah"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Batal
            </Button>
            <Button onClick={() => simpanWifi.mutate()} disabled={simpanWifi.isPending}>
              <Save className="size-4" /> Simpan ke ONU
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!wanDev} onOpenChange={(o) => !o && setWanDev(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>WAN — {wanDev?.serial}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">WAN terpasang</p>
            {(wanDev?.wans ?? []).map((w) => (
              <div
                key={w.path}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {w.name} · {w.kind}
                    {w.vlan ? ` · VLAN ${w.vlan}` : ""}
                  </p>
                  <p className="truncate text-muted-foreground">
                    {w.username || w.ip || "-"} · {w.status || (w.enabled ? "Enabled" : "Disabled")}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  title="Hapus WAN"
                  onClick={() =>
                    wanDev && hapusWan.mutate({ deviceId: wanDev.id, path: w.path })
                  }
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
            {!wanDev?.wans.length && (
              <p className="text-xs text-muted-foreground">Belum ada WAN terbaca pada ONU ini.</p>
            )}
          </div>

          <div className="space-y-3 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground">Tambah WAN baru</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Tipe / Slot</Label>
                <Select
                  value={wan.parentPath}
                  onValueChange={(v) => {
                    const found = wanDev ? wanParents(wanDev).find((p) => p.path === v) : null;
                    setWan((s) => ({ ...s, parentPath: v, kind: found?.kind ?? s.kind }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih slot WAN" />
                  </SelectTrigger>
                  <SelectContent>
                    {(wanDev ? wanParents(wanDev) : []).map((p) => (
                      <SelectItem key={p.path} value={p.path}>
                        {p.kind} · {p.path.split(".").slice(-4, -1).join(".")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nama WAN</Label>
                <Input
                  value={wan.name}
                  onChange={(e) => setWan((s) => ({ ...s, name: e.target.value }))}
                  placeholder="WAN_INTERNET"
                />
              </div>
              <div>
                <Label>VLAN ID</Label>
                <Input
                  value={wan.vlan}
                  onChange={(e) => setWan((s) => ({ ...s, vlan: e.target.value }))}
                  placeholder="Kosongkan bila tanpa VLAN"
                />
              </div>
              {wan.kind === "PPPoE" ? (
                <>
                  <div>
                    <Label>Username PPPoE</Label>
                    <Input
                      value={wan.username}
                      onChange={(e) => setWan((s) => ({ ...s, username: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Password PPPoE</Label>
                    <Input
                      value={wan.password}
                      onChange={(e) => setWan((s) => ({ ...s, password: e.target.value }))}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <Label>Mode IP</Label>
                    <Select
                      value={wan.addressingType}
                      onValueChange={(v) => setWan((s) => ({ ...s, addressingType: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DHCP">DHCP</SelectItem>
                        <SelectItem value="Static">Static</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {wan.addressingType === "Static" && (
                    <>
                      <div>
                        <Label>IP Address</Label>
                        <Input
                          value={wan.ip}
                          onChange={(e) => setWan((s) => ({ ...s, ip: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label>Subnet Mask</Label>
                        <Input
                          value={wan.netmask}
                          onChange={(e) => setWan((s) => ({ ...s, netmask: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label>Gateway</Label>
                        <Input
                          value={wan.gateway}
                          onChange={(e) => setWan((s) => ({ ...s, gateway: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label>DNS</Label>
                        <Input
                          value={wan.dns}
                          onChange={(e) => setWan((s) => ({ ...s, dns: e.target.value }))}
                          placeholder="8.8.8.8,1.1.1.1"
                        />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setWanDev(null)}>
              Tutup
            </Button>
            <Button onClick={() => simpanWan.mutate()} disabled={simpanWan.isPending}>
              <Save className="size-4" /> Tambah WAN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
