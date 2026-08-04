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

export const acsFactoryReset = createServerFn({ method: "POST" })
  .inputValidator((d: { creds: AcsCreds; deviceId: string }) => d)
  .handler(async ({ data }) => {
    const { factoryResetAcsDevice } = await import("./genieacs.server");
    try {
      return await factoryResetAcsDevice(data.creds, data.deviceId);
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const acsSetParams = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      creds: AcsCreds;
      deviceId: string;
      values: Array<{ path: string; value: string; type?: string }>;
    }) => d,
  )
  .handler(async ({ data }) => {
    const { setAcsParams } = await import("./genieacs.server");
    try {
      return await setAcsParams(data.creds, data.deviceId, data.values);
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const acsSetVlan = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      creds: AcsCreds;
      deviceId: string;
      input: { wanPath: string; vlan: string; priority: string; vlanPath?: string };
    }) => d,
  )
  .handler(async ({ data }) => {
    const { setAcsVlan } = await import("./genieacs.server");
    try {
      return await setAcsVlan(data.creds, data.deviceId, data.input);
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const acsAddObject = createServerFn({ method: "POST" })
  .inputValidator((d: { creds: AcsCreds; deviceId: string; objectName: string }) => d)
  .handler(async ({ data }) => {
    const { addAcsObject } = await import("./genieacs.server");
    try {
      return await addAcsObject(data.creds, data.deviceId, data.objectName);
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const acsDeleteObject = createServerFn({ method: "POST" })
  .inputValidator((d: { creds: AcsCreds; deviceId: string; objectName: string }) => d)
  .handler(async ({ data }) => {
    const { deleteAcsObject } = await import("./genieacs.server");
    try {
      return await deleteAcsObject(data.creds, data.deviceId, data.objectName);
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const acsParams = createServerFn({ method: "POST" })
  .inputValidator((d: { creds: AcsCreds; deviceId: string }) => d)
  .handler(async ({ data }) => {
    const { listAcsParams } = await import("./genieacs.server");
    try {
      return { ok: true as const, params: await listAcsParams(data.creds, data.deviceId) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, params: [] };
    }
  });

export const acsDiscover = createServerFn({ method: "POST" })
  .inputValidator((d: { creds: AcsCreds; deviceId: string }) => d)
  .handler(async ({ data }) => {
    const { discoverAcsParams } = await import("./genieacs.server");
    try {
      return await discoverAcsParams(data.creds, data.deviceId);
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });
