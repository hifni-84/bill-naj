import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/logo.png")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { getLogoImage } = await import("@/lib/brand.server");
          const row = await getLogoImage();
          if (!row) return new Response("Logo belum diunggah", { status: 404 });
          const bytes = Uint8Array.from(atob(row.adata), (c) => c.charCodeAt(0));
          return new Response(bytes, {
            headers: {
              "Content-Type": row.mime || "image/png",
              "Cache-Control": "public, max-age=60",
            },
          });
        } catch (e) {
          return new Response(`Gagal memuat logo: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});
