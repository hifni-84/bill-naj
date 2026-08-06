import { useState } from "react";
import { Pencil, Plus, RefreshCw, Trash2, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { radiusDeleteNas, radiusSaveNas } from "@/lib/radius.functions";
import { useRadiusMutation, useRadiusNas, useRadiusNasStatus } from "@/lib/radius-client";
import { ZONA_WAKTU } from "@/lib/radius-types";

function StatusBadge({
  ok,
  label,
  title,
}: {
  ok: boolean;
  label: string;
  title?: string | undefined;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        ok ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"
      }`}
    >
      {ok ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
      {label}
    </span>
  );
}

export function NasManager() {
  const nas = useRadiusNas();
  const status = useRadiusNasStatus();
  const statusOf = (nasname: string) => (status.data ?? []).find((s) => s.nasname === nasname);
  const saveNas = useRadiusMutation((n: Parameters<typeof radiusSaveNas>[0]["data"]) =>
    radiusSaveNas({ data: n }),
  );
  const delNas = useRadiusMutation((id: number) => radiusDeleteNas({ data: { id } }));

  const [nId, setNId] = useState<number | null>(null);
  const [nIp, setNIp] = useState("");
  const [nNama, setNNama] = useState("");
  const [nSecret, setNSecret] = useState("");
  const [nKet, setNKet] = useState("");
  const [nTz, setNTz] = useState("Asia/Jakarta");
  const resetNas = () => {
    setNId(null);
    setNIp("");
    setNNama("");
    setNSecret("");
    setNKet("");
    setNTz("Asia/Jakarta");
  };

  return (
    <div className="space-y-6">
      <div className="panel p-5">
        <h2 className="mb-1 text-sm font-semibold">NAS (MikroTik)</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Isi IP router dan secret, lalu di MikroTik jalankan:{" "}
          <code className="mono-num">
            /radius add service=hotspot,ppp address=&lt;IP-Server&gt; secret=&lt;secret&gt;
          </code>
        </p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="grid gap-2">
            <Label htmlFor="n-ip">IP / Host Router</Label>
            <Input
              id="n-ip"
              placeholder="192.168.23.1"
              value={nIp}
              onChange={(e) => setNIp(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="n-nama">Nama Singkat</Label>
            <Input
              id="n-nama"
              placeholder="mikrotik-1"
              value={nNama}
              onChange={(e) => setNNama(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="n-secret">Secret</Label>
            <Input id="n-secret" value={nSecret} onChange={(e) => setNSecret(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="n-ket">Keterangan</Label>
            <Input id="n-ket" value={nKet} onChange={(e) => setNKet(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="n-tz">Zona Waktu</Label>
            <Select value={nTz} onValueChange={setNTz}>
              <SelectTrigger id="n-tz">
                <SelectValue placeholder="Pilih zona waktu" />
              </SelectTrigger>
              <SelectContent>
                {ZONA_WAKTU.map((z) => (
                  <SelectItem key={z.value} value={z.value}>
                    {z.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2 xl:col-span-4">
            <Button
              disabled={!nIp.trim() || !nSecret.trim() || saveNas.isPending}
              onClick={() =>
                saveNas.mutate(
                  {
                    ...(nId ? { id: nId } : {}),
                    nasname: nIp.trim(),
                    shortname: nNama.trim() || nIp.trim(),
                    secret: nSecret.trim(),
                    description: nKet.trim(),
                    timezone: nTz,
                  },
                  {
                    onSuccess: () => {
                      toast.success("NAS disimpan. Restart FreeRADIUS bila perlu.");
                      resetNas();
                    },
                    onError: (e: Error) => toast.error(e.message),
                  },
                )
              }
            >
              <Plus className="size-4" /> {nId ? "Perbarui NAS" : "Tambah NAS"}
            </Button>
            {nId !== null && (
              <Button variant="outline" onClick={resetNas}>
                Batal
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="panel overflow-x-auto">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Status Koneksi NAS</h3>
          <Button variant="outline" size="sm" onClick={() => status.refetch()}>
            <RefreshCw className={`size-4 ${status.isFetching ? "animate-spin" : ""}`} /> Periksa
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>IP / Host</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>Tipe</TableHead>
              <TableHead>Secret</TableHead>
              <TableHead>Zona Waktu</TableHead>
              <TableHead>RADIUS</TableHead>
              <TableHead>API Router</TableHead>
              <TableHead>Keterangan</TableHead>
              <TableHead className="w-24 text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(nas.data ?? []).map((n) => {
              const st = statusOf(n.nasname);
              return (
                <TableRow key={n.id}>
                  <TableCell className="mono-num font-medium">{n.nasname}</TableCell>
                  <TableCell>{n.shortname}</TableCell>
                  <TableCell className="text-xs uppercase">{n.type}</TableCell>
                  <TableCell className="mono-num text-xs">{n.secret}</TableCell>
                  <TableCell className="text-xs">{n.timezone || "Asia/Jakarta"}</TableCell>
                  <TableCell>
                    <StatusBadge
                      ok={Boolean(st?.radius)}
                      label={st?.radius ? "Terhubung" : "Tidak terhubung"}
                      title={
                        st?.radiusLast
                          ? `Aktivitas terakhir: ${new Date(st.radiusLast).toLocaleString()} · ${st.radiusSessions} sesi aktif`
                          : st && st.radiusRequests > 0
                            ? `Router mengirim ${st.radiusRequests} request RADIUS (accept ${st.radiusAccepts}, reject ${st.radiusRejects}, timeout ${st.radiusTimeouts})`
                            : "Belum ada aktivitas RADIUS dari NAS ini"
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      ok={Boolean(st?.api)}
                      label={
                        st?.api
                          ? `Terhubung${st.identity ? ` (${st.identity})` : ""}`
                          : "Tidak terhubung"
                      }
                      title={st?.apiError ?? undefined}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {n.description || "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Ubah NAS ${n.nasname}`}
                      onClick={() => {
                        setNId(n.id);
                        setNIp(n.nasname);
                        setNNama(n.shortname);
                        setNSecret(n.secret);
                        setNKet(n.description ?? "");
                        setNTz(n.timezone || "Asia/Jakarta");
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Hapus NAS ${n.nasname}`}
                      onClick={() => delNas.mutate(n.id)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {(nas.data ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  Belum ada NAS terdaftar.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
