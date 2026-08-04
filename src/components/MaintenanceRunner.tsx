import { useCreds } from "@/lib/router-store";
import { useMaintenance } from "@/lib/maintenance";
import { useOptions } from "@/lib/auth-store";
import { useRadiusMaintenance } from "@/lib/radius-client";

/** Pemeriksaan voucher expired (MikroTik & RADIUS) serta isolir PPPoE. */
export function MaintenanceRunner() {
  const { creds, configured } = useCreds();
  const opts = useOptions();
  useMaintenance(creds, configured, opts.autoDeleteExpired);
  useRadiusMaintenance(true, opts.autoDeleteExpired);
  return null;
}
