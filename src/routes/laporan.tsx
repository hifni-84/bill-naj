import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis } from "recharts";

import { NotConfigured, PageHeader } from "@/components/Shared";
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
import { useUsers } from "@/lib/hotspot";
import { formatIDR, isUsed, parseVoucherComment } from "@/lib/mikrotik-types";
import { useCreds } from "@/lib/router-store";

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
    ],
  }),
  component: LaporanPage,
});

function LaporanPage() {
  const { creds, configured, ready } = useCreds();
  const users = useUsers(creds, configured);
  const [range, setRange] = useState("30");

  const report = useMemo(() => {
    const limit = Number(range);
    const since = new Date(Date.now() - limit * 86400000).toISOString().slice(0, 10);

    const sold = (users.data ?? []).filter((u) => {
      const meta = parseVoucherComment(u.comment);
      return meta && isUsed(u) && (limit === 0 || meta.date >= since);
    });

    const daily = new Map<string, { total: number; count: number }>();
    const perProfile = new Map<string, { total: number; count: number }>();

    for (const u of sold) {
      const meta = parseVoucherComment(u.comment)!;
      const d = daily.get(meta.date) ?? { total: 0, count: 0 };
      daily.set(meta.date, { total: d.total + meta.price, count: d.count + 1 });
      const key = u.profile ?? "default";
      const p = perProfile.get(key) ?? { total: 0, count: 0 };
      perProfile.set(key, { total: p.total + meta.price, count: p.count + 1 });
    }

    const rows = [...daily.entries()].sort(([a], [b]) => b.localeCompare(a));
    const chart = [...daily.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date: date.slice(5), total: v.total }));

    return {
      rows,
      chart,
      perProfile: [...perProfile.entries()].sort((a, b) => b[1].total - a[1].total),
      total: sold.reduce((s, u) => s + (parseVoucherComment(u.comment)?.price ?? 0), 0),
      count: sold.length,
      unsold: (users.data ?? []).filter((u) => parseVoucherComment(u.comment) && !isUsed(u)).length,
    };
  }, [users.data, range]);

  const exportCsv = () => {
    const lines = ["tanggal,jumlah_voucher,pendapatan"];
    for (const [date, v] of report.rows) lines.push(`${date},${v.count},${v.total}`);
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-hotspot-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (ready && !configured) {
    return (
      <>
        <PageHeader title="Laporan Pendapatan" description="Rekap penjualan voucher." />
        <NotConfigured />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Laporan Pendapatan"
        description="Dihitung dari voucher yang sudah pernah dipakai."
        action={
          <div className="flex gap-2">
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 hari</SelectItem>
                <SelectItem value="30">30 hari</SelectItem>
                <SelectItem value="90">90 hari</SelectItem>
                <SelectItem value="0">Semua</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportCsv} disabled={report.rows.length === 0}>
              <Download className="size-4" /> CSV
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="panel p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Total Omzet</p>
          <p className="mono-num mt-2 text-2xl font-semibold text-primary">
            {formatIDR(report.total)}
          </p>
        </div>
        <div className="panel p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Voucher Terjual
          </p>
          <p className="mono-num mt-2 text-2xl font-semibold">{report.count}</p>
        </div>
        <div className="panel p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Stok Tersisa</p>
          <p className="mono-num mt-2 text-2xl font-semibold">{report.unsold}</p>
        </div>
      </div>

      <div className="panel mt-6 p-5">
        <h2 className="text-sm font-semibold">Grafik Pendapatan Harian</h2>
        <div className="mt-4 h-64">
          {report.chart.length === 0 ? (
            <p className="pt-16 text-center text-sm text-muted-foreground">Belum ada data.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={report.chart}>
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
              {report.rows.map(([date, v]) => (
                <TableRow key={date}>
                  <TableCell className="mono-num">{date}</TableCell>
                  <TableCell className="mono-num">{v.count}</TableCell>
                  <TableCell className="mono-num text-right">{formatIDR(v.total)}</TableCell>
                </TableRow>
              ))}
              {report.rows.length === 0 && (
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
              {report.perProfile.map(([name, v]) => (
                <TableRow key={name}>
                  <TableCell>{name}</TableCell>
                  <TableCell className="mono-num">{v.count}</TableCell>
                  <TableCell className="mono-num text-right">{formatIDR(v.total)}</TableCell>
                </TableRow>
              ))}
              {report.perProfile.length === 0 && (
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
