import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/Shared";
import { ActivationPanel } from "@/components/LicenseGate";

export const Route = createFileRoute("/aktivasi")({
  head: () => ({
    meta: [
      { title: "Aktivasi Billing — NAJWA_BILLING" },
      {
        name: "description",
        content:
          "Aktifkan panel billing dengan kode unik yang dibuat dari Software ID billing dan lisensi MikroTik: 3 hari, 1 bulan, 1 tahun, atau selamanya.",
      },
      { property: "og:title", content: "Aktivasi Billing — NAJWA_BILLING" },
      {
        property: "og:description",
        content: "Masukkan kode aktivasi dan pantau masa berlaku lisensi billing Anda.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AktivasiPage,
});

function AktivasiPage() {
  return (
    <div>
      <PageHeader
        title="Aktivasi Billing"
        description="Kode unik terikat pada Software ID server billing dan lisensi MikroTik Anda."
      />
      <ActivationPanel />
    </div>
  );
}
