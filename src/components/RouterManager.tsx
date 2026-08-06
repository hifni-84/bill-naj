import { useState } from "react";
import { CheckCircle2, Plus, Router, Save, Star, Trash2, Wifi, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { mt } from "@/lib/hotspot";
import type { Json } from "@/lib/mikrotik-types";
import { writeCreds } from "@/lib/router-store";
import { emptyExtraRouter, saveRouters, useRouters, type ExtraRouter } from "@/lib/routers-store";

type Status = { ok: boolean; text: string };

export function RouterManager() {
  const routers = useRouters();
  const [draft, setDraft] = useState<ExtraRouter[] | null>(null);
  const list = draft ?? routers;
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const patch = (id: string, p: Partial<ExtraRouter>) =>
    setDraft(list.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const simpan = async (next: ExtraRouter[], pesan: string) => {
    const bersih = next.filter((r) => r.host.trim());
    await saveRouters(bersih);
    setDraft(null);
    toast.success(pesan);
  };

  const tes = async (r: ExtraRouter) => {
    setBusy(r.id);
    const res = await mt(r, "/system/resource");
    setBusy(null);
    if (!res.ok) {
      setStatus((s) => ({ ...s, [r.id]: { ok: false, text: res.error ?? "Koneksi gagal" } }));
      toast.error(res.error ?? "Koneksi gagal");
      return;
    }
    const d = res.data as Record<string, Json>;
    setStatus((s) => ({
      ...s,
      [r.id]: {
        ok: true,
        text: `${String(d["board-name"] ?? "RouterOS")} · v${String(d["version"] ?? "-")} · uptime ${String(d["uptime"] ?? "-")}`,
      },
    }));
    toast.success(`${r.name || r.host} terhubung`);
  };

  return (
    <section className="panel p-6">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <Router className="size-4 text-primary" /> Router Tambahan (ke-2 dan seterusnya)
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Tambahkan router lain memakai port API RouterOS (REST API service <code>www</code> /{" "}
        <code>www-ssl</code>). Isi port API sesuai setelan router, misal 8525, 8728, 80, atau 443
        untuk HTTPS.
      </p>

      <div className="grid gap-5">
        {list.map((r) => {
          const st = status[r.id];
          return (
            <div key={r.id} className="rounded-lg border border-border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid min-w-0 gap-2">
                  <Label>Nama Router</Label>
                  <Input
                    placeholder="Router Cabang 2"
                    value={r.name}
                    onChange={(e) => patch(r.id, { name: e.target.value })}
                  />
                </div>
                <div className="grid min-w-0 gap-2">
                  <Label>Alamat IP / Domain</Label>
                  <Input
                    placeholder="192.168.23.1"
                    value={r.host}
                    onChange={(e) => patch(r.id, { host: e.target.value })}
                  />
                </div>
                <div className="grid min-w-0 gap-2">
                  <Label>Port API</Label>
                  <Input
                    inputMode="numeric"
                    placeholder="8525"
                    value={String(r.port ?? "")}
                    onChange={(e) => patch(r.id, { port: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="flex items-end gap-3 pb-2">
                  <Switch
                    checked={!!r.useHttps}
                    onCheckedChange={(v) => patch(r.id, { useHttps: v, port: v ? 443 : 80 })}
                  />
                  <Label>Gunakan HTTPS</Label>
                </div>
                <div className="grid min-w-0 gap-2">
                  <Label>Username</Label>
                  <Input
                    value={r.username}
                    onChange={(e) => patch(r.id, { username: e.target.value })}
                  />
                </div>
                <div className="grid min-w-0 gap-2">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={r.password}
                    onChange={(e) => patch(r.id, { password: e.target.value })}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!r.host.trim() || busy === r.id}
                  onClick={() => void tes(r)}
                >
                  <Wifi className="size-4" /> {busy === r.id ? "Menguji…" : "Tes Koneksi"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!r.host.trim()}
                  onClick={() => {
                    writeCreds({
                      host: r.host,
                      username: r.username,
                      password: r.password,
                      port: r.port,
                      useHttps: r.useHttps,
                    });
                    toast.success(`${r.name || r.host} dijadikan router aktif`);
                  }}
                >
                  <Star className="size-4" /> Jadikan Aktif
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() =>
                    void simpan(
                      list.filter((x) => x.id !== r.id),
                      "Router dihapus",
                    )
                  }
                >
                  <Trash2 className="size-4" /> Hapus
                </Button>
              </div>

              {st && (
                <p
                  className={`mono-num mt-3 flex items-center gap-2 text-xs ${st.ok ? "text-primary" : "text-destructive"}`}
                >
                  {st.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
                  {st.text}
                </p>
              )}
            </div>
          );
        })}

        {!list.length && (
          <p className="text-sm text-muted-foreground">
            Belum ada router tambahan. Klik “Tambah Router”.
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => setDraft([...list, emptyExtraRouter()])}>
          <Plus className="size-4" /> Tambah Router
        </Button>
        <Button
          disabled={!draft}
          onClick={() => void simpan(list, "Daftar router tambahan tersimpan")}
        >
          <Save className="size-4" /> Simpan Router
        </Button>
      </div>
    </section>
  );
}
