import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { useRadiusReport } from "@/lib/radius-client";
import { formatIDR } from "@/lib/mikrotik-types";

export const Route = createFileRoute("/pendapatan")({
  head: () => ({
    meta: [
      { title: "Pendapatan RADIUS — NAJWA_BILLING" },
      {
        name: "description",
        content:
          "Rekap pendapatan harian 30 hari terakhir dan bulanan 12 bulan terakhir dari voucher dan user RADIUS.",
      },
      { property: "og:title", content: "Pendapatan RADIUS — NAJWA_BILLING" },
      {
        property: "og:description",
        content: "Total pendapatan harian dan bulanan billing NAJWA_BILLING.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PendapatanPage,
});

function PendapatanPage() {
  const report = useRadiusReport();

  return (
    <>
      <PageHeader
        title="Pendapatan"
        description="Rekap pendapatan harian dan bulanan."
        action={
          <Button variant="outline" onClick={() => report.refetch()}>
            <RefreshCw className="size-4" /> Muat Ulang
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          {
            l: "Pendapatan Hari Ini",
            v: formatIDR(report.data?.todayRevenue ?? 0),
            s: `${report.data?.todayCount ?? 0} voucher`,
          },
          {
            l: "Pendapatan Bulan Ini",
            v: formatIDR(report.data?.monthRevenue ?? 0),
            s: `${report.data?.monthCount ?? 0} voucher`,
          },
          { l: "Total Pendapatan", v: formatIDR(report.data?.totalRevenue ?? 0), s: "" },
        ].map((s) => (
          <div key={s.l} className="panel p-4">
            <p className="text-xs text-muted-foreground">{s.l}</p>
            <p className="mono-num mt-1 text-xl font-semibold">{s.v}</p>
            {s.s ? <p className="mt-0.5 text-xs text-muted-foreground">{s.s}</p> : null}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="panel p-5">
          <h3 className="mb-3 text-sm font-semibold">Pendapatan Harian (30 hari)</h3>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Tanggal</th>
                  <th className="p-2 text-right">Voucher</th>
                  <th className="p-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {[...(report.data?.daily ?? [])].reverse().map((d) => (
                  <tr key={d.date} className="border-t border-border/50">
                    <td className="p-2">{d.date}</td>
                    <td className="mono-num p-2 text-right">{d.count}</td>
                    <td className="mono-num p-2 text-right">{formatIDR(d.total)}</td>
                  </tr>
                ))}
                {!report.data?.daily.length && (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-muted-foreground">
                      Belum ada data
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel p-5">
          <h3 className="mb-3 text-sm font-semibold">Pendapatan Bulanan (12 bulan)</h3>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Bulan</th>
                  <th className="p-2 text-right">Voucher</th>
                  <th className="p-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {[...(report.data?.monthly ?? [])].reverse().map((m) => (
                  <tr key={m.month} className="border-t border-border/50">
                    <td className="p-2">{m.month}</td>
                    <td className="mono-num p-2 text-right">{m.count}</td>
                    <td className="mono-num p-2 text-right">{formatIDR(m.total)}</td>
                  </tr>
                ))}
                {!report.data?.monthly.length && (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-muted-foreground">
                      Belum ada data
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
