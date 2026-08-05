import { createServerFn } from "@tanstack/react-start";

export const licenseStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { licenseState } = await import("./license.server");
  return licenseState();
});

export const licenseMikrotikId = createServerFn({ method: "GET" }).handler(async () => {
  const { mikrotikSoftwareId } = await import("./license.server");
  return { id: await mikrotikSoftwareId() };
});

export const licenseActivate = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string; mikrotikId: string }) => d)
  .handler(async ({ data }) => {
    try {
      const { activateLicense } = await import("./license.server");
      return await activateLicense(data);
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const licenseDeactivate = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const { deactivateLicense } = await import("./license.server");
    return await deactivateLicense();
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
});
