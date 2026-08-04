import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw, Wifi } from "lucide-react";

import { PageHeader } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRadiusSessions } from "@/lib/radius-client";
import { formatBytes, formatDateTime, formatDuration } from "@/lib/mikrotik-types";

export const Route = createFileRoute("/sesi-aktif")({
  head: () => ({
    meta: [
      { title: "Sesi Aktif RADIUS — NAJWA_BILLING" },
      {
        name: "description",
        content:
          "Pantau sesi RADIUS yang sedang berjalan: username, IP, MAC, NAS, durasi, dan pemakaian data.",
      },
      { property: "og:title", content: "Sesi Aktif RADIUS — NAJWA_BILLING" },
      {
        property: "og:description",
        content: "Daftar sesi accounting FreeRADIUS yang sedang online.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SesiAktifPage,
});

function SesiAktifPage() {
  const sessions = useRadiusSessions();

  return (
    <>
      <PageHeader
        title="Sesi Aktif"
        description="Sesi accounting yang sedang berjalan di FreeRADIUS."
        action={
          <Button variant="outline" onClick={() => sessions.refetch()}>
            <RefreshCw className="size-4" /> Muat Ulang
          </Button>
        }
      />

      <div className="panel overflow-x-auto">
        <div className="flex items-center gap-2 border-b border-border p-4">
          <Wifi className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Sesi Aktif ({(sessions.data ?? []).length})</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>MAC / Caller</TableHead>
              <TableHead>NAS</TableHead>
              <TableHead>Mulai</TableHead>
              <TableHead>Durasi</TableHead>
              <TableHead>Download</TableHead>
              <TableHead>Upload</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(sessions.data ?? []).map((s) => (
              <TableRow key={s.radacctid}>
                <TableCell className="mono-num font-medium">{s.username}</TableCell>
                <TableCell className="mono-num">{s.framedipaddress ?? "-"}</TableCell>
                <TableCell className="mono-num text-xs">{s.callingstationid ?? "-"}</TableCell>
                <TableCell className="mono-num text-xs">{s.nasipaddress}</TableCell>
                <TableCell className="mono-num text-xs">{formatDateTime(s.acctstarttime ?? undefined)}</TableCell>
                <TableCell className="mono-num text-xs">{formatDuration(Number(s.acctsessiontime))}</TableCell>
                <TableCell className="mono-num text-xs">{formatBytes(s.acctoutputoctets)}</TableCell>
                <TableCell className="mono-num text-xs">{formatBytes(s.acctinputoctets)}</TableCell>
              </TableRow>
            ))}
            {(sessions.data ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  Belum ada sesi aktif.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
