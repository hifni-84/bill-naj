/**
 * Template cetak voucher berbasis kode HTML (header / row / footer).
 * Tersimpan di localStorage browser sehingga bisa diubah kapan saja.
 */

export type VoucherTemplate = {
  id: string;
  name: string;
  header: string;
  row: string;
  footer: string;
};

export type VoucherData = {
  no: number;
  username: string;
  password: string;
  profile: string;
  price: number;
  uptime: string;
  validity: string;
  quota: string;
};

const KEY = "najwa_voucher_templates";

export const KONSTANTA: { code: string; desc: string }[] = [
  { code: "%no_urut%", desc: "Nomor urut voucher" },
  { code: "%username%", desc: "Username login" },
  { code: "%password%", desc: "Password login" },
  { code: "%uptime%", desc: "Batas waktu pemakaian sesi" },
  { code: "%validity%", desc: "Total masa aktif" },
  { code: "%quota%", desc: "Total batas pemakaian bandwidth" },
  { code: "%price%", desc: "Harga (angka saja, tanpa Rp)" },
  { code: "%profile%", desc: "Nama paket / profil yang dipakai" },
];

export const TEMPLATE_DEFAULT: VoucherTemplate = {
  id: "default",
  name: "default",
  header: `<html><head><meta charset="utf-8"><title>Voucher</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;margin:10px;background:#fff;color:#111}
  .wrap{display:flex;flex-wrap:wrap;gap:6px}
  .v{width:200px;border:1px dashed #999;border-radius:8px;padding:8px;box-sizing:border-box}
  .v .t{font-size:11px;font-weight:bold;text-align:center;border-bottom:1px solid #ccc;padding-bottom:3px;margin-bottom:5px}
  .v .code{font-size:20px;font-weight:bold;text-align:center;letter-spacing:1px;font-family:"Courier New",monospace}
  .v .price{font-size:13px;text-align:center;margin-top:2px}
  .v .meta{display:flex;justify-content:space-between;font-size:10px;margin-top:5px;border-top:1px solid #eee;padding-top:3px}
  @media print{ .v{page-break-inside:avoid} }
</style></head><body><div class="wrap">`,
  row: `<div class="v">
  <div class="t">KODE VOUCHER #%no_urut%</div>
  <div class="code">%username%</div>
  <div class="price">%price%</div>
  <div class="meta"><span>Masa aktif</span><span>%validity%</span></div>
  <div class="meta"><span>Kuota</span><span>%quota%</span></div>
  <div class="meta"><span>Paket</span><span>%profile%</span></div>
</div>`,
  footer: `</div></body></html>`,
};

export function loadTemplates(): VoucherTemplate[] {
  if (typeof window === "undefined") return [TEMPLATE_DEFAULT];
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as VoucherTemplate[]) : [];
    return list.length ? list : [TEMPLATE_DEFAULT];
  } catch {
    return [TEMPLATE_DEFAULT];
  }
}

export function saveTemplates(list: VoucherTemplate[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
}

function hargaAngka(n: number) {
  return new Intl.NumberFormat("id-ID").format(n || 0);
}

export function isiKonstanta(tpl: string, v: VoucherData) {
  return tpl
    .replaceAll("%no_urut%", String(v.no))
    .replaceAll("%username%", v.username)
    .replaceAll("%password%", v.password)
    .replaceAll("%uptime%", v.uptime || "-")
    .replaceAll("%validity%", v.validity || "-")
    .replaceAll("%quota%", v.quota || "-")
    .replaceAll("%price%", hargaAngka(v.price))
    .replaceAll("%profile%", v.profile || "-");
}

/** Gaya cetak kertas A4: 33 voucher per lembar (perRow kolom × baris otomatis). */
function gridA4(perRow: number) {
  const perPage = 33;
  const rows = Math.max(1, Math.ceil(perPage / perRow));
  return `<style>
  @page { size: A4; margin: 4mm; }
  body { margin: 0; }
  .najwa-a4 {
    display: grid;
    grid-template-columns: repeat(${perRow}, 1fr);
    grid-auto-rows: calc((297mm - 8mm) / ${rows});
    column-gap: 2mm;
    row-gap: 0;
    align-items: stretch;
  }
  .najwa-a4 > * {
    break-inside: avoid;
    page-break-inside: avoid;
    width: 100% !important;
    height: 100% !important;
    box-sizing: border-box !important;
    overflow: hidden;
    margin: 0 !important;
    padding: 1.5mm !important;
    border-radius: 0 !important;
    line-height: 1.1;
  }
  /* rapatkan isi voucher agar muat 33 per lembar */
  .najwa-a4 > * > * { margin: 0 !important; padding: 0 !important; }
  .najwa-a4 .t { font-size: 7px !important; margin-bottom: 1px !important; }
  .najwa-a4 .code { font-size: 13px !important; }
  .najwa-a4 .price { font-size: 9px !important; }
  .najwa-a4 .meta { font-size: 6.5px !important; border-top: none !important; }
</style>`;
}



export function buildHtml(t: VoucherTemplate, list: VoucherData[], perRow?: number) {
  const rows = list.map((v) => isiKonstanta(t.row, v)).join("\n");
  if (perRow && perRow > 0) {
    return `${t.header}${gridA4(perRow)}<div class="najwa-a4">${rows}</div>${t.footer}`;
  }
  return t.header + rows + t.footer;
}

export function printVouchers(t: VoucherTemplate, list: VoucherData[], perRow?: number) {
  const html = buildHtml(t, list, perRow);
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
  return true;
}

export function contohVoucher(no = 1): VoucherData {
  return {
    no,
    username: `jZoIdJvC${no}`,
    password: `jZoIdJvC${no}`,
    profile: "1 Hari",
    price: 10000,
    uptime: "24:00:00",
    validity: "1 hari",
    quota: "3 GB",
  };
}
