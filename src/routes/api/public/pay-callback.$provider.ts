import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/pay-callback/$provider")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const raw = await request.text();
        try {
          if (params.provider === "midtrans") {
            const { handleMidtransCallback } = await import("@/lib/payment.server");
            const res = await handleMidtransCallback(raw);
            return Response.json(res, { status: res.ok ? 200 : 401 });
          }
          if (params.provider === "tripay") {
            const { handleTripayCallback } = await import("@/lib/payment.server");
            const res = await handleTripayCallback(
              raw,
              request.headers.get("x-callback-signature") ?? "",
            );
            return Response.json(res, { status: res.ok ? 200 : 401 });
          }
          return new Response("Unknown provider", { status: 404 });
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 400 });
        }
      },
    },
  },
});