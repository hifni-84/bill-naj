import { createServerFn } from "@tanstack/react-start";

import {
  defaultGatewayOptions,
  type GatewayOptions,
  type GatewayPublic,
} from "./invoice-types";

export const gatewayOptionsGet = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { gatewayOptions } = await import("./payment.server");
    return { ok: true as const, options: await gatewayOptions() };
  } catch {
    return { ok: false as const, options: defaultGatewayOptions };
  }
});

export const gatewayOptionsSave = createServerFn({ method: "POST" })
  .inputValidator((d: { options: GatewayOptions }) => d)
  .handler(async ({ data }) => {
    try {
      const { serializeGatewayOptions } = await import("./invoice-types");
      const { saveSettings } = await import("./radius.server");
      await saveSettings(serializeGatewayOptions(data.options));
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

/** Info gateway untuk halaman publik (tanpa kunci rahasia). */
export const gatewayPublicGet = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { gatewayOptions } = await import("./payment.server");
    const o = await gatewayOptions();
    return {
      provider: o.provider,
      sandbox: o.sandbox,
      method: o.tripayMethod,
    } satisfies GatewayPublic;
  } catch {
    return { provider: "none", sandbox: true, method: "" } satisfies GatewayPublic;
  }
});

/** Buat link pembayaran online untuk satu tagihan. */
export const paymentCreate = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number; username: string }) => d)
  .handler(async ({ data }) => {
    try {
      const { createPayment } = await import("./payment.server");
      const { query } = await import("./radius.server");
      // Portal publik: pastikan tagihan memang milik username tersebut.
      const owner = await query<{ username: string }>(
        "SELECT username FROM billing_invoice WHERE id = ? LIMIT 1",
        [data.id],
      );
      if (!owner[0] || owner[0].username !== data.username.trim()) {
        return { ok: false as const, url: "", error: "Tagihan tidak ditemukan" };
      }
      const res = await createPayment(data.id);
      return { ok: true as const, url: res.url, error: null as string | null };
    } catch (e) {
      return { ok: false as const, url: "", error: (e as Error).message };
    }
  });