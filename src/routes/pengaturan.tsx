import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, CreditCard, Globe, Save, Wifi, Layers, Receipt } from "lucide-react";
import { toast } from "sonner";

import { NasManager } from "@/components/NasManager";
import { BackupRestore } from "@/components/BackupRestore";
import { PageHeader } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { mt } from "@/lib/hotspot";
import type { Json, MtCreds } from "@/lib/mikrotik-types";
import { emptyCreds, readCreds, syncCredsFromServer, writeCreds } from "@/lib/router-store";
import {
  defaultOptions,
  readOptions,
  writeOptions,
  type BillingRole,
  type AppOptions,
} from "@/lib/auth-store";
import {
  billingAccountGet,
  billingAccountSave,
  settingsGet,
  settingsSave,
} from "@/lib/radius.functions";
import { invoiceOptionsGet, invoiceOptionsSave } from "@/lib/invoice.functions";
import { defaultInvoiceOptions, type InvoiceOptions } from "@/lib/invoice-types";
import { gatewayOptionsGet, gatewayOptionsSave } from "@/lib/payment.functions";
import {
  defaultGatewayOptions,
  type GatewayOptions,
  type GatewayProvider,
} from "@/lib/invoice-types";
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

type AccountForm = { username: string; password: string; confirm: string; configured: boolean };

type PublicAccess = { host: string; port: string; https: boolean };
const defaultPublicAccess: PublicAccess = { host: "", port: "", https: false };
const publicKeys = {
  host: "billing.public.host",
  port: "billing.public.port",
  https: "billing.public.https",
};

const roleLabels: Record<BillingRole, string> = {
  admin: "Admin",
  reseller: "Reseller",
  demo: "Demo (hanya lihat)",
};
const initialAccounts: Record<BillingRole, AccountForm> = {
  admin: { username: "admin", password: "", confirm: "", configured: false },
  reseller: { username: "reseller", password: "", confirm: "", configured: false },
  demo: { username: "demo", password: "", confirm: "", configured: false },
};

function PengaturanPage() {
  const [form, setForm] = useState<MtCreds>(emptyCreds);
  const [info, setInfo] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Record<BillingRole, AccountForm>>(initialAccounts);
  const [opts, setOpts] = useState<AppOptions>(defaultOptions);
  const [hybrid, setHybrid] = useState<HybridOptions>(defaultHybrid);
  const [inv, setInv] = useState<InvoiceOptions>(defaultInvoiceOptions);
  const [gw, setGw] = useState<GatewayOptions>(defaultGatewayOptions);
  const [pub, setPub] = useState<PublicAccess>(defaultPublicAccess);

  useEffect(() => {
    setForm(readCreds());
    void syncCredsFromServer().then((remote) => {
      if (remote) setForm(remote);
    });
    void billingAccountGet()
      .then((remote) => {
        setAccounts((current) => {
          const next = { ...current };
          for (const item of remote.accounts) {
            next[item.role] = {
              username: item.username,
              password: "",
              confirm: "",
              configured: item.configured,
            };
          }
          return next;
        });
      })
      .catch(() => undefined);
    setOpts(readOptions());
    setHybrid(readHybrid());
    void syncHybridFromServer().then((remote) => {
      if (remote) setHybrid(remote);
    });
    void invoiceOptionsGet()
      .then((r) => setInv(r.options))
      .catch(() => undefined);
    void gatewayOptionsGet()
      .then((r) => setGw(r.options))
      .catch(() => undefined);
    void settingsGet()
      .then((r) => {
        if (!r.ok) return;
        setPub({
          host: r.data[publicKeys.host] ?? "",
          port: r.data[publicKeys.port] ?? "",
          https: r.data[publicKeys.https] === "1",
        });
      })
      .catch(() => undefined);
  }, []);

  const savePublic = async () => {
    const host = pub.host.trim();
    if (!host) {
      toast.error("IP publik atau DDNS tidak boleh kosong");
      return;
    }
    const res = await settingsSave({
      data: {
        entries: {
          [publicKeys.host]: pub.host.trim(),
          [publicKeys.port]: pub.port.trim(),
          [publicKeys.https]: pub.https ? "1" : "0",
        },
      },
    });
    if ("ok" in res && res.ok === false) toast.error("Alamat publik gagal disimpan");
    else toast.success("Alamat publik billing tersimpan");
  };

  const saveInvoice = async (next: InvoiceOptions, pesan?: string) => {
    setInv(next);
    const res = await invoiceOptionsSave({ data: { options: next } });
    if (!res.ok) toast.error("Pengaturan tagihan gagal disimpan");
    else if (pesan) toast.success(pesan);
  };

  const saveHybrid = (next: HybridOptions) => {
    setHybrid(next);
    writeHybrid(next);
  };

  const saveGateway = async (next: GatewayOptions, pesan?: string) => {
    setGw(next);
    const res = await gatewayOptionsSave({ data: { options: next } });
    if (!res.ok) toast.error("Pengaturan payment gateway gagal disimpan");
    else if (pesan) toast.success(pesan);
  };

  const patchAccount = (role: BillingRole, patch: Partial<AccountForm>) =>
    setAccounts((current) => ({ ...current, [role]: { ...current[role], ...patch } }));

  const saveAccount = async (role: BillingRole) => {
    const acc = accounts[role];
    if (!acc.username.trim()) {
      toast.error("Username tidak boleh kosong");
      return;
    }
    if (!acc.password) {
      toast.error("Password tidak boleh kosong");
      return;
    }
    if (acc.password !== acc.confirm) {
      toast.error("Konfirmasi password tidak sama");
      return;
    }
    try {
      await billingAccountSave({
        data: { role, username: acc.username.trim(), password: acc.password },
      });
      patchAccount(role, { password: "", confirm: "", configured: true });
      toast.success(`Akun ${roleLabels[role]} tersimpan dan berlaku untuk semua jaringan`);
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
          <div className="grid gap-6">
            {(["admin", "reseller", "demo"] as BillingRole[]).map((role) => {
              const acc = accounts[role];
              return (
                <div key={role} className="border-t border-border pt-5 first:border-0 first:pt-0">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">Akun {roleLabels[role]}</p>
                    <span className="text-xs text-muted-foreground">
                      {acc.configured
                        ? "Password tersimpan"
                        : role === "admin"
                          ? "Default: admin / admin"
                          : role === "demo"
                            ? "Default: demo / demo"
                            : "Belum diatur"}
                    </span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor={`${role}-u`}>Username</Label>
                      <Input
                        id={`${role}-u`}
                        value={acc.username}
                        onChange={(e) => patchAccount(role, { username: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor={`${role}-p`}>Password Baru</Label>
                      <Input
                        id={`${role}-p`}
                        type="password"
                        value={acc.password}
                        onChange={(e) => patchAccount(role, { password: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2 sm:col-span-2">
                      <Label htmlFor={`${role}-p2`}>Ulangi Password</Label>
                      <Input
                        id={`${role}-p2`}
                        type="password"
                        value={acc.confirm}
                        onChange={(e) => patchAccount(role, { confirm: e.target.value })}
                      />
                    </div>
                  </div>
                  <Button className="mt-4" onClick={() => void saveAccount(role)}>
                    <Save className="size-4" /> Simpan Akun {roleLabels[role]}
                  </Button>
                </div>
              );
            })}
          </div>

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
          <div className="mb-1 flex items-center gap-2">
            <Globe className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">Akses Publik (IP Publik / DDNS)</h2>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            Isi IP publik atau domain DDNS server billing agar panel, portal pelanggan, dan callback
            payment gateway bisa diakses dari jaringan luar.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="pub-host">IP Publik / DDNS</Label>
              <Input
                id="pub-host"
                placeholder="najwa.ddns.net atau 103.10.20.30"
                value={pub.host}
                onChange={(e) => setPub({ ...pub, host: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pub-port">Port</Label>
              <Input
                id="pub-port"
                placeholder="3000 / kosongkan bila 80-443"
                value={pub.port}
                onChange={(e) => setPub({ ...pub, port: e.target.value })}
              />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-4 border-t border-border pt-4">
            <div>
              <p className="text-sm font-medium">Gunakan HTTPS</p>
              <p className="text-xs text-muted-foreground">
                Aktifkan bila domain sudah memakai SSL (Let&apos;s Encrypt / Nginx).
              </p>
            </div>
            <Switch
              checked={pub.https}
              onCheckedChange={(v) => setPub({ ...pub, https: v })}
              aria-label="Gunakan HTTPS"
            />
          </div>
          {pub.host.trim() && (
            <div className="mono-num mt-4 grid gap-1 rounded-md bg-secondary/60 p-3 text-xs">
              <p>
                Panel billing: <span className="text-primary">{publicBase}</span>
              </p>
              <p>
                Portal pelanggan: <span className="text-primary">{publicBase}/portal</span>
              </p>
              <p>
                Callback pembayaran:{" "}
                <span className="text-primary">{publicBase}/api/public/pay-callback/midtrans</span>
              </p>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Pastikan port di atas sudah diforward di router/firewall ke server billing.
          </p>
          <Button className="mt-4" onClick={() => void savePublic()}>
            <Save className="size-4" /> Simpan Alamat Publik
          </Button>
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

        <div className="panel p-6 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Receipt className="size-4 text-primary" /> Tagihan Otomatis (Paket 30 Hari)
              </h2>
              <p className="mt-1 max-w-xl text-xs text-muted-foreground">
                Setiap user hotspot maupun PPPoE dengan paket masa aktif 30 hari akan otomatis
                ditagih sehari sebelum masa aktifnya habis. Pelanggan melihat tagihan dan QRIS
                pembayaran di halaman publik <span className="mono-num text-foreground">/portal</span>
                .
              </p>
            </div>
            <Switch
              checked={inv.enabled}
              onCheckedChange={(v) =>
                void saveInvoice(
                  { ...inv, enabled: v },
                  v ? "Tagihan otomatis aktif" : "Tagihan otomatis nonaktif",
                )
              }
              aria-label="Aktifkan tagihan otomatis"
            />
          </div>

          {inv.enabled && (
            <div className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="lead">Dibuat berapa hari sebelum expired</Label>
                <Input
                  id="lead"
                  inputMode="numeric"
                  value={String(inv.leadDays)}
                  onChange={(e) =>
                    setInv({
                      ...inv,
                      leadDays: Math.min(30, Math.max(1, Number(e.target.value) || 1)),
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">1 = H-1 (sehari sebelum expired).</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="merchant">Nama Usaha / Merchant</Label>
                <Input
                  id="merchant"
                  value={inv.merchant}
                  onChange={(e) => setInv({ ...inv, merchant: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="qris">URL Gambar QRIS Statis</Label>
                <Input
                  id="qris"
                  placeholder="https://domain.com/qris.png"
                  value={inv.qrisUrl}
                  onChange={(e) => setInv({ ...inv, qrisUrl: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="wa">WhatsApp Konfirmasi</Label>
                <Input
                  id="wa"
                  placeholder="6281234567890"
                  value={inv.whatsapp}
                  onChange={(e) => setInv({ ...inv, whatsapp: e.target.value })}
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="payinfo">Petunjuk Pembayaran</Label>
                <Textarea
                  id="payinfo"
                  rows={3}
                  placeholder={"Transfer BRI 1234567890 a/n Najwa\nDANA/OVO 0812xxxx"}
                  value={inv.payInfo}
                  onChange={(e) => setInv({ ...inv, payInfo: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Button onClick={() => void saveInvoice(inv, "Pengaturan tagihan disimpan")}>
                  <Save className="size-4" /> Simpan Pengaturan Tagihan
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="panel p-6 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <CreditCard className="size-4 text-primary" /> Payment Gateway (Midtrans / Tripay)
              </h2>
              <p className="mt-1 max-w-xl text-xs text-muted-foreground">
                Bila aktif, pelanggan bisa membayar tagihan langsung dari halaman{" "}
                <span className="mono-num text-foreground">/portal</span> (QRIS, virtual account,
                e-wallet). Masa aktif diperpanjang otomatis begitu webhook pembayaran diterima.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="gwprov">Provider</Label>
              <select
                id="gwprov"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={gw.provider}
                onChange={(e) => setGw({ ...gw, provider: e.target.value as GatewayProvider })}
              >
                <option value="none">Nonaktif (manual / QRIS statis)</option>
                <option value="midtrans">Midtrans (Snap)</option>
                <option value="tripay">Tripay</option>
              </select>
            </div>
            <div className="flex items-end justify-between gap-3 rounded-md border border-border p-3">
              <div>
                <Label htmlFor="gwsand">Mode Sandbox (uji coba)</Label>
                <p className="text-xs text-muted-foreground">Matikan untuk transaksi sungguhan.</p>
              </div>
              <Switch
                id="gwsand"
                checked={gw.sandbox}
                onCheckedChange={(v) => setGw({ ...gw, sandbox: v })}
              />
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="gwbase">URL Publik Panel</Label>
              <Input
                id="gwbase"
                placeholder="https://najwa.ddns.net"
                value={gw.baseUrl}
                onChange={(e) => setGw({ ...gw, baseUrl: e.target.value })}
              />
              {gw.provider !== "none" && (
                <p className="text-xs text-muted-foreground">
                  Isi URL callback / webhook di dashboard {gw.provider === "midtrans" ? "Midtrans" : "Tripay"}{" "}
                  dengan:{" "}
                  <span className="mono-num break-all text-foreground">
                    {(gw.baseUrl || "https://domain-anda") + "/api/public/pay-callback/" + gw.provider}
                  </span>
                </p>
              )}
            </div>

            {gw.provider === "midtrans" && (
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="mtkey">Midtrans Server Key</Label>
                <Input
                  id="mtkey"
                  type="password"
                  placeholder="SB-Mid-server-xxxxxxxx"
                  value={gw.midtransServerKey}
                  onChange={(e) => setGw({ ...gw, midtransServerKey: e.target.value })}
                />
              </div>
            )}

            {gw.provider === "tripay" && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="tpapi">Tripay API Key</Label>
                  <Input
                    id="tpapi"
                    type="password"
                    value={gw.tripayApiKey}
                    onChange={(e) => setGw({ ...gw, tripayApiKey: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tppriv">Tripay Private Key</Label>
                  <Input
                    id="tppriv"
                    type="password"
                    value={gw.tripayPrivateKey}
                    onChange={(e) => setGw({ ...gw, tripayPrivateKey: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tpmc">Merchant Code</Label>
                  <Input
                    id="tpmc"
                    placeholder="T00001"
                    value={gw.tripayMerchantCode}
                    onChange={(e) => setGw({ ...gw, tripayMerchantCode: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tpmethod">Channel Pembayaran</Label>
                  <Input
                    id="tpmethod"
                    placeholder="QRIS"
                    value={gw.tripayMethod}
                    onChange={(e) => setGw({ ...gw, tripayMethod: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Contoh: QRIS, BRIVA, BCAVA, DANA, OVO, ALFAMART.
                  </p>
                </div>
              </>
            )}

            <div className="sm:col-span-2">
              <Button onClick={() => void saveGateway(gw, "Pengaturan payment gateway disimpan")}>
                <Save className="size-4" /> Simpan Payment Gateway
              </Button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <NasManager />
        </div>

        <div className="lg:col-span-2">
          <BackupRestore />
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
