import { createServerFn } from "@tanstack/react-start";

export const qrisUpload = createServerFn({ method: "POST" })
  .inputValidator((d: { mime: string; base64: string }) => {
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(d.mime)) throw new Error("Format harus PNG, JPG, atau WEBP");
    if (!d.base64 || d.base64.length > 4_000_000) throw new Error("Ukuran gambar maksimal 3 MB");
    return d;
  })
  .handler(async ({ data }) => {
    try {
      const { saveQrisImage } = await import("./qris.server");
      const { saveSettings } = await import("./radius.server");
      const { invoiceKeys } = await import("./invoice-types");
      await saveQrisImage(data.mime, data.base64);
      const url = `/api/public/qris.png?v=${Date.now()}`;
      await saveSettings({ [invoiceKeys.qrisUrl]: url });
      return { ok: true as const, url, error: null as string | null };
    } catch (e) {
      return { ok: false as const, url: "", error: (e as Error).message };
    }
  });

export const qrisRemove = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const { deleteQrisImage } = await import("./qris.server");
    const { saveSettings } = await import("./radius.server");
    const { invoiceKeys } = await import("./invoice-types");
    await deleteQrisImage();
    await saveSettings({ [invoiceKeys.qrisUrl]: "" });
    return { ok: true as const, error: null as string | null };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
});

export const qrisInfo = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { getQrisImage } = await import("./qris.server");
    const row = await getQrisImage();
    return { ok: true as const, exists: !!row, updatedAt: row ? String(row.updated_at) : null };
  } catch {
    return { ok: false as const, exists: false, updatedAt: null as string | null };
  }
});
