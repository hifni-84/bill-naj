import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Printer, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/Shared";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  radiusCreateUsers,
  radiusDeleteExpired,
  radiusDeleteUsers,
  radiusReactivateUsers,
} from "@/lib/radius.functions";
import {
  useRadiusMutation,
  useRadiusNas,
  useRadiusPlans,
  useRadiusUsers,
} from "@/lib/radius-client";
import { isRadiusExpired, radiusRemainingSeconds } from "@/lib/radius-types";
import { formatDateTime, formatDuration, formatIDR } from "@/lib/mikrotik-types";
import { useNow } from "@/lib/use-now";
import {
  loadTemplates,
  printVouchers,
  TEMPLATE_DEFAULT,
  type VoucherTemplate,
} from "@/lib/voucher-template";
import {
  pushVouchersToMikrotik,
  removeVouchersFromMikrotik,
  useHybrid,
  type HybridVoucher,
} from "@/lib/hybrid";
import { useCreds } from "@/lib/router-store";

export const Route = createFileRoute("/voucher")({
  head: () => ({
    meta: [
      { title: "Voucher & User — NAJWA_BILLING" },
      {
        name: "description",
        content:
          "Generate voucher hotspot ke database RADIUS, cari dan filter kode voucher, serta cetak sesuai template A4.",
      },
      { property: "og:title", content: "Voucher & User — NAJWA_BILLING" },
      {
        property: "og:description",
        content: "Generate, kelola, dan cetak voucher hotspot dari database RADIUS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VoucherPage,
});

/** Pilihan karakter untuk kode voucher yang digenerate. */
const KARAKTER = [
  {
    id: "campur",
    label: "abcABC01234",
    chars: "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789",
  },
  { id: "kecil", label: "abcdefghijkl", chars: "abcdefghijkmnpqrstuvwxyz" },
  { id: "besar-angka", label: "ABCDEFG01234", chars: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" },
  { id: "besar", label: "ABCDEFGHIJKL", chars: "ABCDEFGHJKLMNPQRSTUVWXYZ" },
  { id: "angka", label: "0123456789", chars: "0123456789" },
];

const kode = (n: number, chars: string) =>
  Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

function VoucherPage() {
  const now = useNow();
  const plans = useRadiusPlans();
  const users = useRadiusUsers();
  const nas = useRadiusNas();
  const { hybrid } = useHybrid();
  const { creds } = useCreds();

  const syncKeRouter = async (list: HybridVoucher[]) => {
    if (!hybrid.enabled || !hybrid.syncVoucher || !list.length) return;
    const res = await pushVouchersToMikrotik(creds, list);
    if (res.ok) toast.success(`${res.created + res.updated} voucher tersimpan juga di MikroTik`);
    else toast.error(`Sinkron MikroTik gagal: ${res.errors[0] ?? "tidak diketahui"}`);
  };

  const hapusDiRouter = async (usernames: string[]) => {
    if (!hybrid.enabled || !hybrid.syncVoucher || !usernames.length) return;
    const res = await removeVouchersFromMikrotik(creds, usernames);
    if (!res.ok) toast.error(`Hapus di MikroTik gagal: ${res.errors[0] ?? "tidak diketahui"}`);
  };

  const delUsers = useRadiusMutation((usernames: string[]) =>
    radiusDeleteUsers({ data: { usernames } }),
  );
  const delExpired = useRadiusMutation(() => radiusDeleteExpired({}));
  const reactivate = useRadiusMutation((usernames: string[]) =>
    radiusReactivateUsers({ data: { usernames } }),
  );
  const createUsers = useRadiusMutation(
    (payload: Parameters<typeof radiusCreateUsers>[0]["data"]) =>
      radiusCreateUsers({ data: payload }),
  );

  const [vPlan, setVPlan] = useState("");
  const [vJumlah, setVJumlah] = useState("10");
  const [vPanjang, setVPanjang] = useState("6");
  const [vBatch, setVBatch] = useState("");
  const [vPrefix, setVPrefix] = useState("");
  const [vPaid, setVPaid] = useState<"paid" | "unpaid">("paid");
  const [vChar, setVChar] = useState("campur");
  const [vNas, setVNas] = useState("semua");
  const [vMode, setVMode] = useState<"sama" | "beda">("sama");
  const [vPhone, setVPhone] = useState("");

  // form tambah user manual
  const [mUser, setMUser] = useState("");
  const [mPass, setMPass] = useState("");
  const [mPlan, setMPlan] = useState("");
  const [mNas, setMNas] = useState("semua");
  const [mPaid, setMPaid] = useState<"paid" | "unpaid">("paid");
  const [mService, setMService] = useState<"hotspot" | "pppoe">("hotspot");
  const [mPhone, setMPhone] = useState("");

  /** Paket bulanan (masa aktif >= 30 hari) butuh nomor WhatsApp untuk kirim tagihan. */
  const bulanan = (nama: string) => {
    const p = (plans.data ?? []).find((x) => x.name === nama);
    return (p?.validity_seconds ?? 0) >= 30 * 86400 - 3600;
  };

  const [cari, setCari] = useState("");
  const [filter, setFilter] = useState("semua");
  const [filterPlan, setFilterPlan] = useState("semua");
  const [pilih, setPilih] = useState<Record<string, boolean>>({});

  const daftar = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (users.data ?? []).filter((u) => {
      if (q && !u.username.toLowerCase().includes(q)) return false;
      if (filterPlan !== "semua" && u.plan !== filterPlan) return false;
      const expired = isRadiusExpired(u, now);
      if (filter === "online") return u.online > 0;
      if (filter === "belum") return !u.first_login;
      if (filter === "terpakai") return !!u.first_login && !expired;
      if (filter === "expired") return expired;
      if (filter === "paid") return u.paid !== 0;
      if (filter === "unpaid") return u.paid === 0;
      return true;
    });
  }, [users.data, cari, filter, filterPlan, now]);

  const [templates, setTemplates] = useState<VoucherTemplate[]>([TEMPLATE_DEFAULT]);
  const [tplId, setTplId] = useState("default");
  useEffect(() => {
    const l = loadTemplates();
    setTemplates(l);
    setTplId(l[0]?.id ?? "default");
  }, []);

  const [printOpen, setPrintOpen] = useState(false);
  const [perRow, setPerRow] = useState("3");
  const [antrian, setAntrian] = useState<
    { username: string; password: string; plan: string; price: number }[]
  >([]);

  const bukaCetak = (
    list: { username: string; password: string; plan: string; price: number }[],
  ) => {
    setAntrian(list);
    setPrintOpen(true);
  };

  const cetakSekarang = () => {
    const t = templates.find((x) => x.id === tplId) ?? templates[0] ?? TEMPLATE_DEFAULT;
    const kolom = Math.max(1, Math.min(10, Number(perRow) || 1));
    const data = antrian.slice(0, 500).map((u, i) => {
      const p = (plans.data ?? []).find((x) => x.name === u.plan);
      return {
        no: i + 1,
        username: u.username,
        password: u.password,
        profile: u.plan,
        price: u.price || p?.price || 0,
        uptime: p?.validity_seconds ? formatDuration(p.validity_seconds) : "-",
        validity: p?.validity_seconds ? formatDuration(p.validity_seconds) : "-",
        quota: p?.rate_limit || "-",
      };
    });
    if (!printVouchers(t, data, kolom)) toast.error("Izinkan popup untuk mencetak");
    else setPrintOpen(false);
  };

  const tampil = useMemo(() => daftar.slice(0, 300), [daftar]);
  const terpilih = useMemo(() => tampil.filter((u) => pilih[u.username]), [tampil, pilih]);
  const semuaTerpilih = tampil.length > 0 && terpilih.length === tampil.length;

  const togglePilih = (username: string, on: boolean) =>
    setPilih((p) => ({ ...p, [username]: on }));

  const toggleSemua = (on: boolean) =>
    setPilih(on ? Object.fromEntries(tampil.map((u) => [u.username, true])) : {});

  const cetak = () =>
    bukaCetak(
      (terpilih.length ? terpilih : tampil).map((u) => ({
        username: u.username,
        password: u.password,
        plan: u.plan,
        price: u.price,
      })),
    );

  return (
    <>
      <PageHeader
        title="Voucher & User"
        description="Generate voucher ke database RADIUS, kelola daftar user, dan cetak sesuai template."
        action={
          <Button
            variant="outline"
            onClick={() => {
              users.refetch();
              plans.refetch();
              nas.refetch();
            }}
          >
            <RefreshCw className="size-4" /> Muat Ulang
          </Button>
        }
      />

      <div className="space-y-6">
        <div className="panel p-5">
          <h2 className="mb-4 text-sm font-semibold">Generate Voucher ke Database</h2>
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <div className="flex min-w-0 flex-col gap-2">
              <Label>Paket</Label>
              <Select value={vPlan} onValueChange={setVPlan}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih paket" />
                </SelectTrigger>
                <SelectContent>
                  {(plans.data ?? []).map((p) => (
                    <SelectItem key={p.name} value={p.name}>
                      {p.name} · {formatIDR(p.price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="v-jml">Jumlah (maks 1000)</Label>
              <Input
                id="v-jml"
                inputMode="numeric"
                max={1000}
                value={vJumlah}
                onChange={(e) => setVJumlah(e.target.value)}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label>Karakter Voucher</Label>
              <Select value={vChar} onValueChange={setVChar}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KARAKTER.map((k) => (
                    <SelectItem key={k.id} value={k.id} className="mono-num">
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="v-pj">Panjang Kode</Label>
              <Input
                id="v-pj"
                inputMode="numeric"
                value={vPanjang}
                onChange={(e) => setVPanjang(e.target.value)}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="v-pre">Awalan</Label>
              <Input
                id="v-pre"
                placeholder="opsional"
                value={vPrefix}
                onChange={(e) => setVPrefix(e.target.value)}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="v-bt">Batch</Label>
              <Input
                id="v-bt"
                placeholder="otomatis tanggal"
                value={vBatch}
                onChange={(e) => setVBatch(e.target.value)}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label>NAS (Router)</Label>
              <Select value={vNas} onValueChange={setVNas}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semua">Semua NAS</SelectItem>
                  {(nas.data ?? []).map((n) => (
                    <SelectItem key={n.id} value={n.nasname}>
                      {n.shortname || n.nasname} · {n.nasname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label>Status Pembayaran</Label>
              <Select value={vPaid} onValueChange={(v) => setVPaid(v as "paid" | "unpaid")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Paid — pendapatan langsung dihitung</SelectItem>
                  <SelectItem value="unpaid">Unpaid — dihitung saat voucher login</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label>Model User</Label>
              <Select value={vMode} onValueChange={(v) => setVMode(v as "sama" | "beda")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sama">Username = Password</SelectItem>
                  <SelectItem value="beda">Username beda dengan Password</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-full flex justify-end pt-1 md:col-span-3 xl:col-span-6">
              <Button
                className="w-full sm:w-auto"
                disabled={!vPlan || createUsers.isPending}
                onClick={() => {
                  const p = (plans.data ?? []).find((x) => x.name === vPlan);
                  if (!p) return;
                  const n = Math.max(1, Math.min(1000, Number(vJumlah) || 1));
                  const len = Math.max(4, Math.min(12, Number(vPanjang) || 6));
                  const batch = vBatch.trim() || new Date().toISOString().slice(0, 10);
                  const chars = KARAKTER.find((k) => k.id === vChar)?.chars ?? KARAKTER[0]!.chars;
                  const list = Array.from({ length: n }, () => {
                    const c = `${vPrefix.trim()}${kode(len, chars)}`;
                    return {
                      username: c,
                      password: vMode === "sama" ? c : kode(len, chars),

                      plan: p.name,
                      batch,
                      price: p.price,
                      service: p.service,
                      paid: vPaid === "paid",
                      nas: vNas === "semua" ? "" : vNas,
                    };
                  });
                  createUsers.mutate(
                    { users: list },
                    {
                      onSuccess: (r) => {
                        toast.success(`${(r as { created: number }).created} voucher dibuat`);
                        void syncKeRouter(
                          list.map((u) => ({
                            username: u.username,
                            password: u.password,
                            plan: u.plan,
                            batch: u.batch,
                            service: u.service,
                          })),
                        );
                        bukaCetak(
                          list.map((u) => ({
                            username: u.username,
                            password: u.password,
                            plan: u.plan,
                            price: u.price,
                          })),
                        );
                      },
                      onError: (e: Error) => toast.error(e.message),
                    },
                  );
                }}
              >
                <Plus className="size-4" />
                {createUsers.isPending ? "Membuat…" : "Generate"}
              </Button>
            </div>
          </div>
        </div>

        <div className="panel p-5">
          <h2 className="mb-4 text-sm font-semibold">Tambah User Manual</h2>
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <div className="flex min-w-0 flex-col gap-2">
              <Label>Layanan</Label>
              <Select
                value={mService}
                onValueChange={(v) => {
                  setMService(v as "hotspot" | "pppoe");
                  setMPlan("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hotspot">Hotspot</SelectItem>
                  <SelectItem value="pppoe">PPPoE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="m-user">Username</Label>
              <Input id="m-user" value={mUser} onChange={(e) => setMUser(e.target.value)} />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor="m-pass">Password</Label>
              <Input id="m-pass" value={mPass} onChange={(e) => setMPass(e.target.value)} />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label>Paket</Label>
              <Select value={mPlan} onValueChange={setMPlan}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih paket" />
                </SelectTrigger>
                <SelectContent>
                  {(plans.data ?? [])
                    .filter((p) => p.service === mService)
                    .map((p) => (
                      <SelectItem key={p.name} value={p.name}>
                        {p.name} · {formatIDR(p.price)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex min-w-0 flex-col gap-2">
              <Label>NAS (Router)</Label>
              <Select value={mNas} onValueChange={setMNas}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semua">Semua NAS</SelectItem>
                  {(nas.data ?? []).map((n) => (
                    <SelectItem key={n.id} value={n.nasname}>
                      {n.shortname || n.nasname} · {n.nasname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label>Status Pembayaran</Label>
              <Select value={mPaid} onValueChange={(v) => setMPaid(v as "paid" | "unpaid")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-full flex justify-end pt-1">
              <Button
                className="w-full sm:w-auto"
                disabled={!mUser.trim() || !mPass.trim() || !mPlan || createUsers.isPending}
                onClick={() => {
                  const p = (plans.data ?? []).find((x) => x.name === mPlan);
                  if (!p) return;
                  createUsers.mutate(
                    {
                      users: [
                        {
                          username: mUser.trim(),
                          password: mPass.trim(),
                          plan: p.name,
                          batch: "manual",
                          price: p.price,
                          service: p.service,
                          paid: mPaid === "paid",
                          nas: mNas === "semua" ? "" : mNas,
                        },
                      ],
                    },
                    {
                      onSuccess: () => {
                        toast.success(`User ${mUser.trim()} dibuat`);
                        void syncKeRouter([
                          {
                            username: mUser.trim(),
                            password: mPass.trim(),
                            plan: p.name,
                            batch: "manual",
                            service: p.service,
                          },
                        ]);
                        setMUser("");
                        setMPass("");
                      },
                      onError: (e: Error) => toast.error(e.message),
                    },
                  );
                }}
              >
                <Plus className="size-4" /> Tambah User
              </Button>
            </div>
          </div>
        </div>

        <div className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
            <h2 className="text-sm font-semibold">Daftar User RADIUS ({daftar.length})</h2>
            <div className="flex flex-wrap gap-2">
              <Input
                className="w-52"
                placeholder="Cari kode voucher…"
                aria-label="Cari kode voucher"
                value={cari}
                onChange={(e) => setCari(e.target.value)}
              />
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semua">Semua status</SelectItem>
                  <SelectItem value="belum">Belum dipakai</SelectItem>
                  <SelectItem value="online">Sedang online</SelectItem>
                  <SelectItem value="terpakai">Terpakai</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterPlan} onValueChange={setFilterPlan}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Semua profile" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semua">Semua profile</SelectItem>
                  {(plans.data ?? []).map((p) => (
                    <SelectItem key={p.name} value={p.name}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="outline" onClick={cetak} disabled={!daftar.length}>
                <Printer className="size-4" />
                {terpilih.length ? `Cetak ${terpilih.length} Voucher` : "Cetak Voucher"}
              </Button>
              {terpilih.length > 0 && (
                <>
                  <Button
                    variant="outline"
                    onClick={() =>
                      reactivate.mutate(
                        terpilih.map((u) => u.username),
                        {
                          onSuccess: () => {
                            toast.success(`${terpilih.length} voucher diaktifkan kembali`);
                            setPilih({});
                          },
                          onError: (e: Error) => toast.error(e.message),
                        },
                      )
                    }
                  >
                    <RotateCcw className="size-4" /> Aktifkan Terpilih
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (!window.confirm(`Hapus ${terpilih.length} voucher terpilih?`)) return;
                      const dihapus = terpilih.map((u) => u.username);
                      delUsers.mutate(dihapus, {
                        onSuccess: () => {
                          toast.success(`${dihapus.length} voucher dihapus`);
                          void hapusDiRouter(dihapus);
                          setPilih({});
                        },
                        onError: (e: Error) => toast.error(e.message),
                      });
                    }}
                  >
                    <Trash2 className="size-4" /> Hapus Terpilih ({terpilih.length})
                  </Button>
                </>
              )}
              <Button
                variant="destructive"
                disabled={delExpired.isPending}
                onClick={() => {
                  if (!window.confirm("Hapus semua voucher yang sudah expired?")) return;
                  delExpired.mutate(undefined as never, {
                    onSuccess: (r) =>
                      toast.success(
                        `${(r as { deleted: number }).deleted} voucher expired dihapus`,
                      ),
                    onError: (e: Error) => toast.error(e.message),
                  });
                }}
              >
                <Trash2 className="size-4" />
                {delExpired.isPending ? "Menghapus…" : "Hapus Voucher Expired"}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Pilih semua user"
                      checked={semuaTerpilih}
                      onCheckedChange={(v) => toggleSemua(v === true)}
                    />
                  </TableHead>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Password</TableHead>
                  <TableHead>Paket</TableHead>
                  <TableHead>Layanan</TableHead>
                  <TableHead>Harga</TableHead>
                  <TableHead>Bayar</TableHead>
                  <TableHead>Login Pertama</TableHead>
                  <TableHead>Expired</TableHead>
                  <TableHead>Sisa Masa Aktif</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tampil.map((u, i) => {
                  const expired = isRadiusExpired(u, now);
                  const sisa = radiusRemainingSeconds(u, now);
                  return (
                    <TableRow
                      key={u.username}
                      data-state={pilih[u.username] ? "selected" : undefined}
                    >
                      <TableCell>
                        <Checkbox
                          aria-label={`Pilih ${u.username}`}
                          checked={!!pilih[u.username]}
                          onCheckedChange={(v) => togglePilih(u.username, v === true)}
                        />
                      </TableCell>
                      <TableCell className="mono-num text-xs text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell className="mono-num font-medium">{u.username}</TableCell>
                      <TableCell className="mono-num">{u.password}</TableCell>
                      <TableCell>{u.plan}</TableCell>
                      <TableCell className="text-xs uppercase">{u.service}</TableCell>
                      <TableCell className="mono-num">{formatIDR(u.price)}</TableCell>
                      <TableCell>
                        {u.paid === 0 ? (
                          <Badge variant="outline">Unpaid</Badge>
                        ) : (
                          <Badge className="bg-primary/15 text-primary">Paid</Badge>
                        )}
                      </TableCell>
                      <TableCell className="mono-num text-xs">
                        {formatDateTime(u.first_login ?? undefined)}
                      </TableCell>
                      <TableCell className="mono-num text-xs">
                        {formatDateTime(u.expires_at ?? undefined)}
                      </TableCell>
                      <TableCell className="mono-num text-xs">
                        {sisa === null ? "belum jalan" : sisa > 0 ? formatDuration(sisa) : "Habis"}
                      </TableCell>
                      <TableCell>
                        {expired ? (
                          <Badge variant="destructive">Expired</Badge>
                        ) : u.online > 0 ? (
                          <Badge className="bg-primary text-primary-foreground">Online</Badge>
                        ) : u.first_login ? (
                          <Badge variant="outline">Terpakai</Badge>
                        ) : (
                          <Badge variant="secondary">Belum dipakai</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {expired && (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Aktifkan kembali ${u.username}`}
                            title="Aktifkan kembali"
                            onClick={() =>
                              reactivate.mutate([u.username], {
                                onSuccess: () => toast.success(`${u.username} diaktifkan kembali`),
                                onError: (e: Error) => toast.error(e.message),
                              })
                            }
                          >
                            <RotateCcw className="size-4 text-primary" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Hapus ${u.username}`}
                          onClick={() => delUsers.mutate([u.username])}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {daftar.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={13} className="py-10 text-center text-muted-foreground">
                      Belum ada user di database RADIUS.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Print Voucher</DialogTitle>
            <DialogDescription>
              {antrian.length} voucher siap dicetak di kertas A4.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-3 items-center gap-3">
              <Label className="text-right">Template</Label>
              <div className="col-span-2">
                <Select value={tplId} onValueChange={setTplId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((x) => (
                      <SelectItem key={x.id} value={x.id}>
                        {x.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 items-center gap-3">
              <Label htmlFor="per-row" className="text-right">
                Voucher per Baris
              </Label>
              <Input
                id="per-row"
                className="col-span-2"
                inputMode="numeric"
                placeholder="mis. 3"
                value={perRow}
                onChange={(e) => setPerRow(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="destructive" onClick={() => setPrintOpen(false)}>
              Cancel
            </Button>
            <Button onClick={cetakSekarang} disabled={!antrian.length}>
              <Printer className="size-4" /> Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
