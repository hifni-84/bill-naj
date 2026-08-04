import { useRef, useState } from "react";
import { Database, Download, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { backupExport, backupImport } from "@/lib/radius.functions";

/** Setelan yang tersimpan di browser dan ikut dicadangkan. */
const LOCAL_KEYS = [
  "mikrotik.creds",
  "mikrotik.prices",
  "billing.hybrid",
  "billing.options",
  "genieacs.creds",
  "najwa_voucher_templates",
];

function readLocal() {
  const out: Record<string, string> = {};
  for (const k of LOCAL_KEYS) {
    const v = window.localStorage.getItem(k);
    if (v !== null) out[k] = v;
  }
  return out;
}

export function BackupRestore() {
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const doExport = async () => {
    setBusy("export");
    try {
      const res = await backupExport();
      if (!res.ok) throw new Error(res.error);
      const payload = { ...res.data, local: readLocal() };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.href = url;
      a.download = `najwa-billing-backup-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(
        `Backup dibuat: ${payload.plans.length} paket, ${payload.vouchers.length} voucher, ${payload.nas.length} NAS`,
      );
    } catch (e) {
      toast.error(`Backup gagal: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const doImport = async (file: File) => {
    setBusy("import");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { local?: Record<string, string> };
      const res = await backupImport({ data: { payload: text, replace } });
      if (!res.ok) throw new Error(res.error);
      if (parsed.local) {
        for (const [k, v] of Object.entries(parsed.local)) {
          if (LOCAL_KEYS.includes(k)) window.localStorage.setItem(k, v);
        }
      }
      toast.success(
        `Restore selesai: ${res.plans} paket, ${res.vouchers} voucher, ${res.nas} NAS. Halaman dimuat ulang…`,
      );
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      toast.error(`Restore gagal: ${(e as Error).message}`);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="panel p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Database className="size-4 text-primary" /> Backup &amp; Restore
          </h2>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">
            Simpan satu file JSON berisi semua pengaturan panel, paket (profile hotspot &amp;
            PPPoE), seluruh voucher/user beserta masa aktifnya, daftar NAS, template voucher, dan
            kredensial router. File yang sama bisa dipulihkan kapan saja atau dipakai di server
            lain.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <Button onClick={() => void doExport()} disabled={busy !== null}>
          <Download className="size-4" /> {busy === "export" ? "Menyiapkan..." : "Backup Sekarang"}
        </Button>
        <Button
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={busy !== null}
        >
          <Upload className="size-4" /> {busy === "import" ? "Memulihkan..." : "Restore dari File"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void doImport(file);
          }}
        />
      </div>

      <div className="mt-5 flex items-start justify-between gap-4 border-t border-border pt-5">
        <div>
          <p className="text-sm font-medium">Hapus data lama saat restore</p>
          <p className="text-xs text-muted-foreground">
            Aktif: semua paket dan voucher di database dihapus dulu, lalu diganti isi file backup.
            Nonaktif: data file backup ditambahkan/menimpa data yang namanya sama.
          </p>
        </div>
        <Switch
          checked={replace}
          onCheckedChange={setReplace}
          aria-label="Hapus data lama saat restore"
        />
      </div>
    </div>
  );
}
