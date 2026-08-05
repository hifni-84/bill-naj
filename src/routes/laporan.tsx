import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis } from "recharts";

import { PageHeader } from "@/components/Shared";
import { Button } from "@/components/ui/button";
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
import { formatIDR } from "@/lib/mikrotik-types";
import { useRadiusReport } from "@/lib/radius-client";

export const Route = createFileRoute("/laporan")({
  head: () => ({
    meta: [
      { title: "Laporan Pendapatan — NAJWA_BILLING" },
      {
        name: "description",
        content:
          "Laporan penjualan voucher hotspot: pendapatan harian, rekap per paket, dan ekspor CSV.",
      },
      { property: "og:title", content: "Laporan Pendapatan — NAJWA_BILLING" },
      {
        property: "og:description",
        content: "Rekap omzet voucher hotspot harian dan per paket, lengkap dengan ekspor CSV.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LaporanPage,
});

function LaporanPage() {
  const report = useRadiusReport();
  const [range, setRange] = useState("30");

  const view = useMemo(() => {
    const limit = Number(range);
    const daily = report.data?.daily ?? [];
    const since =
      limit === 0 ? "" : new Date(Date.now() - limit * 86400000).toISOString().slice(0, 10);
    const filtered = daily.filter((d) => limit === 0 || d.date >= since);

    return {
      rows: [...filtered].sort((a, b) => b.date.localeCompare(a.date)),
      chart: [...filtered]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({ date: d.date.slice(5), total: d.total })),
      perPlan: report.data?.perPlan ?? [],
      total: filtered.reduce((s, d) => s + d.total, 0),
      count: filtered.reduce((s, d) => s + d.count, 0),
      unsold: report.data?.unsold ?? 0,
    };
  }, [report.data, range]);

  const exportCsv = () => {
    const lines = ["tanggal,jumlah_voucher,pendapatan"];
    for (const d of view.rows) lines.push(`${d.date},${d.count},${d.total}`);
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-hotspot-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Laporan Pendapatan"
        description="Sumber data sama dengan menu Pendapatan (harga modal voucher)."
        action={
          <div className="flex flex-wrap gap-2">
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 hari</SelectItem>
                <SelectItem value="30">30 hari</SelectItem>
                <SelectItem value="90">90 hari</SelectItem>
                <SelectItem value="0">Semua</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => report.refetch()}>
              <RefreshCw className="size-4" /> Muat Ulang
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={view.rows.length === 0}>
              <Download className="size-4" /> CSV
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="panel p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Total Omzet</p>
          <p className="mono-num mt-2 text-2xl font-semibold text-primary">
            {formatIDR(view.total)}
          </p>
        </div>
        <div className="panel p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Voucher Terjual
          </p>
          <p className="mono-num mt-2 text-2xl font-semibold">{view.count}</p>
        </div>
        <div className="panel p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Stok Tersisa</p>
          <p className="mono-num mt-2 text-2xl font-semibold">{view.unsold}</p>
        </div>
      </div>

      <div className="panel mt-6 p-5">
        <h2 className="text-sm font-semibold">Grafik Pendapatan Harian</h2>
        <div className="mt-4 h-64">
          {view.chart.length === 0 ? (
            <p className="pt-16 text-center text-sm text-muted-foreground">Belum ada data.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={view.chart}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} width={70} />
                <ReTooltip
                  cursor={{ fill: "var(--color-secondary)" }}
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    color: "var(--color-foreground)",
                  }}
                  formatter={(v: number) => formatIDR(v)}
                />
                <Bar dataKey="total" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="panel overflow-hidden">
          <h2 className="border-b border-border p-4 text-sm font-semibold">Rincian Harian</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Voucher</TableHead>
                <TableHead className="text-right">Pendapatan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.rows.map((d) => (
                <TableRow key={d.date}>
                  <TableCell className="mono-num">{d.date}</TableCell>
                  <TableCell className="mono-num">{d.count}</TableCell>
                  <TableCell className="mono-num text-right">{formatIDR(d.total)}</TableCell>
                </TableRow>
              ))}
              {view.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    Belum ada penjualan pada periode ini.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="panel overflow-hidden">
          <h2 className="border-b border-border p-4 text-sm font-semibold">Per Paket</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paket</TableHead>
                <TableHead>Terjual</TableHead>
                <TableHead className="text-right">Pendapatan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.perPlan.map((p) => (
                <TableRow key={p.plan}>
                  <TableCell className="truncate">{p.plan}</TableCell>
                  <TableCell className="mono-num">{p.count}</TableCell>
                  <TableCell className="mono-num text-right">{formatIDR(p.total)}</TableCell>
                </TableRow>
              ))}
              {view.perPlan.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    Belum ada data paket.
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
