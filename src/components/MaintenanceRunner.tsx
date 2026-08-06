import { useCreds } from "@/lib/router-store";
import { useMaintenance } from "@/lib/maintenance";
import { useOptions } from "@/lib/auth-store";
import { useRadiusMaintenance } from "@/lib/radius-client";
import { useHybrid, useHybridLoginSync } from "@/lib/hybrid";

/** Pemeriksaan voucher expired (MikroTik & RADIUS) serta isolir PPPoE. */
export function MaintenanceRunner() {
  const { creds, configured } = useCreds();
  const opts = useOptions();
  const { hybrid } = useHybrid();
  useMaintenance(creds, configured, opts.autoDeleteExpired);
  useRadiusMaintenance(true, opts.autoDeleteExpired);
  // Mode hybrid: login di user lokal MikroTik dicatat juga di billing.
  // Router tambahan tetap dipantau meski kredensial router utama belum diisi.
  useHybridLoginSync(creds, hybrid.enabled && hybrid.syncVoucher);
  return null;
}
