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
  Users,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/Shared";
import { Tr069DeviceDialog } from "@/components/Tr069DeviceDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { acsDevices, acsReboot, acsRefresh } from "@/lib/genieacs.functions";
import { readAcs, useAcs, writeAcs, type AcsCreds } from "@/lib/genieacs-store";
import type { AcsDevice } from "@/lib/genieacs-types";

export const Route = createFileRoute("/tr069")({
  head: () => ({
    meta: [
      { title: "TR-069 GenieACS — NAJWA_BILLING" },
      {
        name: "description",
        content:
          "Kelola semua parameter TR-069 ONU ZTE, Huawei, dan VSOL: tambah WAN, atur VLAN, ganti SSID, dan pantau total user aktif dari satu panel.",
      },
      { property: "og:title", content: "TR-069 GenieACS — NAJWA_BILLING" },
      {
        property: "og:description",
        content:
          "Panel TR-069: add WAN, add VLAN, ganti SSID/password, host aktif, dan editor parameter lengkap.",
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
  const [detail, setDetail] = useState<{ device: AcsDevice; tab: string } | null>(null);

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
  const totalUsers = list.reduce((a, d) => a + d.totalUsers, 0);
  const totalWan = list.reduce((a, d) => a + d.wans.length, 0);

  // jaga agar dialog memakai data terbaru setelah refetch
  const detailDevice = detail
    ? (list.find((d) => d.id === detail.device.id) ?? detail.device)
    : null;

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

  return (
    <div>
      <PageHeader
        title="TR-069 · GenieACS API"
        description="Semua parameter ONU: add WAN, add VLAN, ganti SSID/password, user aktif, dan editor parameter."
        action={
          <Button variant="outline" onClick={() => void devices.refetch()} disabled={!configured}>
            <RefreshCw className={`size-4 ${devices.isFetching ? "animate-spin" : ""}`} /> Muat
            ulang
          </Button>
        }
      />

      <section className="panel mb-6 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Settings2 className="size-4 text-primary" /> Koneksi GenieACS NBI
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex min-w-0 flex-col gap-2 lg:col-span-2">
            <Label>URL API</Label>
            <Input
              placeholder="http://192.168.1.10:7557"
              value={conf.url}
              onChange={(e) => setForm({ ...conf, url: e.target.value })}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <Label>Username</Label>
            <Input
              value={conf.username}
              onChange={(e) => setForm({ ...conf, username: e.target.value })}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
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

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Total ONU", value: list.length, icon: Cpu },
          { label: "Online", value: online, icon: Wifi },
          { label: "Offline", value: list.length - online, icon: Power },
          { label: "Total user aktif", value: totalUsers, icon: Users },
          { label: "Total WAN", value: totalWan, icon: Globe },
        ].map((s) => (
          <div key={s.label} className="panel flex items-center gap-3 p-4">
            <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-primary">
              <s.icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">{s.label}</p>
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
                <th className="py-2 pr-3">VLAN</th>
                <th className="py-2 pr-3">User aktif</th>
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
                  <td className="py-2 pr-3">
                    {d.wans
                      .map((w) => w.vlan)
                      .filter(Boolean)
                      .join(", ") || "-"}
                  </td>
                  <td className="py-2 pr-3">{d.totalUsers}</td>
                  <td className="py-2 pr-3">{d.rxPower || "-"}</td>
                  <td className="py-2 pr-3">{fmtUptime(d.uptime)}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        d.online ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
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
                        title="Ubah SSID / password WiFi"
                        onClick={() => setDetail({ device: d, tab: "wifi" })}
                      >
                        <Wifi className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Kelola WAN & VLAN"
                        onClick={() => setDetail({ device: d, tab: "wan" })}
                      >
                        <Globe className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Semua parameter TR-069"
                        onClick={() => setDetail({ device: d, tab: "info" })}
                      >
                        <SlidersHorizontal className="size-4" />
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
                  <td colSpan={11} className="py-8 text-center text-sm text-muted-foreground">
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

      {detailDevice && (
        <Tr069DeviceDialog
          key={`${detailDevice.id}-${detail?.tab}`}
          device={detailDevice}
          defaultTab={detail?.tab ?? "info"}
          onClose={() => setDetail(null)}
          onChanged={() => void devices.refetch()}
        />
      )}
    </div>
  );
}
