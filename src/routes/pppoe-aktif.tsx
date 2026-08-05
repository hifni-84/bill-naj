import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw, Network } from "lucide-react";

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
import { useRadiusSessions, useRadiusUsers } from "@/lib/radius-client";
import { formatBytes, formatDateTime, formatDuration } from "@/lib/mikrotik-types";

export const Route = createFileRoute("/pppoe-aktif")({
  head: () => ({
    meta: [
      { title: "User PPPoE Aktif — NAJWA_BILLING" },
      {
        name: "description",
        content:
          "Daftar user PPPoE yang sedang online: IP, MAC, NAS, durasi sesi, dan pemakaian data.",
      },
      { property: "og:title", content: "User PPPoE Aktif — NAJWA_BILLING" },
      {
        property: "og:description",
        content: "Pantau sesi PPPoE aktif dari database FreeRADIUS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PppoeAktifPage,
});

function PppoeAktifPage() {
  const sessions = useRadiusSessions();
  const users = useRadiusUsers();

  const pppoeUsers = new Map(
    (users.data ?? []).filter((u) => u.service === "pppoe").map((u) => [u.username, u]),
  );
  const rows = (sessions.data ?? []).filter((s) => pppoeUsers.has(s.username));

  return (
    <>
      <PageHeader
        title="User PPPoE Aktif"
        description={`Total PPPoE online: ${rows.length} — diperbarui otomatis setiap 10 detik.`}
        action={
          <div className="flex items-center gap-3">
            <span className="rounded-md border border-border bg-muted/40 px-3 py-1.5 text-sm">
              Total Aktif: <strong className="mono-num">{rows.length}</strong>
            </span>
            <Button
              variant="outline"
              onClick={() => {
                sessions.refetch();
                users.refetch();
              }}
            >
              <RefreshCw className="size-4" /> Muat Ulang
            </Button>
          </div>
        }
      />

      <div className="panel overflow-x-auto">
        <div className="flex items-center gap-2 border-b border-border p-4">
          <Network className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Sesi PPPoE ({rows.length})</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Paket</TableHead>
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
            {rows.map((s) => (
              <TableRow key={s.radacctid}>
                <TableCell className="mono-num font-medium">{s.username}</TableCell>
                <TableCell className="text-xs">{pppoeUsers.get(s.username)?.plan ?? "-"}</TableCell>
                <TableCell className="mono-num">{s.framedipaddress ?? "-"}</TableCell>
                <TableCell className="mono-num text-xs">{s.callingstationid ?? "-"}</TableCell>
                <TableCell className="mono-num text-xs">{s.nasipaddress}</TableCell>
                <TableCell className="mono-num text-xs">
                  {formatDateTime(s.acctstarttime ?? undefined)}
                </TableCell>
                <TableCell className="mono-num text-xs">
                  {formatDuration(Number(s.acctsessiontime))}
                </TableCell>
                <TableCell className="mono-num text-xs">{formatBytes(s.acctoutputoctets)}</TableCell>
                <TableCell className="mono-num text-xs">{formatBytes(s.acctinputoctets)}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  Belum ada user PPPoE yang online.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}