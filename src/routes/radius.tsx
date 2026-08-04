import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw, Database } from "lucide-react";

import { PageHeader } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { useRadiusPing, useRadiusReport } from "@/lib/radius-client";
import { formatIDR } from "@/lib/mikrotik-types";

export const Route = createFileRoute("/radius")({
  head: () => ({
    meta: [
      { title: "Billing RADIUS — NAJWA_BILLING" },
      {
        name: "description",
        content:
          "Ringkasan billing FreeRADIUS: status database, jumlah user, sesi online, dan pendapatan.",
      },
      { property: "og:title", content: "Billing RADIUS — NAJWA_BILLING" },
      {
        property: "og:description",
        content: "Panel RADIUS: status database dan ringkasan pendapatan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RadiusPage,
});

function RadiusPage() {
  const ping = useRadiusPing();
  const report = useRadiusReport();

  const dbInfo = ping.data;
  return (
    <>
      <PageHeader
        title="Billing RADIUS"
        description="Semua user & voucher tersimpan di database FreeRADIUS."
        action={
          <Button
            variant="outline"
            onClick={() => {
              ping.refetch();
              report.refetch();
            }}
          >
            <RefreshCw className="size-4" /> Muat Ulang
          </Button>
        }
      />

      <div className="panel mb-6 flex flex-wrap items-center gap-3 p-4">
        <Database className="size-5 text-primary" />
        {ping.isLoading ? (
          <span className="text-sm text-muted-foreground">Menghubungi database…</span>
        ) : dbInfo?.ok ? (
          <span className="text-sm">
            Terhubung ke MySQL <b>{dbInfo.version}</b> · {dbInfo.users} entri radcheck
          </span>
        ) : (
          <span className="text-sm text-destructive">
            Database RADIUS belum siap: {(dbInfo && !dbInfo.ok ? dbInfo.error : "") || "tidak diketahui"} — jalankan{" "}
            <code>sudo bash deploy/install-radius.sh</code> di server.
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { l: "Total User", v: String(report.data?.totalUsers ?? 0) },
          { l: "Sudah Dipakai", v: String(report.data?.used ?? 0) },
          { l: "Sedang Online", v: String(report.data?.online ?? 0) },
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
          { l: "Total Pendapatan", v: formatIDR(report.data?.totalRevenue ?? 0) },
        ].map((s) => (
          <div key={s.l} className="panel p-4">
            <p className="text-xs text-muted-foreground">{s.l}</p>
            <p className="mono-num mt-1 text-xl font-semibold">{s.v}</p>
            {"s" in s && s.s ? <p className="mt-0.5 text-xs text-muted-foreground">{s.s}</p> : null}
          </div>
        ))}
      </div>
    </>
  );
}
