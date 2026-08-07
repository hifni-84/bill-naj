import { createServerFn } from "@tanstack/react-start";

import {
  defaultInvoiceOptions,
  serializeInvoiceOptions,
  type Invoice,
  type InvoiceOptions,
} from "./invoice-types";

export const invoiceList = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { listInvoices } = await import("./invoice.server");
    return { ok: true as const, invoices: await listInvoices(), error: null as string | null };
  } catch (e) {
    return { ok: false as const, invoices: [] as Invoice[], error: (e as Error).message };
  }
});

export const invoiceOptionsGet = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { invoiceOptions } = await import("./invoice.server");
    return { ok: true as const, options: await invoiceOptions() };
  } catch {
    return { ok: false as const, options: defaultInvoiceOptions };
  }
});

export const invoiceOptionsSave = createServerFn({ method: "POST" })
  .inputValidator((d: { options: InvoiceOptions }) => d)
  .handler(async ({ data }) => {
    try {
      const { saveSettings } = await import("./radius.server");
      await saveSettings(serializeInvoiceOptions(data.options));
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const invoiceGenerate = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const { generateInvoices } = await import("./invoice.server");
    return { ...(await generateInvoices()), error: null as string | null };
  } catch (e) {
    return { created: 0, skipped: false, waSent: 0, error: (e as Error).message };
  }
});

export const invoicePay = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number; note?: string }) => d)
  .handler(async ({ data }) => {
    try {
      const { payInvoice } = await import("./invoice.server");
      return await payInvoice(data.id, data.note ?? "");
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const invoiceCancel = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    const { cancelInvoice } = await import("./invoice.server");
    return cancelInvoice(data.id);
  });

export const invoiceDelete = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    const { deleteInvoice } = await import("./invoice.server");
    return deleteInvoice(data.id);
  });

/** Buat invoice manual dari panel admin. */
export const invoiceCreateManual = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      username: string;
      plan: string;
      service: "hotspot" | "pppoe";
      amount: number;
      dueDate: string;
      message: string;
      note?: string;
      phone?: string;
    }) => d,
  )
  .handler(async ({ data }) => {
    try {
      const { createManualInvoice } = await import("./invoice.server");
      const res = await createManualInvoice(data);
      return { ...res, error: null as string | null };
    } catch (e) {
      return { ok: false as const, id: 0, error: (e as Error).message };
    }
  });

/** Simpan perubahan pesan pada satu invoice. */
export const invoiceMessageSave = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number; message: string }) => d)
  .handler(async ({ data }) => {
    try {
      const { updateInvoiceMessage } = await import("./invoice.server");
      await updateInvoiceMessage(data.id, data.message);
      return { ok: true as const, error: null as string | null };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

/** Portal pelanggan: cek tagihan berdasarkan username voucher/PPPoE. */
export const invoiceLookup = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string }) => d)
  .handler(async ({ data }) => {
    try {
      const { invoicesFor, invoiceOptions } = await import("./invoice.server");
      const [res, opt] = await Promise.all([invoicesFor(data.username), invoiceOptions()]);
      return {
        ok: true as const,
        ...res,
        pay: {
          merchant: opt.merchant,
          qrisUrl: opt.qrisUrl,
          payInfo: opt.payInfo,
          whatsapp: opt.whatsapp,
        },
      };
    } catch (e) {
      return {
        ok: false as const,
        found: false as const,
        invoices: [] as Invoice[],
        expires_at: null as string | null,
        plan: "",
        usage: { download: 0, upload: 0, total: 0, sessionTime: 0 },
        pay: {
          merchant: defaultInvoiceOptions.merchant,
          qrisUrl: "",
          payInfo: "",
          whatsapp: "",
        },
        error: (e as Error).message,
      };
    }
  });
