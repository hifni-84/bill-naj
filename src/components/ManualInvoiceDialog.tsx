import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { FilePlus2, ImageUp, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { logoRemove, logoUpload } from "@/lib/brand.functions";
import {
  defaultInvoiceMessage,
  renderInvoiceMessage,
  rupiah,
  type Invoice,
  type InvoiceOptions,
} from "@/lib/invoice-types";
import { invoiceCreateManual, invoiceOptionsGet } from "@/lib/invoice.functions";

/** Cetak invoice pada jendela baru (logo + pesan editable). */
export function printInvoice(
  inv: Pick<Invoice, "id" | "username" | "plan" | "amount" | "due_date"> & { message?: string },
  opt: Pick<InvoiceOptions, "merchant" | "logoUrl" | "payInfo" | "whatsapp" | "qrisUrl">,
) {
  const tanggal = inv.due_date
    ? new Date(inv.due_date).toLocaleDateString("id-ID", { dateStyle: "long" })
    : "-";
  const pesan = renderInvoiceMessage(inv.message || defaultInvoiceMessage, {
    nama: inv.username,
    paket: inv.plan,
    nominal: Number(inv.amount || 0),
    jatuh_tempo: tanggal,
    merchant: opt.merchant,
  });
  const esc = (s: string) =>
    String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8">
<title>Invoice #${inv.id} - ${esc(opt.merchant)}</title>
<style>
 *{box-sizing:border-box}
 body{font-family:ui-sans-serif,system-ui,Arial,sans-serif;color:#111;margin:0;padding:32px}
 .head{display:flex;align-items:center;gap:16px;border-bottom:2px solid #111;padding-bottom:16px}
 .head img{max-height:64px;max-width:180px;object-fit:contain}
 h1{font-size:20px;margin:0}
 .muted{color:#555;font-size:12px}
 table{width:100%;border-collapse:collapse;margin-top:24px;font-size:14px}
 th,td{border:1px solid #ccc;padding:8px 10px;text-align:left}
 th{background:#f3f4f6}
 .total{text-align:right;font-size:16px;font-weight:700;margin-top:12px}
 pre{white-space:pre-wrap;font-family:inherit;font-size:13px;background:#f9fafb;border:1px solid #e5e7eb;padding:12px;border-radius:8px;margin-top:20px}
 .qris{margin-top:20px}.qris img{max-width:180px}
 @media print{body{padding:0}}
</style></head><body>
<div class="head">
  ${opt.logoUrl ? `<img src="${esc(opt.logoUrl)}" alt="Logo ${esc(opt.merchant)}">` : ""}
  <div><h1>${esc(opt.merchant)}</h1><p class="muted">INVOICE #${inv.id}</p></div>
</div>
<table>
  <tr><th style="width:35%">Pelanggan</th><td>${esc(inv.username)}</td></tr>
  <tr><th>Paket / Keterangan</th><td>${esc(inv.plan)}</td></tr>
  <tr><th>Jatuh Tempo</th><td>${esc(tanggal)}</td></tr>
  <tr><th>Nominal</th><td>${esc(rupiah(Number(inv.amount || 0)))}</td></tr>
</table>
<p class="total">Total: ${esc(rupiah(Number(inv.amount || 0)))}</p>
<pre>${esc(pesan)}</pre>
${opt.payInfo ? `<pre>${esc(opt.payInfo)}</pre>` : ""}
${opt.qrisUrl ? `<div class="qris"><p class="muted">Scan QRIS untuk bayar</p><img src="${esc(opt.qrisUrl)}" alt="QRIS"></div>` : ""}
${opt.whatsapp ? `<p class="muted">Konfirmasi pembayaran: ${esc(opt.whatsapp)}</p>` : ""}
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
</body></html>`;
  const w = window.open("", "_blank", "width=780,height=900");
  if (!w) {
    toast.error("Popup diblokir browser, izinkan popup untuk mencetak invoice");
    return;
  }
  w.document.write(html);
  w.document.close();
}

export function ManualInvoiceDialog({ onCreated }: { onCreated?: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [plan, setPlan] = useState("");
  const [service, setService] = useState<"hotspot" | "pppoe">("pppoe");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(defaultInvoiceMessage);
  const [logoBusy, setLogoBusy] = useState(false);

  const opt = useQuery({ queryKey: ["invoice-options"], queryFn: () => invoiceOptionsGet() });
  const options = opt.data?.options;

  useEffect(() => {
    if (options?.invoiceMessage) setMessage(options.invoiceMessage);
  }, [options?.invoiceMessage]);

  const uploadLogo = async (file: File) => {
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Ukuran logo maksimal 3 MB");
      return;
    }
    setLogoBusy(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
        fr.onerror = () => reject(new Error("Gagal membaca file"));
        fr.readAsDataURL(file);
      });
      const res = await logoUpload({ data: { mime: file.type, base64 } });
      if (!res.ok) {
        toast.error(res.error || "Gagal mengunggah logo");
        return;
      }
      await qc.invalidateQueries({ queryKey: ["invoice-options"] });
      toast.success("Logo invoice berhasil diunggah");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLogoBusy(false);
    }
  };

  const hapusLogo = async () => {
    setLogoBusy(true);
    const res = await logoRemove({});
    setLogoBusy(false);
    if (!res.ok) {
      toast.error(res.error || "Gagal menghapus logo");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["invoice-options"] });
    toast.success("Logo dihapus");
  };

  const buat = useMutation({
    mutationFn: () =>
      invoiceCreateManual({
        data: {
          username,
          plan,
          service,
          amount: Number(amount),
          dueDate,
          message,
          phone,
          note: "Invoice manual",
        },
      }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.error || "Gagal membuat invoice");
        return;
      }
      toast.success(`Invoice manual #${r.id} dibuat`);
      printInvoice(
        {
          id: r.id,
          username,
          plan: plan || "Manual",
          amount: Number(amount),
          due_date: new Date(dueDate).toISOString(),
          message,
        },
        {
          merchant: options?.merchant ?? "",
          logoUrl: options?.logoUrl ?? "",
          payInfo: options?.payInfo ?? "",
          whatsapp: options?.whatsapp ?? "",
          qrisUrl: options?.qrisUrl ?? "",
        },
      );
      setOpen(false);
      setUsername("");
      setPlan("");
      setAmount("");
      setPhone("");
      onCreated?.();
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FilePlus2 className="size-4" /> Invoice Manual
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Buat Invoice Manual</DialogTitle>
          <DialogDescription>
            Buat tagihan sendiri dengan logo usaha dan pesan yang bisa diedit, lalu langsung cetak.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center gap-3">
              {options?.logoUrl ? (
                <img
                  src={options.logoUrl}
                  alt="Logo invoice"
                  className="h-12 w-auto max-w-[140px] rounded bg-secondary object-contain p-1"
                />
              ) : (
                <span className="text-xs text-muted-foreground">Belum ada logo</span>
              )}
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline" disabled={logoBusy}>
                  <label className="cursor-pointer">
                    <ImageUp className="size-4" /> {logoBusy ? "Mengunggah..." : "Unggah Logo"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadLogo(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </Button>
                {options?.logoUrl && (
                  <Button size="sm" variant="outline" onClick={hapusLogo} disabled={logoBusy}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Username / Nama Pelanggan</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Paket / Keterangan</Label>
              <Input
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                placeholder="Internet 10 Mbps"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nominal (Rp)</Label>
              <Input
                className="mono-num"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Jatuh Tempo</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Layanan</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={service}
                onChange={(e) => setService(e.target.value as "hotspot" | "pppoe")}
              >
                <option value="pppoe">PPPoE</option>
                <option value="hotspot">Hotspot</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>No. WhatsApp (opsional)</Label>
              <Input
                className="mono-num"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="6281..."
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Pesan Invoice</Label>
            <Textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Placeholder: {"{nama}"} {"{paket}"} {"{nominal}"} {"{jatuh_tempo}"} {"{merchant}"}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() =>
              printInvoice(
                {
                  id: 0,
                  username: username || "Pelanggan",
                  plan: plan || "Manual",
                  amount: Number(amount || 0),
                  due_date: new Date(dueDate).toISOString(),
                  message,
                },
                {
                  merchant: options?.merchant ?? "",
                  logoUrl: options?.logoUrl ?? "",
                  payInfo: options?.payInfo ?? "",
                  whatsapp: options?.whatsapp ?? "",
                  qrisUrl: options?.qrisUrl ?? "",
                },
              )
            }
          >
            <Printer className="size-4" /> Pratinjau
          </Button>
          <Button
            onClick={() => buat.mutate()}
            disabled={buat.isPending || !username.trim() || !Number(amount)}
          >
            {buat.isPending ? "Menyimpan..." : "Buat & Cetak"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
