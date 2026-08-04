import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CreditCard, QrCode, Search, Wifi } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rupiah, statusLabel } from "@/lib/invoice-types";
import { invoiceLookup } from "@/lib/invoice.functions";
import { gatewayPublicGet, paymentCreate } from "@/lib/payment.functions";

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
        content: "Masukkan username untuk melihat masa aktif dan tagihan perpanjangan paket 30 hari.",
      },
    ],
  }),
  component: PortalPage,
});

const tanggal = (v: string | null) =>
  v ? new Date(v).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-";

function PortalPage() {
  const [username, setUsername] = useState("");

  const cek = useMutation({
    mutationFn: (u: string) => invoiceLookup({ data: { username: u } }),
  });

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
          <Search className="size-4" /> {cek.isPending ? "Mencari..." : "Cek Tagihan"}
        </Button>
      </form>

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
