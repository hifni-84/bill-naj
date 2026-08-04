import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NAJWA_BILLING — Billing RADIUS Hotspot" },
      {
        name: "description",
        content:
          "Panel billing RADIUS: kelola voucher, paket, sesi aktif, NAS MikroTik, dan pendapatan harian.",
      },
      { property: "og:title", content: "NAJWA_BILLING — Billing RADIUS Hotspot" },
      {
        property: "og:description",
        content: "Kelola voucher, paket, sesi aktif, dan pendapatan langsung dari database RADIUS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/radius" });
  },
});
