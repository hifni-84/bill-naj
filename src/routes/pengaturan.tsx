import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Save, Wifi, Layers } from "lucide-react";
import { toast } from "sonner";

import { NasManager } from "@/components/NasManager";
import { PageHeader } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { mt } from "@/lib/hotspot";
import type { Json, MtCreds } from "@/lib/mikrotik-types";
import { emptyCreds, readCreds, syncCredsFromServer, writeCreds } from "@/lib/router-store";
import {
  defaultAccount,
  defaultOptions,
  readAccount,
  readOptions,
  writeOptions,
  type AppOptions,
} from "@/lib/auth-store";
import { billingAccountGet, billingAccountSave } from "@/lib/radius.functions";
import {
  defaultHybrid,
  readHybrid,
  syncHybridFromServer,
  writeHybrid,
  type HybridOptions,
} from "@/lib/hybrid";

export const Route = createFileRoute("/pengaturan")({
  head: () => ({
    meta: [
      { title: "Pengaturan Router — NAJWA_BILLING" },
      {
        name: "description",
        content:
          "Hubungkan panel billing ke RouterOS melalui REST API: alamat IP, port, username, dan password.",
      },
      { property: "og:title", content: "Pengaturan Router — NAJWA_BILLING" },
      {
        property: "og:description",
        content: "Konfigurasi koneksi RouterOS REST API untuk panel billing hotspot.",
      },
    ],
  }),
  component: PengaturanPage,
});

function PengaturanPage() {
  const [form, setForm] = useState<MtCreds>(emptyCreds);
  const [info, setInfo] = useState<string | null>(null);
  const [acc, setAcc] = useState(defaultAccount);
  const [pass2, setPass2] = useState("");
  const [opts, setOpts] = useState<AppOptions>(defaultOptions);
  const [hybrid, setHybrid] = useState<HybridOptions>(defaultHybrid);

  useEffect(() => {
    setForm(readCreds());
    void syncCredsFromServer().then((remote) => {
      if (remote) setForm(remote);
    });
    const a = readAccount();
    setAcc(a);
    setPass2(a.password);
    void billingAccountGet()
      .then(async (remote) => {
        if (remote.configured) {
          setAcc({ username: remote.username, password: "" });
          setPass2("");
          return;
        }
        // Migrasikan akun lama dari browser pertama ke server satu kali.
        if (a.username !== defaultAccount.username || a.password !== defaultAccount.password) {
          await billingAccountSave({ data: a });
        }
      })
      .catch(() => undefined);
    setOpts(readOptions());
    setHybrid(readHybrid());
    void syncHybridFromServer().then((remote) => {
      if (remote) setHybrid(remote);
    });
  }, []);

  const saveHybrid = (next: HybridOptions) => {
    setHybrid(next);
    writeHybrid(next);
  };

  const saveAccount = async () => {
    if (!acc.username.trim()) {
      toast.error("Username tidak boleh kosong");
      return;
    }
    if (!acc.password) {
      toast.error("Password tidak boleh kosong");
      return;
    }
    if (acc.password !== pass2) {
      toast.error("Konfirmasi password tidak sama");
      return;
    }
    try {
      await billingAccountSave({
        data: { username: acc.username.trim(), password: acc.password },
      });
      setAcc((current) => ({ ...current, password: "" }));
      setPass2("");
      toast.success("Akun login tersimpan di server dan berlaku untuk semua jaringan");
    } catch {
      toast.error("Akun gagal disimpan ke server");
    }
  };

  const test = useMutation({
    mutationFn: async () => {
      const res = await mt(form, "/system/resource");
      if (!res.ok) throw new Error(res.error ?? "Koneksi gagal");
      const data = res.data as Record<string, Json>;
      return `${String(data["board-name"] ?? "RouterOS")} · v${String(data["version"] ?? "-")} · uptime ${String(data["uptime"] ?? "-")}`;
    },
    onSuccess: (msg) => {
      setInfo(msg);
      toast.success("Koneksi berhasil");
    },
    onError: (e: Error) => {
      setInfo(null);
      toast.error(e.message);
    },
  });

  const save = () => {
    writeCreds(form);
    toast.success("Pengaturan router disimpan");
  };

  return (
    <>
      <PageHeader
        title="Pengaturan Router"
        description="Kredensial disimpan di browser Anda dan dipakai untuk memanggil RouterOS REST API."
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="panel p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="host">Alamat IP / Domain Router</Label>
              <Input
                id="host"
                placeholder="103.10.20.30 atau router.domain.com"
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                inputMode="numeric"
                value={String(form.port ?? 80)}
                onChange={(e) => setForm({ ...form, port: Number(e.target.value) || 80 })}
              />
            </div>
            <div className="flex items-end gap-3 pb-2">
              <Switch
                id="ssl"
                checked={!!form.useHttps}
                onCheckedChange={(v) => setForm({ ...form, useHttps: v, port: v ? 443 : 80 })}
              />
              <Label htmlFor="ssl">Gunakan HTTPS</Label>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="user">Username</Label>
              <Input
                id="user"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pass">Password</Label>
              <Input
                id="pass"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={save} disabled={!form.host.trim()}>
              <Save className="size-4" /> Simpan
            </Button>
            <Button
              variant="outline"
              onClick={() => test.mutate()}
              disabled={!form.host.trim() || test.isPending}
            >
              <Wifi className="size-4" /> {test.isPending ? "Menguji..." : "Tes Koneksi"}
            </Button>
          </div>

          {info && (
            <p className="mono-num mt-4 flex items-center gap-2 text-sm text-primary">
              <CheckCircle2 className="size-4" /> {info}
            </p>
          )}
        </div>

        <div className="panel p-6">
          <h2 className="mb-4 text-sm font-semibold">Akun Login Billing</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="au">Username</Label>
              <Input
                id="au"
                value={acc.username}
                onChange={(e) => setAcc({ ...acc, username: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ap">Password Baru</Label>
              <Input
                id="ap"
                type="password"
                value={acc.password}
                onChange={(e) => setAcc({ ...acc, password: e.target.value })}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="ap2">Ulangi Password</Label>
              <Input
                id="ap2"
                type="password"
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
              />
            </div>
          </div>
          <Button className="mt-5" onClick={() => void saveAccount()}>
            <Save className="size-4" /> Simpan Akun
          </Button>

          <div className="mt-6 flex items-center justify-between gap-4 border-t border-border pt-5">
            <div>
              <p className="text-sm font-medium">Hapus voucher expired otomatis</p>
              <p className="text-xs text-muted-foreground">
                Voucher yang habis masa aktifnya langsung dihapus dari user hotspot MikroTik.
              </p>
            </div>
            <Switch
              checked={opts.autoDeleteExpired}
              onCheckedChange={(v) => {
                const next = { ...opts, autoDeleteExpired: v };
                setOpts(next);
                writeOptions(next);
                toast.success(v ? "Hapus otomatis aktif" : "Voucher expired hanya dinonaktifkan");
              }}
              aria-label="Hapus voucher expired otomatis"
            />
          </div>
        </div>

        <div className="panel p-6 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Layers className="size-4 text-primary" /> Billing Hybrid (RADIUS + MikroTik)
              </h2>
              <p className="mt-1 max-w-xl text-xs text-muted-foreground">
                Jika diaktifkan, setiap paket dan voucher yang dibuat atau digenerate tersimpan di
                database RADIUS sekaligus langsung dibuat di router MikroTik (hotspot user profile /
                ppp profile dan hotspot user / ppp secret).
              </p>
            </div>
            <Switch
              checked={hybrid.enabled}
              onCheckedChange={(v) => {
                saveHybrid({ ...hybrid, enabled: v });
                toast.success(v ? "Mode hybrid aktif" : "Mode hybrid nonaktif (hanya RADIUS)");
              }}
              aria-label="Aktifkan mode billing hybrid"
            />
          </div>

          {hybrid.enabled && (
            <div className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Sinkronkan Paket → Profile</p>
                  <p className="text-xs text-muted-foreground">
                    Paket dibuat sebagai profile di router beserta bandwidth, shared users, dan masa
                    aktif.
                  </p>
                </div>
                <Switch
                  checked={hybrid.syncProfile}
                  onCheckedChange={(v) => saveHybrid({ ...hybrid, syncProfile: v })}
                  aria-label="Sinkronkan paket ke profile MikroTik"
                />
              </div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Sinkronkan Voucher → Router</p>
                  <p className="text-xs text-muted-foreground">
                    Voucher hasil generate dan user manual langsung dibuat di hotspot user / ppp
                    secret.
                  </p>
                </div>
                <Switch
                  checked={hybrid.syncVoucher}
                  onCheckedChange={(v) => saveHybrid({ ...hybrid, syncVoucher: v })}
                  aria-label="Sinkronkan voucher ke MikroTik"
                />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Pastikan koneksi router di panel sebelah sudah tersimpan dan lolos tes koneksi,
                karena mode hybrid memakai kredensial tersebut.
              </p>
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <NasManager />
        </div>

        <div className="panel p-6 text-sm leading-relaxed text-muted-foreground">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Persiapan di sisi MikroTik</h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Aktifkan REST API:{" "}
              <span className="mono-num text-foreground">/ip service enable www</span> (atau{" "}
              <span className="mono-num text-foreground">www-ssl</span> untuk HTTPS). RouterOS v7 ke
              atas.
            </li>
            <li>
              Buat user khusus dengan grup <span className="mono-num text-foreground">full</span>{" "}
              atau grup custom berizin{" "}
              <span className="mono-num text-foreground">api, read, write</span>.
            </li>
            <li>
              Pastikan router dapat diakses dari internet (IP publik / VPN) dan port di atas tidak
              diblokir firewall.
            </li>
            <li>
              Batasi akses API hanya dari alamat tepercaya pada
              <span className="mono-num text-foreground"> /ip service set www address=...</span>.
            </li>
          </ol>
        </div>
      </div>
    </>
  );
}
