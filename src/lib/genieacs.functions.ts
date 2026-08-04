import { createServerFn } from "@tanstack/react-start";

import type { AcsCreds } from "./genieacs-store";

type WanInput = {
  parentPath: string;
  kind: "PPPoE" | "IP";
  name: string;
  username: string;
  password: string;
  vlan: string;
  addressingType: string;
  ip: string;
  netmask: string;
  gateway: string;
  dns: string;
};

export const acsAddWan = createServerFn({ method: "POST" })
  .inputValidator((d: { creds: AcsCreds; deviceId: string; wan: WanInput }) => d)
  .handler(async ({ data }) => {
    const { addAcsWan } = await import("./genieacs.server");
    try {
      return await addAcsWan(data.creds, data.deviceId, data.wan);
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const acsDeleteWan = createServerFn({ method: "POST" })
  .inputValidator((d: { creds: AcsCreds; deviceId: string; path: string }) => d)
  .handler(async ({ data }) => {
    const { deleteAcsWan } = await import("./genieacs.server");
    try {
      return await deleteAcsWan(data.creds, data.deviceId, data.path);
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });


export const acsDevices = createServerFn({ method: "POST" })
  .inputValidator((d: { creds: AcsCreds }) => d)
  .handler(async ({ data }) => {
    const { listAcsDevices } = await import("./genieacs.server");
    try {
      return { ok: true as const, devices: await listAcsDevices(data.creds) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, devices: [] };
    }
  });

export const acsSetWifi = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { creds: AcsCreds; deviceId: string; values: Array<{ path: string; value: string }> }) => d,
  )
  .handler(async ({ data }) => {
    const { setAcsWifi } = await import("./genieacs.server");
    try {
      return await setAcsWifi(data.creds, data.deviceId, data.values);
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const acsRefresh = createServerFn({ method: "POST" })
  .inputValidator((d: { creds: AcsCreds; deviceId: string }) => d)
  .handler(async ({ data }) => {
    const { refreshAcsDevice } = await import("./genieacs.server");
    try {
      return await refreshAcsDevice(data.creds, data.deviceId);
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const acsReboot = createServerFn({ method: "POST" })
  .inputValidator((d: { creds: AcsCreds; deviceId: string }) => d)
  .handler(async ({ data }) => {
    const { rebootAcsDevice } = await import("./genieacs.server");
    try {
      return await rebootAcsDevice(data.creds, data.deviceId);
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });
