import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Save, Search, Trash2, Plus, RotateCcw, Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  acsAddObject,
  acsAddWan,
  acsDeleteObject,
  acsDeleteWan,
  acsFactoryReset,
  acsParams,
  acsDiscover,
  acsSetParams,
  acsSetVlan,
} from "@/lib/genieacs.functions";
import { readAcs } from "@/lib/genieacs-store";
import type { AcsDevice } from "@/lib/genieacs-types";

function fmtUptime(s: number) {
  if (!s) return "-";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}h ${h}j` : h ? `${h}j ${m}m` : `${m}m`;
}

function fmtBytes(n: number) {
  if (!n) return "-";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i ? 1 : 0)} ${u[i]}`;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{value || "-"}</p>
    </div>
  );
}

type Props = {
  device: AcsDevice | null;
  defaultTab?: string;
  onClose: () => void;
  onChanged: () => void;
};

export function Tr069DeviceDialog({ device, defaultTab = "info", onClose, onChanged }: Props) {
  const [tab, setTab] = useState(defaultTab);
  const [wlanIdx, setWlanIdx] = useState(0);
  const [ssid, setSsid] = useState("");
  const [pass, setPass] = useState("");
  const [channel, setChannel] = useState("");
  const [broadcast, setBroadcast] = useState(true);
  const [wlanOn, setWlanOn] = useState(true);
  const [vlanWan, setVlanWan] = useState("");
  const [vlanId, setVlanId] = useState("");
  const [vlanPrio, setVlanPrio] = useState("");
  const [cariParam, setCariParam] = useState("");
  const [paramPath, setParamPath] = useState("");
  const [paramValue, setParamValue] = useState("");
  const [objectName, setObjectName] = useState("");
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

  const w = device?.wlans[wlanIdx];

  function pilihWlan(i: number) {
    setWlanIdx(i);
    const x = device?.wlans[i];
    setSsid(x?.ssid ?? "");
    setPass("");
    setChannel(x?.channel ?? "");
    setBroadcast(!x?.hidden);
    setWlanOn(x?.enabled ?? true);
  }

  const params = useQuery({
    queryKey: ["acs-params", device?.id],
    enabled: !!device && tab === "param",
    queryFn: () => acsParams({ data: { creds: readAcs(), deviceId: device!.id } }),
  });

  const paramList = useMemo(() => {
    const q = cariParam.trim().toLowerCase();
    const all = params.data?.params ?? [];
    const f = q ? all.filter((p) => p.path.toLowerCase().includes(q)) : all;
    return f.slice(0, 2000);
  }, [params.data, cariParam]);

  function wanParents(d: AcsDevice) {
    const set = new Map<string, string>();
    for (const x of d.wans) set.set(x.parentPath, x.kind);
    if (!set.size) {
      set.set("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.", "PPPoE");
      set.set("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.", "IP");
    }
    return [...set.entries()].map(([path, kind]) => ({ path, kind: kind as "PPPoE" | "IP" }));
  }

  const parents = device ? wanParents(device) : [];

  function guard<T>(fn: (v: T) => Promise<{ ok: boolean; error?: string }>) {
    return async (v: T) => {
      const res = await fn(v);
      if (!res.ok) throw new Error(res.error ?? "Gagal mengirim tugas ke ONU");
    };
  }

  const opts = {
    onSuccess: () => {
      toast.success("Perintah dikirim ke ONU");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  };

  const simpanWifi = useMutation({
    mutationFn: guard(async () => {
      if (!device || !w) throw new Error("WLAN tidak ditemukan pada perangkat ini");
      const values: Array<{ path: string; value: string; type?: string }> = [];
      if (ssid.trim() && ssid.trim() !== w.ssid)
        values.push({ path: w.ssidPath, value: ssid.trim() });
      if (pass.trim()) values.push({ path: w.passwordPath, value: pass.trim() });
      if (channel.trim() && channel.trim() !== w.channel)
        values.push({ path: w.channelPath, value: channel.trim(), type: "xsd:unsignedInt" });
      if (broadcast === w.hidden)
        values.push({
          path: w.hiddenPath,
          value: broadcast ? "true" : "false",
          type: "xsd:boolean",
        });
      if (wlanOn !== w.enabled)
        values.push({ path: w.enablePath, value: wlanOn ? "true" : "false", type: "xsd:boolean" });
      if (!values.length) throw new Error("Tidak ada perubahan untuk dikirim");
      return acsSetParams({ data: { creds: readAcs(), deviceId: device.id, values } });
    }),
    ...opts,
  });

  const tambahWan = useMutation({
    mutationFn: guard(async () => {
      if (!device) throw new Error("Perangkat tidak dipilih");
      if (!wan.parentPath) throw new Error("Pilih tipe/slot WAN terlebih dahulu");
      if (wan.kind === "PPPoE" && !wan.username.trim())
        throw new Error("Username PPPoE wajib diisi");
      return acsAddWan({ data: { creds: readAcs(), deviceId: device.id, wan } });
    }),
    ...opts,
  });

  const hapusWan = useMutation({
    mutationFn: guard((path: string) =>
      acsDeleteWan({ data: { creds: readAcs(), deviceId: device!.id, path } }),
    ),
    ...opts,
  });

  const simpanVlan = useMutation({
    mutationFn: guard(async () => {
      if (!device) throw new Error("Perangkat tidak dipilih");
      if (!vlanWan) throw new Error("Pilih WAN tujuan VLAN");
      if (!vlanId.trim()) throw new Error("VLAN ID wajib diisi");
      const target = device.wans.find((x) => x.path === vlanWan);
      return acsSetVlan({
        data: {
          creds: readAcs(),
          deviceId: device.id,
          input: {
            wanPath: vlanWan,
            vlan: vlanId.trim(),
            priority: vlanPrio.trim(),
            ...(target?.vlan ? { vlanPath: target.vlanPath } : {}),
          },
        },
      });
    }),
    ...opts,
  });

  const simpanParam = useMutation({
    mutationFn: guard(async () => {
      if (!paramPath.trim()) throw new Error("Path parameter wajib diisi");
      return acsSetParams({
        data: {
          creds: readAcs(),
          deviceId: device!.id,
          values: [{ path: paramPath.trim(), value: paramValue }],
        },
      });
    }),
    onSuccess: () => {
      toast.success("Parameter dikirim ke ONU");
      void params.refetch();
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const objAdd = useMutation({
    mutationFn: guard(() =>
      acsAddObject({ data: { creds: readAcs(), deviceId: device!.id, objectName } }),
    ),
    ...opts,
  });

  const objDel = useMutation({
    mutationFn: guard(() =>
      acsDeleteObject({ data: { creds: readAcs(), deviceId: device!.id, objectName } }),
    ),
    ...opts,
  });

  const reset = useMutation({
    mutationFn: guard(() => acsFactoryReset({ data: { creds: readAcs(), deviceId: device!.id } })),
    ...opts,
  });

  return (
    <Dialog
      open={!!device}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {device?.serial}
            <Badge variant="secondary">{device?.vendor}</Badge>
            <Badge variant={device?.online ? "default" : "outline"}>
              {device?.online ? "Online" : "Offline"}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Semua parameter TR-069 perangkat: informasi, WiFi, WAN, VLAN, user aktif, dan parameter
            mentah.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex w-full flex-wrap">
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="wifi">WiFi / SSID</TabsTrigger>
            <TabsTrigger value="wan">WAN</TabsTrigger>
            <TabsTrigger value="vlan">VLAN</TabsTrigger>
            <TabsTrigger value="user">User aktif</TabsTrigger>
            <TabsTrigger value="param">Parameter</TabsTrigger>
          </TabsList>

          {/* ---------------- INFO ---------------- */}
          <TabsContent value="info" className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Device ID" value={device?.id ?? ""} />
              <Field label="Serial" value={device?.serial ?? ""} />
              <Field label="Manufacturer" value={device?.manufacturer ?? ""} />
              <Field label="Model / Product class" value={device?.model ?? ""} />
              <Field label="Firmware" value={device?.firmware ?? ""} />
              <Field label="Hardware" value={device?.hardware ?? ""} />
              <Field label="MAC" value={device?.mac ?? ""} />
              <Field label="IP WAN" value={device?.ip ?? ""} />
              <Field label="IP LAN" value={device?.lanIp ?? ""} />
              <Field label="PPPoE user" value={device?.ppp ?? ""} />
              <Field label="Status PPPoE" value={device?.pppStatus ?? ""} />
              <Field label="Uptime" value={fmtUptime(device?.uptime ?? 0)} />
              <Field label="RX Power" value={device?.rxPower ?? ""} />
              <Field label="TX Power" value={device?.txPower ?? ""} />
              <Field label="Suhu" value={device?.temperature ?? ""} />
              <Field label="CPU" value={device?.cpuUsage ? `${device.cpuUsage}%` : ""} />
              <Field
                label="Memori bebas / total"
                value={device?.memoryTotal ? `${device.memoryFree} / ${device.memoryTotal} KB` : ""}
              />
              <Field label="PON mode" value={device?.ponMode ?? ""} />
              <Field label="Registration state" value={device?.registrationState ?? ""} />
              <Field label="Last inform" value={device?.lastInform ?? ""} />
              <Field label="Total user aktif" value={String(device?.totalUsers ?? 0)} />
              <Field label="Klien WiFi" value={String(device?.wifiClients ?? 0)} />
              <Field label="Host LAN aktif" value={String(device?.hostsActive ?? 0)} />
              <Field label="Tags" value={(device?.tags ?? []).join(", ")} />
            </div>

            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">Objek TR-069 (manual)</p>
              <Input
                value={objectName}
                onChange={(e) => setObjectName(e.target.value)}
                placeholder="InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => objAdd.mutate(undefined as never)}
                  disabled={!objectName || objAdd.isPending}
                >
                  <Plus className="size-4" /> addObject
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => objDel.mutate(undefined as never)}
                  disabled={!objectName || objDel.isPending}
                >
                  <Trash2 className="size-4" /> deleteObject
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => reset.mutate(undefined as never)}
                  disabled={reset.isPending}
                >
                  <RotateCcw className="size-4" /> Factory reset
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ---------------- WIFI ---------------- */}
          <TabsContent value="wifi" className="space-y-3">
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-secondary/50 text-left uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">WLAN</th>
                    <th className="px-3 py-2">SSID</th>
                    <th className="px-3 py-2">Band</th>
                    <th className="px-3 py-2">Kanal</th>
                    <th className="px-3 py-2">Keamanan</th>
                    <th className="px-3 py-2">BSSID</th>
                    <th className="px-3 py-2">Klien</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(device?.wlans ?? []).map((x, i) => (
                    <tr
                      key={x.ssidPath}
                      className="cursor-pointer border-t border-border/60 hover:bg-secondary/40"
                      onClick={() => pilihWlan(i)}
                    >
                      <td className="px-3 py-2">{x.index}</td>
                      <td className="px-3 py-2">{x.ssid || "-"}</td>
                      <td className="px-3 py-2">{x.band}</td>
                      <td className="px-3 py-2">{x.channel || "-"}</td>
                      <td className="px-3 py-2">{x.security || "-"}</td>
                      <td className="px-3 py-2 font-mono">{x.bssid || "-"}</td>
                      <td className="px-3 py-2">{x.clients}</td>
                      <td className="px-3 py-2">{x.enabled ? "Aktif" : "Mati"}</td>
                    </tr>
                  ))}
                  {!device?.wlans.length && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                        Belum ada WLAN terbaca.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Ubah WLAN {w ? `${w.index} · ${w.band}` : ""}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-2">
                  <Label>Pilih WLAN</Label>
                  <Select value={String(wlanIdx)} onValueChange={(v) => pilihWlan(Number(v))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih WLAN" />
                    </SelectTrigger>
                    <SelectContent>
                      {(device?.wlans ?? []).map((x, i) => (
                        <SelectItem key={x.ssidPath} value={String(i)}>
                          WLAN {x.index} · {x.band} · {x.ssid || "(kosong)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <Label>SSID</Label>
                  <Input value={ssid} onChange={(e) => setSsid(e.target.value)} />
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <Label>Password WiFi</Label>
                  <Input
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    placeholder="Kosongkan bila tidak diubah"
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <Label>Kanal (0 = auto)</Label>
                  <Input value={channel} onChange={(e) => setChannel(e.target.value)} />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <span className="text-sm">Siarkan SSID</span>
                  <Switch checked={broadcast} onCheckedChange={setBroadcast} />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <span className="text-sm">WLAN aktif</span>
                  <Switch checked={wlanOn} onCheckedChange={setWlanOn} />
                </div>
              </div>
              <Button
                onClick={() => simpanWifi.mutate(undefined as never)}
                disabled={simpanWifi.isPending}
              >
                <Save className="size-4" /> Simpan ke ONU
              </Button>
            </div>
          </TabsContent>

          {/* ---------------- WAN ---------------- */}
          <TabsContent value="wan" className="space-y-3">
            <div className="space-y-2">
              {(device?.wans ?? []).map((x) => (
                <div key={x.path} className="rounded-lg border border-border p-3 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {x.name} · {x.kind}
                        {x.vlan ? ` · VLAN ${x.vlan}` : ""}
                      </p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {x.path}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Hapus WAN"
                      onClick={() => hapusWan.mutate(x.path)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <Field
                      label="Status"
                      value={x.status || (x.enabled ? "Enabled" : "Disabled")}
                    />
                    <Field label="Username" value={x.username} />
                    <Field label="IP" value={x.ip} />
                    <Field label="Netmask" value={x.netmask} />
                    <Field label="Gateway" value={x.gateway} />
                    <Field label="DNS" value={x.dns} />
                    <Field label="NAT" value={x.natEnabled ? "Aktif" : "Mati"} />
                    <Field label="Uptime" value={fmtUptime(x.uptime)} />
                    <Field label="MAC" value={x.macAddress} />
                    <Field
                      label="Tx / Rx"
                      value={`${fmtBytes(x.bytesSent)} / ${fmtBytes(x.bytesReceived)}`}
                    />
                    <Field label="Tipe koneksi" value={x.connectionType} />
                    <Field label="Slot" value={x.index} />
                  </div>
                </div>
              ))}
              {!device?.wans.length && (
                <p className="text-xs text-muted-foreground">Belum ada WAN terbaca pada ONU ini.</p>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">Tambah WAN baru</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-2">
                  <Label>Tipe / Slot</Label>
                  <Select
                    value={wan.parentPath}
                    onValueChange={(v) => {
                      const found = parents.find((p) => p.path === v);
                      setWan((s) => ({ ...s, parentPath: v, kind: found?.kind ?? s.kind }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih slot WAN" />
                    </SelectTrigger>
                    <SelectContent>
                      {parents.map((p) => (
                        <SelectItem key={p.path} value={p.path}>
                          {p.kind} · {p.path.split(".").slice(-4, -1).join(".")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <Label>Nama WAN</Label>
                  <Input
                    value={wan.name}
                    onChange={(e) => setWan((s) => ({ ...s, name: e.target.value }))}
                    placeholder="WAN_INTERNET"
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <Label>VLAN ID</Label>
                  <Input
                    value={wan.vlan}
                    onChange={(e) => setWan((s) => ({ ...s, vlan: e.target.value }))}
                    placeholder="Kosongkan bila tanpa VLAN"
                  />
                </div>
                {wan.kind === "PPPoE" ? (
                  <>
                    <div className="flex min-w-0 flex-col gap-2">
                      <Label>Username PPPoE</Label>
                      <Input
                        value={wan.username}
                        onChange={(e) => setWan((s) => ({ ...s, username: e.target.value }))}
                      />
                    </div>
                    <div className="flex min-w-0 flex-col gap-2">
                      <Label>Password PPPoE</Label>
                      <Input
                        value={wan.password}
                        onChange={(e) => setWan((s) => ({ ...s, password: e.target.value }))}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex min-w-0 flex-col gap-2">
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
                        <div className="flex min-w-0 flex-col gap-2">
                          <Label>IP Address</Label>
                          <Input
                            value={wan.ip}
                            onChange={(e) => setWan((s) => ({ ...s, ip: e.target.value }))}
                          />
                        </div>
                        <div className="flex min-w-0 flex-col gap-2">
                          <Label>Subnet Mask</Label>
                          <Input
                            value={wan.netmask}
                            onChange={(e) => setWan((s) => ({ ...s, netmask: e.target.value }))}
                          />
                        </div>
                        <div className="flex min-w-0 flex-col gap-2">
                          <Label>Gateway</Label>
                          <Input
                            value={wan.gateway}
                            onChange={(e) => setWan((s) => ({ ...s, gateway: e.target.value }))}
                          />
                        </div>
                        <div className="flex min-w-0 flex-col gap-2">
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
              <Button
                onClick={() => tambahWan.mutate(undefined as never)}
                disabled={tambahWan.isPending}
              >
                <Plus className="size-4" /> Tambah WAN
              </Button>
            </div>
          </TabsContent>

          {/* ---------------- VLAN ---------------- */}
          <TabsContent value="vlan" className="space-y-3">
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-secondary/50 text-left uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">VLAN ID</th>
                    <th className="px-3 py-2">Lingkup</th>
                    <th className="px-3 py-2">Parameter</th>
                  </tr>
                </thead>
                <tbody>
                  {(device?.vlans ?? []).map((v) => (
                    <tr key={v.path} className="border-t border-border/60">
                      <td className="px-3 py-2 font-medium">{v.value}</td>
                      <td className="px-3 py-2">{v.scope}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                        {v.path}
                      </td>
                    </tr>
                  ))}
                  {!device?.vlans.length && (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                        Belum ada VLAN terbaca pada ONU ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Tambah / ubah VLAN pada WAN
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex min-w-0 flex-col gap-2">
                  <Label>WAN tujuan</Label>
                  <Select value={vlanWan} onValueChange={setVlanWan}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih WAN" />
                    </SelectTrigger>
                    <SelectContent>
                      {(device?.wans ?? []).map((x) => (
                        <SelectItem key={x.path} value={x.path}>
                          {x.name} · {x.kind}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <Label>VLAN ID</Label>
                  <Input
                    value={vlanId}
                    onChange={(e) => setVlanId(e.target.value)}
                    placeholder="100"
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <Label>Prioritas (802.1p)</Label>
                  <Input
                    value={vlanPrio}
                    onChange={(e) => setVlanPrio(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
              <Button
                onClick={() => simpanVlan.mutate(undefined as never)}
                disabled={simpanVlan.isPending}
              >
                <Save className="size-4" /> Terapkan VLAN
              </Button>
            </div>
          </TabsContent>

          {/* ---------------- USER AKTIF ---------------- */}
          <TabsContent value="user" className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label="Total user aktif" value={String(device?.totalUsers ?? 0)} />
              <Field label="Klien WiFi" value={String(device?.wifiClients ?? 0)} />
              <Field label="Host LAN aktif" value={String(device?.hostsActive ?? 0)} />
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-secondary/50 text-left uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Nama host</th>
                    <th className="px-3 py-2">IP</th>
                    <th className="px-3 py-2">MAC</th>
                    <th className="px-3 py-2">Interface</th>
                    <th className="px-3 py-2">Lease</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(device?.hosts ?? []).map((h) => (
                    <tr key={`${h.mac}-${h.ip}`} className="border-t border-border/60">
                      <td className="px-3 py-2">{h.name}</td>
                      <td className="px-3 py-2 font-mono">{h.ip || "-"}</td>
                      <td className="px-3 py-2 font-mono">{h.mac || "-"}</td>
                      <td className="px-3 py-2">{h.iface || "-"}</td>
                      <td className="px-3 py-2">{h.lease || "-"}</td>
                      <td className="px-3 py-2">{h.active ? "Aktif" : "Tidak aktif"}</td>
                    </tr>
                  ))}
                  {!device?.hosts.length && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                        Belum ada data host. Jalankan Refresh pada ONU terlebih dahulu.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ---------------- PARAMETER ---------------- */}
          <TabsContent value="param" className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Cari parameter, mis. SSID, VLAN, PPP, Hosts…"
                value={cariParam}
                onChange={(e) => setCariParam(e.target.value)}
              />
            </div>
            <div className="max-h-72 overflow-auto rounded-lg border border-border">
              <table className="w-full text-[11px]">
                <tbody>
                  {paramList.map((p) => (
                    <tr
                      key={p.path}
                      className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-secondary/40"
                      onClick={() => {
                        setParamPath(p.path);
                        setParamValue(p.value);
                      }}
                    >
                      <td className="px-3 py-1.5 font-mono">{p.path}</td>
                      <td className="px-3 py-1.5 text-right font-medium">{p.value || "-"}</td>
                    </tr>
                  ))}
                  {!paramList.length && (
                    <tr>
                      <td className="px-3 py-6 text-center text-muted-foreground">
                        {params.isFetching ? "Memuat parameter…" : "Tidak ada parameter."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-2">
                <Label>Path parameter</Label>
                <Input value={paramPath} onChange={(e) => setParamPath(e.target.value)} />
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <Label>Nilai baru</Label>
                <Input value={paramValue} onChange={(e) => setParamValue(e.target.value)} />
              </div>
            </div>
            <Button
              onClick={() => simpanParam.mutate(undefined as never)}
              disabled={simpanParam.isPending}
            >
              <Save className="size-4" /> Kirim parameter
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
