import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Printer, Save, Trash2, Info } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildHtml,
  contohVoucher,
  KONSTANTA,
  loadTemplates,
  printVouchers,
  saveTemplates,
  TEMPLATE_DEFAULT,
  type VoucherTemplate,
} from "@/lib/voucher-template";

export const Route = createFileRoute("/template")({
  head: () => ({
    meta: [
      { title: "Template Voucher — NAJWA_BILLING" },
      {
        name: "description",
        content:
          "Buat dan ubah template cetak voucher hotspot dengan kode HTML sendiri, lengkap dengan konstanta kode voucher, harga, dan masa aktif.",
      },
      { property: "og:title", content: "Template Voucher — NAJWA_BILLING" },
      {
        property: "og:description",
        content: "Editor template cetak voucher hotspot berbasis HTML untuk billing RADIUS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TemplatePage,
});

function TemplatePage() {
  const [list, setList] = useState<VoucherTemplate[]>([TEMPLATE_DEFAULT]);
  const [aktif, setAktif] = useState("default");
  const [jml, setJml] = useState("4");

  useEffect(() => {
    const l = loadTemplates();
    setList(l);
    setAktif(l[0]?.id ?? "default");
  }, []);

  const t = list.find((x) => x.id === aktif) ?? list[0] ?? TEMPLATE_DEFAULT;

  const ubah = (patch: Partial<VoucherTemplate>) =>
    setList((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));

  const simpan = () => {
    saveTemplates(list);
    toast.success("Template disimpan");
  };

  const tambah = () => {
    const id = `tpl-${Date.now()}`;
    const baru = { ...TEMPLATE_DEFAULT, id, name: `template ${list.length + 1}` };
    const next = [...list, baru];
    setList(next);
    setAktif(id);
    saveTemplates(next);
  };

  const hapus = () => {
    if (list.length <= 1) {
      toast.error("Minimal satu template");
      return;
    }
    const next = list.filter((x) => x.id !== t.id);
    setList(next);
    setAktif(next[0]?.id ?? "default");
    saveTemplates(next);
  };

  const contoh = useMemo(() => {
    const n = Math.max(1, Math.min(50, Number(jml) || 1));
    return Array.from({ length: n }, (_, i) => contohVoucher(i + 1));
  }, [jml]);

  const preview = useMemo(() => buildHtml(t, contoh), [t, contoh]);

  return (
    <>
      <PageHeader
        title="Template Voucher"
        description="Rancang sendiri tampilan cetak voucher memakai kode HTML. Template dipakai saat mencetak voucher hasil generate."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={tambah}>
              <Plus className="size-4" /> Tambah
            </Button>
            <Button onClick={simpan}>
              <Save className="size-4" /> Simpan
            </Button>
          </div>
        }
      />

      <div className="panel mb-6 flex gap-3 p-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          Template terdiri dari <b>Header</b> (dicetak sekali di awal), <b>Row</b> (diulang untuk
          tiap voucher), dan <b>Footer</b> (penutup). Gunakan konstanta di bawah pada bagian Row.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="panel grid gap-4 p-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Pilih Template</Label>
              <Select value={aktif} onValueChange={setAktif}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {list.map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {x.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="t-nama">Nama Template</Label>
              <div className="flex gap-2">
                <Input
                  id="t-nama"
                  value={t.name}
                  onChange={(e) => ubah({ name: e.target.value })}
                />
                <Button variant="ghost" size="icon" aria-label="Hapus template" onClick={hapus}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          </div>

          {(
            [
              ["Header", "header"],
              ["Row (per voucher)", "row"],
              ["Footer", "footer"],
            ] as const
          ).map(([label, key]) => (
            <div key={key} className="panel p-4">
              <Label className="mb-2 block text-sm font-semibold">{label}</Label>
              <Textarea
                className="mono-num min-h-40 font-mono text-xs"
                value={t[key]}
                onChange={(e) => ubah({ [key]: e.target.value } as Partial<VoucherTemplate>)}
                spellCheck={false}
              />
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="panel p-4">
            <div className="mb-3 flex items-center gap-2">
              <Input
                className="w-24"
                inputMode="numeric"
                aria-label="Jumlah contoh"
                value={jml}
                onChange={(e) => setJml(e.target.value)}
              />
              <Button
                className="flex-1"
                onClick={() => {
                  if (!printVouchers(t, contoh)) toast.error("Izinkan popup untuk mencetak");
                }}
              >
                <Printer className="size-4" /> Uji Cetak
              </Button>
            </div>
            <iframe
              title="Pratinjau voucher"
              srcDoc={preview}
              className="h-80 w-full rounded-md border border-border bg-white"
            />
          </div>

          <div className="panel p-4">
            <h2 className="mb-3 text-sm font-semibold">Character Constants</h2>
            <ul className="space-y-2 text-xs">
              {KONSTANTA.map((k) => (
                <li key={k.code} className="flex gap-2">
                  <code className="mono-num shrink-0 rounded bg-secondary px-1.5 py-0.5 text-primary">
                    {k.code}
                  </code>
                  <span className="text-muted-foreground">{k.desc}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Data konstanta mengikuti paket voucher. Bila paket tidak punya datanya, hasilnya
              ditampilkan sebagai tanda “-”.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
