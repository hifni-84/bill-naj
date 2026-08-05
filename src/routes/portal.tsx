import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CreditCard,
  Gauge,
  QrCode,
  Search,
  ShoppingCart,
  Ticket,
  Wifi,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rupiah, statusLabel } from "@/lib/invoice-types";
import { invoiceLookup } from "@/lib/invoice.functions";
import { formatBytes, formatDuration, formatIDR } from "@/lib/mikrotik-types";
import { gatewayPublicGet, paymentCreate } from "@/lib/payment.functions";
import { orderCreate, orderStatusGet, portalPlansGet } from "@/lib/shop.functions";

export const Route = createFileRoute("/portal")({
  head: () => ({
    meta: [
      { title: "Portal Pelanggan — Cek Tagihan Internet" },
      {
        name: "description",
        content:
          "Cek tagihan perpanjangan internet Anda dengan memasukkan username hotspot atau PPPoE, lalu bayar lewat QRIS.",
      },
      { property: "og:title", content: "Portal Pelanggan — Cek Tagihan Internet" },
      {
        property: "og:description",
        content:
          "Masukkan username untuk melihat masa aktif dan tagihan perpanjangan paket 30 hari.",
      },
    ],
  }),
  component: PortalPage,
});

const tanggal = (v: string | null) =>
  v ? new Date(v).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-";

const durasi = (detik: number) => {
  const j = Math.floor(detik / 3600);
  const m = Math.floor((detik % 3600) / 60);
  return j > 0 ? `${j} jam ${m} menit` : `${m} menit`;
};

function PortalPage() {
  const [username, setUsername] = useState("");
  const [beliPhone, setBeliPhone] = useState("");
  const [kode, setKode] = useState("");
  const [jumlah, setJumlah] = useState<Record<string, number>>({});
  const qtyOf = (name: string) => jumlah[name] ?? 1;
  const setQty = (name: string, v: number) =>
    setJumlah((s) => ({ ...s, [name]: Math.min(50, Math.max(1, Math.round(v) || 1)) }));

  const paket = useQuery({ queryKey: ["portal-plans"], queryFn: () => portalPlansGet() });

  const pesan = useMutation({
    mutationFn: (plan: string) =>
      orderCreate({ data: { plan, phone: beliPhone.trim(), qty: qtyOf(plan) } }),
    onSuccess: (res) => {
      if (res.ok && res.url) {
        try {
          window.localStorage.setItem("najwa-order", res.code);
        } catch {
          /* storage diblokir */
        }
        window.location.href = res.url;
      }
    },
  });

  const cekOrder = useMutation({
    mutationFn: (c: string) => orderStatusGet({ data: { code: c } }),
  });

  // Sepulang dari halaman pembayaran, tampilkan voucher yang sudah dibeli.
  const autoOrder = useRef(false);
  useEffect(() => {
    if (autoOrder.current) return;
    autoOrder.current = true;
    let c = "";
    try {
      c = window.localStorage.getItem("najwa-order") ?? "";
    } catch {
      c = "";
    }
    if (c) {
      setKode(c);
      cekOrder.mutate(c);
    }
  }, [cekOrder]);

  const order = cekOrder.data?.order ?? null;

  const cek = useMutation({
    mutationFn: (u: string) => invoiceLookup({ data: { username: u } }),
  });

  // Link dari pesan WhatsApp: /portal?u=username -> langsung tampilkan tagihan.
  const auto = useRef(false);
  useEffect(() => {
    if (auto.current) return;
    const u = new URLSearchParams(window.location.search).get("u")?.trim();
    if (u) {
      auto.current = true;
      setUsername(u);
      cek.mutate(u);
    }
  }, [cek]);

  const gw = useQuery({ queryKey: ["gateway-public"], queryFn: () => gatewayPublicGet() });
  const online = (gw.data?.provider ?? "none") !== "none";
  const gwLabel = gw.data?.provider === "midtrans" ? "Midtrans" : "Tripay";

  const bayar = useMutation({
    mutationFn: (id: number) => paymentCreate({ data: { id, username: username.trim() } }),
    onSuccess: (res) => {
      if (res.ok && res.url) window.location.href = res.url;
    },
  });

  const hasil = cek.data;
  const belum = (hasil?.invoices ?? []).filter((i) => i.status === "unpaid");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="mb-8 text-center">
        <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
          <Wifi className="size-6" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">Portal Pelanggan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Masukkan username hotspot / PPPoE Anda untuk melihat masa aktif dan tagihan.
        </p>
      </div>

      <form
        className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (username.trim()) cek.mutate(username.trim());
        }}
      >
        <div className="grid flex-1 gap-2">
          <Label htmlFor="u">Username</Label>
          <Input
            id="u"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="contoh: najwa01"
            autoFocus
          />
        </div>
        <Button type="submit" disabled={cek.isPending || !username.trim()}>
          <Search className="size-4" /> {cek.isPending ? "Mencari..." : "Submit"}
        </Button>
      </form>

      {(paket.data?.plans.length ?? 0) > 0 && (
        <div className="panel mt-5 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingCart className="size-4 text-primary" /> Beli Voucher Baru
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pilih paket, bayar online, lalu username &amp; password voucher muncul otomatis di
            halaman ini.
          </p>
          <div className="mt-4 grid gap-2">
            <Label htmlFor="wa">No. WhatsApp (opsional — voucher dikirim ke WhatsApp)</Label>
            <Input
              id="wa"
              inputMode="numeric"
              placeholder="08xxxxxxxxxx"
              value={beliPhone}
              onChange={(e) => setBeliPhone(e.target.value)}
            />
          </div>
          <ul className="mt-4 grid gap-3">
            {paket.data?.plans.map((p) => (
              <li
                key={p.name}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="mono-num text-xs text-muted-foreground">
                    {p.rate_limit || "-"} · {formatDuration(p.validity_seconds)} ·{" "}
                    {p.service.toUpperCase()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="mono-num text-sm font-semibold text-primary">
                    {formatIDR(p.price * qtyOf(p.name))}
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    aria-label={`Jumlah voucher ${p.name}`}
                    className="mono-num h-9 w-16 text-center"
                    value={qtyOf(p.name)}
                    onChange={(e) => setQty(p.name, Number(e.target.value))}
                  />
                  <Button size="sm" disabled={pesan.isPending} onClick={() => pesan.mutate(p.name)}>
                    <CreditCard className="size-4" />{" "}
                    {pesan.isPending ? "Memproses..." : `Beli ${qtyOf(p.name)}x`}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {pesan.data && !pesan.data.ok && (
            <p className="mt-3 text-sm text-destructive">{pesan.data.error}</p>
          )}

          <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-end">
            <div className="grid flex-1 gap-2">
              <Label htmlFor="ord">Kode Pesanan</Label>
              <Input
                id="ord"
                value={kode}
                onChange={(e) => setKode(e.target.value.toUpperCase())}
                placeholder="contoh: VABC12345"
              />
            </div>
            <Button
              variant="outline"
              disabled={!kode.trim() || cekOrder.isPending}
              onClick={() => cekOrder.mutate(kode.trim())}
            >
              <Ticket className="size-4" /> Cek Voucher
            </Button>
          </div>

          {cekOrder.data && !order && (
            <p className="mt-3 text-sm text-muted-foreground">Kode pesanan tidak ditemukan.</p>
          )}
          {order && (
            <div className="mt-4 rounded-lg border border-border bg-secondary/60 p-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Pesanan {order.code} — {order.plan} ({order.qty}x)
              </p>
              {order.status === "paid" ? (
                <ul className="mono-num mt-2 grid gap-1 text-sm">
                  {order.vouchers.map((v, i) => (
                    <li key={v.username} className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">{i + 1}.</span>
                      <span className="font-semibold text-primary">{v.username}</span>
                      <span className="text-muted-foreground">/</span>
                      <span className="font-semibold text-primary">{v.password}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-2">
                  <p className="text-sm text-muted-foreground">
                    Menunggu pembayaran {formatIDR(order.amount)}. Voucher muncul otomatis setelah
                    pembayaran terverifikasi.
                  </p>
                  {order.pay_url && (
                    <Button asChild size="sm" className="mt-3">
                      <a href={order.pay_url}>
                        <CreditCard className="size-4" /> Lanjutkan Pembayaran
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {hasil && !hasil.found && (
        <p className="panel mt-5 p-5 text-center text-sm text-muted-foreground">
          Username tidak ditemukan. Periksa kembali atau hubungi admin.
        </p>
      )}

      {hasil?.found && (
        <div className="mt-5 grid gap-5">
          <div className="panel p-5">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Paket Aktif</p>
            <p className="mt-1 text-lg font-semibold">{hasil.plan || "-"}</p>
            <p className="mono-num mt-2 text-sm text-muted-foreground">
              Masa aktif sampai: {tanggal(hasil.expires_at)}
            </p>
          </div>

          <div className="panel p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Gauge className="size-4 text-primary" /> Total Pemakaian Kuota
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ArrowDownToLine className="size-3.5" /> Download
                </p>
                <p className="mono-num mt-1 text-base font-semibold">
                  {formatBytes(hasil.usage?.download ?? 0)}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ArrowUpFromLine className="size-3.5" /> Upload
                </p>
                <p className="mono-num mt-1 text-base font-semibold">
                  {formatBytes(hasil.usage?.upload ?? 0)}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-secondary/60 p-3">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="mono-num mt-1 text-base font-semibold text-primary">
                  {formatBytes(hasil.usage?.total ?? 0)}
                </p>
              </div>
            </div>
            <p className="mono-num mt-3 text-xs text-muted-foreground">
              Total durasi pemakaian: {durasi(hasil.usage?.sessionTime ?? 0)}
            </p>
          </div>

          <div className="panel overflow-hidden">
            <h2 className="border-b border-border p-4 text-sm font-semibold">Tagihan Anda</h2>
            <ul className="divide-y divide-border">
              {hasil.invoices.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{i.plan}</p>
                    <p className="mono-num text-xs text-muted-foreground">
                      Jatuh tempo {tanggal(i.due_date)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="mono-num text-sm font-semibold text-primary">
                      {rupiah(i.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">{statusLabel[i.status]}</p>
                    {online && i.status === "unpaid" && (
                      <Button
                        size="sm"
                        className="mt-2"
                        disabled={bayar.isPending}
                        onClick={() => bayar.mutate(i.id)}
                      >
                        <CreditCard className="size-4" />{" "}
                        {bayar.isPending ? "Memproses..." : `Bayar via ${gwLabel}`}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
              {hasil.invoices.length === 0 && (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  Belum ada tagihan. Tagihan muncul otomatis sehari sebelum masa aktif habis.
                </li>
              )}
            </ul>
          </div>

          {belum.length > 0 && (
            <div className="panel p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <QrCode className="size-4 text-primary" /> Cara Pembayaran
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Total yang harus dibayar:{" "}
                <span className="mono-num font-semibold text-primary">
                  {rupiah(belum.reduce((s, i) => s + Number(i.amount || 0), 0))}
                </span>
              </p>
              {online && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Pembayaran otomatis tersedia via <span className="font-medium">{gwLabel}</span>{" "}
                  (QRIS, virtual account, e-wallet). Masa aktif diperpanjang otomatis setelah
                  pembayaran berhasil.
                </p>
              )}
              {bayar.data && !bayar.data.ok && (
                <p className="mt-2 text-sm text-destructive">{bayar.data.error}</p>
              )}
              {hasil.pay.qrisUrl ? (
                <img
                  src={hasil.pay.qrisUrl}
                  alt={`QRIS pembayaran ${hasil.pay.merchant}`}
                  loading="lazy"
                  className="mt-4 w-full max-w-xs rounded-lg border border-border bg-white p-2"
                />
              ) : null}
              {hasil.pay.payInfo && (
                <p className="mt-4 whitespace-pre-line text-sm text-muted-foreground">
                  {hasil.pay.payInfo}
                </p>
              )}
              {hasil.pay.whatsapp && (
                <Button asChild variant="outline" className="mt-4">
                  <a
                    href={`https://wa.me/${hasil.pay.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
                      `Konfirmasi pembayaran internet untuk username ${username.trim()}`,
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Konfirmasi via WhatsApp
                  </a>
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
