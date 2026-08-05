import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Copy, KeyRound, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  licenseActivate,
  licenseDeactivate,
  licenseMikrotikId,
  licenseStatus,
} from "@/lib/license.functions";
import { formatLicenseCode } from "@/lib/license-types";

function tanggal(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("id-ID");
}

async function salin(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} disalin`);
  } catch {
    toast.error("Gagal menyalin");
  }
}

export function useLicense() {
  return useQuery({ queryKey: ["license"], queryFn: () => licenseStatus() });
}

export function ActivationPanel({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useLicense();
  const [code, setCode] = useState("");
  const [mtId, setMtId] = useState("");

  useEffect(() => {
    if (data?.mikrotikLicense) setMtId(data.mikrotikLicense);
  }, [data?.mikrotikLicense]);

  const ambilMt = useMutation({
    mutationFn: () => licenseMikrotikId(),
    onSuccess: (res) => {
      if (res.id) {
        setMtId(res.id);
        toast.success("Software ID MikroTik terbaca dari router");
      } else {
        toast.error("Tidak bisa membaca lisensi router — isi manual dari /system/license");
      }
    },
  });

  const aktivasi = useMutation({
    mutationFn: () => licenseActivate({ data: { code, mikrotikId: mtId } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error ?? "Aktivasi gagal");
        return;
      }
      toast.success(`Billing aktif — ${res.durationLabel}`);
      setCode("");
      void qc.invalidateQueries({ queryKey: ["license"] });
    },
  });

  const nonaktif = useMutation({
    mutationFn: () => licenseDeactivate(),
    onSuccess: () => {
      toast.success("Lisensi dihapus dari billing ini");
      void qc.invalidateQueries({ queryKey: ["license"] });
    },
  });

  if (isLoading) return <div className="panel p-6 text-sm text-muted-foreground">Memuat…</div>;

  const st = data;

  return (
    <div className={compact ? "w-full max-w-lg" : "grid gap-4 lg:grid-cols-2"}>
      <div className="panel p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-primary">
            <KeyRound className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Aktivasi Billing</p>
            <p className="text-[11px] text-muted-foreground">
              Kode unik dibuat dari Software ID billing + lisensi MikroTik
            </p>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Software ID Billing</Label>
            <div className="flex gap-2">
              <Input value={st?.softwareId ?? ""} readOnly className="font-mono" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => salin(st?.softwareId ?? "", "Software ID")}
              >
                <Copy className="size-4" />
              </Button>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="mtid">Software ID / Lisensi MikroTik</Label>
            <div className="flex gap-2">
              <Input
                id="mtid"
                value={mtId}
                onChange={(e) => setMtId(e.target.value.toUpperCase())}
                placeholder="contoh: XXXX-XXXX"
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Baca dari router"
                onClick={() => ambilMt.mutate()}
                disabled={ambilMt.isPending}
              >
                <RefreshCw className={`size-4 ${ambilMt.isPending ? "animate-spin" : ""}`} />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Lihat di Winbox: System → License → Software ID
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="lcode">Kode Aktivasi</Label>
            <Input
              id="lcode"
              value={code}
              onChange={(e) => setCode(formatLicenseCode(e.target.value))}
              placeholder="XXXX-XXXX-XXXX"
              className="font-mono tracking-widest"
            />
          </div>

          <Button
            onClick={() => aktivasi.mutate()}
            disabled={aktivasi.isPending || !code || !mtId}
            className="mt-1"
          >
            {aktivasi.isPending ? "Memeriksa…" : "Aktifkan Billing"}
          </Button>
        </div>
      </div>

      <div className="panel p-5">
        <p className="mb-3 text-sm font-semibold">Status Lisensi</p>
        <div className="grid gap-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Status</span>
            {st?.active ? (
              <Badge className="gap-1">
                <BadgeCheck className="size-3" /> Aktif
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <ShieldAlert className="size-3" /> {st?.expired ? "Kedaluwarsa" : "Belum aktif"}
              </Badge>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Masa aktif</span>
            <span className="font-medium">{st?.durationLabel}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Kode terpakai</span>
            <span className="font-mono text-xs">{st?.code || "-"}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Diaktifkan</span>
            <span>{tanggal(st?.activatedAt ?? null)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Berlaku sampai</span>
            <span>
              {st?.duration === "L" && st?.active ? "Selamanya" : tanggal(st?.expiresAt ?? null)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Sisa hari</span>
            <span>{st?.duration === "L" ? "∞" : (st?.remainingDays ?? "-")}</span>
          </div>
        </div>
        {st?.error && (
          <p className="mt-3 text-xs text-destructive">
            Database billing: {st.error}. Aktivasi butuh koneksi database.
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RefreshCw className="mr-2 size-4" /> Muat ulang
          </Button>
          {st?.code && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => nonaktif.mutate()}
              disabled={nonaktif.isPending}
            >
              Hapus lisensi
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Blokir seluruh panel bila lisensi belum aktif atau sudah kedaluwarsa. */
export function LicenseGate({ children }: { children: ReactNode }) {
  const { data, isLoading } = useLicense();
  if (isLoading) return null;
  // Bila database billing belum tersambung, jangan kunci panel (aktivasi tak bisa diverifikasi).
  if (data?.active || data?.error) return <>{children}</>;

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-background px-4 py-10">
      <div className="text-center">
        <h1 className="text-xl font-semibold tracking-tight">Billing belum diaktivasi</h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {data?.expired
            ? "Masa aktif lisensi sudah habis. Masukkan kode aktivasi baru untuk melanjutkan."
            : "Kirim Software ID billing dan Software ID MikroTik ke penjual untuk memperoleh kode aktivasi."}
        </p>
      </div>
      <ActivationPanel compact />
    </div>
  );
}
