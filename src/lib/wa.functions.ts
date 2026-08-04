import { createServerFn } from "@tanstack/react-start";

import { defaultWaOptions, type WaOptions } from "./invoice-types";

export const waOptionsGet = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { waOptions } = await import("./wa.server");
    return { ok: true as const, options: await waOptions() };
  } catch {
    return { ok: false as const, options: defaultWaOptions };
  }
});

export const waOptionsSave = createServerFn({ method: "POST" })
  .inputValidator((d: { options: WaOptions }) => d)
  .handler(async ({ data }) => {
    try {
      const { serializeWaOptions } = await import("./invoice-types");
      const { saveSettings } = await import("./radius.server");
      await saveSettings(serializeWaOptions(data.options));
      return { ok: true as const, error: null as string | null };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

/** Uji kirim pesan ke satu nomor. */
export const waTest = createServerFn({ method: "POST" })
  .inputValidator((d: { phone: string }) => d)
  .handler(async ({ data }) => {
    try {
      const { sendWa, publicBaseUrl } = await import("./wa.server");
      const base = await publicBaseUrl();
      await sendWa(
        data.phone,
        `Tes WhatsApp gateway billing berhasil.\nPortal pembayaran: ${base || "(alamat publik belum diisi)"}/portal`,
      );
      return { ok: true as const, error: null as string | null };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

/** Kirim ulang / kirim manual satu tagihan ke WhatsApp pelanggan. */
export const waSendInvoice = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number; phone?: string }) => d)
  .handler(async ({ data }) => {
    try {
      const { sendInvoiceWa } = await import("./wa.server");
      const res = await sendInvoiceWa(data.id, data.phone);
      return { ok: true as const, phone: res.phone, error: null as string | null };
    } catch (e) {
      return { ok: false as const, phone: "", error: (e as Error).message };
    }
  });

/** Kirim semua tagihan belum dibayar yang punya nomor WA. */
export const waSendUnpaid = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const { blastUnpaid } = await import("./wa.server");
    return { ...(await blastUnpaid()), error: null as string | null };
  } catch (e) {
    return {
      sent: 0,
      failed: 0,
      skipped: false as const,
      errors: [] as string[],
      error: (e as Error).message,
    };
  }
});

export const waPhoneSave = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string; phone: string }) => d)
  .handler(async ({ data }) => {
    try {
      const { setUserPhone } = await import("./wa.server");
      await setUserPhone(data.username, data.phone);
      return { ok: true as const, error: null as string | null };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

/* ----- Provider self-hosted (QR scan) ----- */

/** Status koneksi gateway self-hosted. */
export const waSelfStatus = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { selfWaStatus } = await import("./wa.server");
    return { ok: true as const, status: await selfWaStatus() };
  } catch (e) {
    return {
      ok: false as const,
      status: { state: "offline" as const, user: "", hasQr: false },
    };
  }
});

/** Ambil QR code (data URL PNG) untuk dipindai. */
export const waSelfQr = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { selfWaQr } = await import("./wa.server");
    return { ok: true as const, qr: await selfWaQr(), error: null as string | null };
  } catch (e) {
    return { ok: false as const, qr: "", error: (e as Error).message };
  }
});

/** Logout / pindai ulang. */
export const waSelfLogout = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const { selfWaLogout } = await import("./wa.server");
    await selfWaLogout();
    return { ok: true as const, error: null as string | null };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
});
