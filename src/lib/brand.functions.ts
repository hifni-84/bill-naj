import { createServerFn } from "@tanstack/react-start";

export const logoUpload = createServerFn({ method: "POST" })
  .inputValidator((d: { mime: string; base64: string }) => {
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(d.mime)) throw new Error("Format harus PNG, JPG, atau WEBP");
    if (!d.base64 || d.base64.length > 4_000_000) throw new Error("Ukuran gambar maksimal 3 MB");
    return d;
  })
  .handler(async ({ data }) => {
    try {
      const { saveLogoImage } = await import("./brand.server");
      const { saveSettings } = await import("./radius.server");
      const { invoiceKeys } = await import("./invoice-types");
      await saveLogoImage(data.mime, data.base64);
      const url = `/api/public/logo.png?v=${Date.now()}`;
      await saveSettings({ [invoiceKeys.logoUrl]: url });
      return { ok: true as const, url, error: null as string | null };
    } catch (e) {
      return { ok: false as const, url: "", error: (e as Error).message };
    }
  });

export const logoRemove = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const { deleteLogoImage } = await import("./brand.server");
    const { saveSettings } = await import("./radius.server");
    const { invoiceKeys } = await import("./invoice-types");
    await deleteLogoImage();
    await saveSettings({ [invoiceKeys.logoUrl]: "" });
    return { ok: true as const, error: null as string | null };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
});
