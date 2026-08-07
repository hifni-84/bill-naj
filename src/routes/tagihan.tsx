import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Ban,
  ExternalLink,
  MessageCircle,
  Printer,
  RefreshCw,
  Send,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/Shared";
import { ManualInvoiceDialog, printInvoice } from "@/components/ManualInvoiceDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { rupiah, statusLabel, type InvoiceStatus } from "@/lib/invoice-types";
import {
  invoiceCancel,
  invoiceDelete,
  invoiceGenerate,
  invoiceList,
  invoiceOptionsGet,
  invoicePay,
} from "@/lib/invoice.functions";
import { waPhoneSave, waSendInvoice, waSendUnpaid } from "@/lib/wa.functions";

export const Route = createFileRoute("/tagihan")({
  head: () => ({
    meta: [
      { title: "Tagihan Otomatis — NAJWA_BILLING" },
      {
        name: "description",
        content:
          "Tagihan otomatis paket 30 hari dibuat H-1 sebelum expired: pantau status bayar dan perpanjang masa aktif pelanggan.",
      },
      { property: "og:title", content: "Tagihan Otomatis — NAJWA_BILLING" },
      {
        property: "og:description",
        content:
          "Kelola tagihan perpanjangan paket 30 hari hotspot & PPPoE beserta konfirmasi pembayaran.",
      },
    ],
  }),
  component: TagihanPage,
});

const badge: Record<InvoiceStatus, string> = {
  unpaid: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  paid: "border-primary/40 bg-primary/10 text-primary",
  cancelled: "border-border bg-secondary text-muted-foreground",
};

const tanggal = (v: string | null) =>
  v ? new Date(v).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-";

function TagihanPage() {
  const qc = useQueryClient();
  const [cari, setCari] = useState("");
  const [hp, setHp] = useState<Record<string, string>>({});

  const list = useQuery({
    queryKey: ["invoices"],
    queryFn: () => invoiceList(),
    refetchInterval: 60_000,
  });

  const opt = useQuery({ queryKey: ["invoice-options"], queryFn: () => invoiceOptionsGet() });
  const payInfo = {
    merchant: opt.data?.options.merchant ?? "",
    logoUrl: opt.data?.options.logoUrl ?? "",
    payInfo: opt.data?.options.payInfo ?? "",
    whatsapp: opt.data?.options.whatsapp ?? "",
    qrisUrl: opt.data?.options.qrisUrl ?? "",
  };

  const refresh = () => qc.invalidateQueries({ queryKey: ["invoices"] });

  const buat = useMutation({
    mutationFn: () => invoiceGenerate(),
    onSuccess: (r) => {
      if (r.error) toast.error(r.error);
      else if (r.skipped) toast.error("Tagihan otomatis belum diaktifkan di Pengaturan");
      else
        toast.success(
          `${r.created} tagihan baru dibuat${r.waSent ? `, ${r.waSent} pesan WA terkirim` : ""}`,
        );
      refresh();
    },
  });

  const kirimWa = useMutation({
    mutationFn: (v: { id: number; phone?: string }) => waSendInvoice({ data: v }),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Tagihan dikirim ke WhatsApp ${r.phone}`);
      else toast.error(r.error ?? "Gagal mengirim WhatsApp");
    },
  });

  const kirimSemua = useMutation({
    mutationFn: () => waSendUnpaid(),
    onSuccess: (r) => {
      if (r.error) toast.error(r.error);
      else if (r.skipped) toast.error("WhatsApp gateway belum diaktifkan di Pengaturan");
      else
        toast.success(
          `${r.sent} pesan terkirim${r.failed ? `, ${r.failed} gagal: ${r.errors.join("; ")}` : ""}`,
        );
    },
  });

  const simpanHp = useMutation({
    mutationFn: (v: { username: string; phone: string }) => waPhoneSave({ data: v }),
    onSuccess: (r) => {
      if (r.ok) toast.success("Nomor WhatsApp disimpan");
      else toast.error(r.error ?? "Gagal menyimpan nomor");
      refresh();
    },
  });

  const bayar = useMutation({
    mutationFn: (id: number) => invoicePay({ data: { id } }),
    onSuccess: (r) => {
      if ("error" in r && r.error) toast.error(r.error);
      else toast.success("Tagihan lunas, masa aktif diperpanjang");
      refresh();
    },
  });

  const batal = useMutation({
    mutationFn: (id: number) => invoiceCancel({ data: { id } }),
    onSuccess: () => {
      toast.success("Tagihan dibatalkan");
      refresh();
    },
  });

  const hapus = useMutation({
    mutationFn: (id: number) => invoiceDelete({ data: { id } }),
    onSuccess: () => {
      toast.success("Tagihan dihapus");
      refresh();
    },
  });

  const rows = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const all = list.data?.invoices ?? [];
    return q
      ? all.filter((i) => i.username.toLowerCase().includes(q) || i.plan.toLowerCase().includes(q))
      : all;
  }, [list.data, cari]);

  const unpaid = rows.filter((i) => i.status === "unpaid");
  const totalUnpaid = unpaid.reduce((s, i) => s + Number(i.amount || 0), 0);

  return (
    <>
      <PageHeader
        title="Tagihan Otomatis"
        description={`Dibuat otomatis H-1 sebelum paket 30 hari expired. Belum dibayar: ${unpaid.length} tagihan.`}
        action={
          <div className="flex flex-wrap gap-2">
            <ManualInvoiceDialog onCreated={refresh} />
            <Button variant="outline" asChild>
              <a href="/portal" target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" /> Portal Pelanggan
              </a>
            </Button>
            <Button variant="outline" onClick={() => buat.mutate()} disabled={buat.isPending}>
              <Zap className="size-4" /> {buat.isPending ? "Memproses..." : "Buat Sekarang"}
            </Button>
            <Button
              variant="outline"
              onClick={() => kirimSemua.mutate()}
              disabled={kirimSemua.isPending}
            >
              <MessageCircle className="size-4" />
              {kirimSemua.isPending ? "Mengirim..." : "Kirim WA Semua"}
            </Button>
            <Button variant="outline" onClick={refresh}>
              <RefreshCw className="size-4" /> Muat Ulang
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="panel p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Belum Dibayar</p>
          <p className="mono-num mt-2 text-2xl font-semibold text-amber-400">{unpaid.length}</p>
        </div>
        <div className="panel p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Nilai Tertagih</p>
          <p className="mono-num mt-2 text-2xl font-semibold text-primary">{rupiah(totalUnpaid)}</p>
        </div>
        <div className="panel p-5">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Total Tagihan</p>
          <p className="mono-num mt-2 text-2xl font-semibold">{rows.length}</p>
        </div>
      </div>

      <div className="panel mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <h2 className="text-sm font-semibold">Daftar Tagihan</h2>
          <Input
            placeholder="Cari username / paket"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            className="w-full sm:w-64"
          />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Paket</TableHead>
                <TableHead>Layanan</TableHead>
                <TableHead>No. WhatsApp</TableHead>
                <TableHead className="text-right">Nominal</TableHead>
                <TableHead>Jatuh Tempo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="mono-num font-medium">{i.username}</TableCell>
                  <TableCell className="max-w-[10rem] truncate">{i.plan}</TableCell>
                  <TableCell className="uppercase text-xs text-muted-foreground">
                    {i.service}
                  </TableCell>
                  <TableCell>
                    <Input
                      className="mono-num h-8 w-36 text-xs"
                      placeholder="6281..."
                      value={hp[i.username] ?? i.phone ?? ""}
                      onChange={(e) => setHp({ ...hp, [i.username]: e.target.value })}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (i.phone ?? "")) {
                          simpanHp.mutate({ username: i.username, phone: v });
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell className="mono-num text-right">{rupiah(i.amount)}</TableCell>
                  <TableCell className="mono-num text-xs">{tanggal(i.due_date)}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${badge[i.status]}`}
                    >
                      {statusLabel[i.status]}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => printInvoice(i, payInfo)}
                        title="Cetak invoice"
                      >
                        <Printer className="size-4" />
                      </Button>
                      {i.status === "unpaid" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              kirimWa.mutate({ id: i.id, phone: hp[i.username] || i.phone || "" })
                            }
                            disabled={kirimWa.isPending}
                            title="Kirim tagihan ke WhatsApp pelanggan"
                          >
                            <Send className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => bayar.mutate(i.id)}
                            disabled={bayar.isPending}
                            title="Tandai lunas & perpanjang"
                          >
                            <BadgeCheck className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => batal.mutate(i.id)}
                            title="Batalkan"
                          >
                            <Ban className="size-4" />
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => hapus.mutate(i.id)}
                        title="Hapus"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    {list.isLoading
                      ? "Memuat tagihan..."
                      : "Belum ada tagihan. Aktifkan tagihan otomatis di Pengaturan."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
