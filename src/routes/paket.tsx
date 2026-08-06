import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { radiusDeletePlan, radiusSavePlan } from "@/lib/radius.functions";
import { useRadiusMutation, useRadiusPlans } from "@/lib/radius-client";
import type { RadiusPlan } from "@/lib/radius-types";
import { formatDuration, formatIDR } from "@/lib/mikrotik-types";
import { pushPlanToAllRouters, useHybrid } from "@/lib/hybrid";
import { useCreds } from "@/lib/router-store";

export const Route = createFileRoute("/paket")({
  head: () => ({
    meta: [
      { title: "Paket Bandwidth — NAJWA_BILLING" },
      {
        name: "description",
        content:
          "Kelola paket hotspot dan PPPoE: bandwidth, masa aktif, shared users, harga modal dan harga jual.",
      },
      { property: "og:title", content: "Paket Bandwidth — NAJWA_BILLING" },
      {
        property: "og:description",
        content: "Tambah, ubah, dan hapus paket billing RADIUS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaketPage,
});

function PaketPage() {
  const plans = useRadiusPlans();
  const { hybrid } = useHybrid();
  const { creds } = useCreds();
  const savePlan = useRadiusMutation((p: RadiusPlan) => radiusSavePlan({ data: p }));
  const delPlan = useRadiusMutation((name: string) => radiusDeletePlan({ data: { name } }));

  const syncPlan = async (plan: RadiusPlan) => {
    if (!creds.host?.trim()) {
      toast.error("Alamat router MikroTik belum diatur di Pengaturan");
      return;
    }
    const res = await pushPlanToAllRouters(creds, plan);
    if (res.ok) toast.success(`Profile "${plan.name}" tersinkron ke MikroTik`);
    else toast.error(`Sinkron MikroTik gagal: ${res.errors[0] ?? "tidak diketahui"}`);
  };

  const [pName, setPName] = useState("");
  const [pPrice, setPPrice] = useState("");
  const [pCost, setPCost] = useState("");
  const [pRate, setPRate] = useState("2M/2M");
  const [pDays, setPDays] = useState("1");
  const [pUnit, setPUnit] = useState<"menit" | "jam" | "hari" | "bulan">("hari");
  const [pShared, setPShared] = useState("1");
  const [pService, setPService] = useState<"hotspot" | "pppoe">("hotspot");
  const [pIntegrate, setPIntegrate] = useState(true);
  const [pPortal, setPPortal] = useState(false);

  return (
    <>
      <PageHeader
        title="Paket"
        description="Paket bandwidth & masa aktif untuk hotspot dan PPPoE."
        action={
          <Button variant="outline" onClick={() => plans.refetch()}>
            <RefreshCw className="size-4" /> Muat Ulang
          </Button>
        }
      />

      <div className="space-y-6">
        <div className="panel p-5">
          <h2 className="mb-4 text-sm font-semibold">Tambah / Ubah Paket</h2>
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <div className="grid gap-2">
              <Label htmlFor="p-n">Nama Paket</Label>
              <Input id="p-n" value={pName} onChange={(e) => setPName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-m">Harga Modal (Rp)</Label>
              <Input
                id="p-m"
                inputMode="numeric"
                value={pCost}
                onChange={(e) => setPCost(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-h">Harga Jual (Rp)</Label>
              <Input
                id="p-h"
                inputMode="numeric"
                value={pPrice}
                onChange={(e) => setPPrice(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-r">Bandwidth</Label>
              <Input
                id="p-r"
                placeholder="2M/2M"
                value={pRate}
                onChange={(e) => setPRate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-d">Masa Aktif</Label>
              <div className="flex gap-2">
                <Input
                  id="p-d"
                  inputMode="decimal"
                  value={pDays}
                  onChange={(e) => setPDays(e.target.value)}
                />
                <Select value={pUnit} onValueChange={(v) => setPUnit(v as typeof pUnit)}>
                  <SelectTrigger className="w-28" aria-label="Satuan masa aktif">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="menit">Menit</SelectItem>
                    <SelectItem value="jam">Jam</SelectItem>
                    <SelectItem value="hari">Hari</SelectItem>
                    <SelectItem value="bulan">Bulan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-s">Shared Users</Label>
              <Input
                id="p-s"
                inputMode="numeric"
                value={pShared}
                onChange={(e) => setPShared(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Layanan</Label>
              <Select value={pService} onValueChange={(v) => setPService(v as "hotspot" | "pppoe")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hotspot">Hotspot</SelectItem>
                  <SelectItem value="pppoe">PPPoE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 md:col-span-3 xl:col-span-6">
              <Label htmlFor="p-int">Integrasi MikroTik</Label>
              <div className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2">
                <Switch id="p-int" checked={pIntegrate} onCheckedChange={setPIntegrate} />
                <span className="text-xs text-muted-foreground">
                  {pIntegrate
                    ? "Paket juga dibuat sebagai profile di router MikroTik saat disimpan."
                    : "Paket hanya disimpan di RADIUS, tidak dikirim ke router."}
                  {pIntegrate && !hybrid.enabled
                    ? " (Mode hybrid belum aktif di Pengaturan — profile dikirim tetap saat disimpan.)"
                    : ""}
                </span>
              </div>
            </div>
            <div className="grid gap-2 md:col-span-3 xl:col-span-6">
              <Label htmlFor="p-portal">Tampilkan di Portal Pelanggan</Label>
              <div className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2">
                <Switch id="p-portal" checked={pPortal} onCheckedChange={setPPortal} />
                <span className="text-xs text-muted-foreground">
                  {pPortal
                    ? "Paket ini bisa dibeli pelanggan di halaman /portal dan voucher dibuat otomatis setelah pembayaran."
                    : "Paket hanya untuk admin, tidak tampil di portal pelanggan."}
                </span>
              </div>
            </div>
            <div className="flex items-end xl:col-span-6">
              <Button
                disabled={!pName.trim() || savePlan.isPending}
                onClick={() => {
                  const plan: RadiusPlan = {
                    name: pName.trim(),
                    price: Number(pPrice) || 0,
                    cost_price: Number(pCost) || 0,
                    rate_limit: pRate.trim(),
                    validity_seconds: Math.round(
                      (Number(pDays) || 0) *
                        (pUnit === "menit"
                          ? 60
                          : pUnit === "jam"
                            ? 3600
                            : pUnit === "bulan"
                              ? 2592000
                              : 86400),
                    ),
                    shared_users: Number(pShared) || 1,
                    service: pService,
                    portal: pPortal ? 1 : 0,
                  };
                  savePlan.mutate(plan, {
                    onSuccess: () => {
                      toast.success("Paket disimpan");
                      setPName("");
                      if (pIntegrate) void syncPlan(plan);
                    },
                    onError: (e: Error) => toast.error(e.message),
                  });
                }}
              >
                <Plus className="size-4" /> Simpan Paket
              </Button>
            </div>
          </div>
        </div>

        <div className="panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Layanan</TableHead>
                <TableHead>Bandwidth</TableHead>
                <TableHead>Masa Aktif</TableHead>
                <TableHead>Shared</TableHead>
                <TableHead>Harga Modal</TableHead>
                <TableHead>Harga Jual</TableHead>
                <TableHead>Portal</TableHead>
                <TableHead className="w-24 text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(plans.data ?? []).map((p) => (
                <TableRow key={p.name}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-xs uppercase">{p.service}</TableCell>
                  <TableCell className="mono-num">{p.rate_limit || "-"}</TableCell>
                  <TableCell className="mono-num">{formatDuration(p.validity_seconds)}</TableCell>
                  <TableCell className="mono-num">{p.shared_users}</TableCell>
                  <TableCell className="mono-num">{formatIDR(p.cost_price ?? 0)}</TableCell>
                  <TableCell className="mono-num">{formatIDR(p.price)}</TableCell>
                  <TableCell>
                    <Switch
                      checked={!!p.portal}
                      aria-label={`Tampilkan paket ${p.name} di portal pelanggan`}
                      onCheckedChange={(v) =>
                        savePlan.mutate(
                          { ...p, portal: v ? 1 : 0 },
                          {
                            onSuccess: () =>
                              toast.success(
                                v
                                  ? `Paket "${p.name}" tampil di portal pelanggan`
                                  : `Paket "${p.name}" disembunyikan dari portal`,
                              ),
                            onError: (e: Error) => toast.error(e.message),
                          },
                        )
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Integrasikan paket ${p.name} ke MikroTik`}
                      title="Kirim ke MikroTik sebagai profile"
                      onClick={() => void syncPlan(p)}
                    >
                      <UploadCloud className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Hapus paket ${p.name}`}
                      onClick={() => delPlan.mutate(p.name)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(plans.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    Belum ada paket.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
