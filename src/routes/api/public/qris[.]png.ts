import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/qris.png")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { getQrisImage } = await import("@/lib/qris.server");
          const row = await getQrisImage();
          if (!row) return new Response("QRIS belum diunggah", { status: 404 });
          const bytes = Uint8Array.from(atob(row.adata), (c) => c.charCodeAt(0));
          return new Response(bytes, {
            headers: {
              "Content-Type": row.mime || "image/png",
              "Cache-Control": "public, max-age=60",
            },
          });
        } catch (e) {
          return new Response(`Gagal memuat QRIS: ${(e as Error).message}`, { status: 500 });
        }
      },
    },
  },
});
