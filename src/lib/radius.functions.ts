import { createServerFn } from "@tanstack/react-start";

import type { RadiusPlan } from "./radius-types";

export const radiusPing = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { pingDb, startAutoMaintenance } = await import("./radius.server");
    const info = await pingDb();
    startAutoMaintenance(true);
    return { ok: true as const, ...info };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
});

export const radiusPlans = createServerFn({ method: "GET" }).handler(async () => {
  const { listPlans } = await import("./radius.server");
  try {
    return await listPlans();
  } catch {
    // Database RADIUS belum tersambung: kembalikan daftar kosong.
    return [];
  }
});

export const radiusSavePlan = createServerFn({ method: "POST" })
  .inputValidator((d: RadiusPlan) => d)
  .handler(async ({ data }) => {
    const { savePlan } = await import("./radius.server");
    return savePlan(data);
  });

export const radiusDeletePlan = createServerFn({ method: "POST" })
  .inputValidator((d: { name: string }) => d)
  .handler(async ({ data }) => {
    const { deletePlan } = await import("./radius.server");
    return deletePlan(data.name);
  });

export const radiusUsers = createServerFn({ method: "GET" }).handler(async () => {
  const { listUsers } = await import("./radius.server");
  try {
    return await listUsers();
  } catch {
    return [];
  }
});

export const radiusCreateUsers = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      users: {
        username: string;
        password: string;
        plan: string;
        batch: string;
        price: number;
        service: "hotspot" | "pppoe";
        paid?: boolean;
        nas?: string;
      }[];
    }) => d,
  )
  .handler(async ({ data }) => {
    const { createUsers } = await import("./radius.server");
    return createUsers(data.users);
  });

export const radiusDeleteUsers = createServerFn({ method: "POST" })
  .inputValidator((d: { usernames: string[] }) => d)
  .handler(async ({ data }) => {
    const { deleteUsers } = await import("./radius.server");
    return deleteUsers(data.usernames);
  });

export const radiusSessions = createServerFn({ method: "GET" }).handler(async () => {
  const { listSessions } = await import("./radius.server");
  try {
    return await listSessions();
  } catch {
    return [];
  }
});

export const radiusReport = createServerFn({ method: "GET" }).handler(async () => {
  const { report } = await import("./radius.server");
  try {
    return await report();
  } catch {
    return {
      daily: [],
      monthly: [],
      todayRevenue: 0,
      todayCount: 0,
      monthRevenue: 0,
      monthCount: 0,
      totalRevenue: 0,
      totalUsers: 0,
      used: 0,
      online: 0,
    };
  }
});

export const radiusMaintenance = createServerFn({ method: "POST" })
  .inputValidator((d: { hapusExpired: boolean }) => d)
  .handler(async ({ data }) => {
    const { maintenance, expiredOnline, startAutoMaintenance } = await import("./radius.server");
    try {
      startAutoMaintenance(data.hapusExpired);
      const online = await expiredOnline();
      const res = await maintenance(data.hapusExpired);
      return { ...res, expiredOnline: online, error: null as string | null };
    } catch (e) {
      // Database RADIUS belum tersambung: jangan bikin halaman blank.
      return {
        stamped: 0,
        expired: 0,
        purged: 0,
        expiredOnline: [] as string[],
        error: e instanceof Error ? e.message : "Database RADIUS tidak tersambung",
      };
    }
  });

export const radiusNasList = createServerFn({ method: "GET" }).handler(async () => {
  const { listNas } = await import("./radius.server");
  try {
    return await listNas();
  } catch {
    return [];
  }
});

export const radiusSaveNas = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      id?: number;
      nasname: string;
      shortname: string;
      secret: string;
      description: string;
      timezone?: string;
    }) => d,
  )
  .handler(async ({ data }) => {
    const { saveNas } = await import("./radius.server");
    return saveNas(data);
  });

export const radiusDeleteNas = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    const { deleteNas } = await import("./radius.server");
    return deleteNas(data.id);
  });

export const radiusDeleteExpired = createServerFn({ method: "POST" }).handler(async () => {
  const { deleteExpiredUsers } = await import("./radius.server");
  return deleteExpiredUsers();
});

export const radiusReactivateUsers = createServerFn({ method: "POST" })
  .inputValidator((d: { usernames: string[] }) => d)
  .handler(async ({ data }) => {
    const { reactivateUsers } = await import("./radius.server");
    return reactivateUsers(data.usernames);
  });

export const settingsGet = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { getSettings } = await import("./radius.server");
    return { ok: true as const, data: await getSettings() };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message, data: {} as Record<string, string> };
  }
});

export const settingsSave = createServerFn({ method: "POST" })
  .inputValidator((d: { entries: Record<string, string> }) => d)
  .handler(async ({ data }) => {
    try {
      const { saveSettings } = await import("./radius.server");
      return await saveSettings(data.entries);
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });

export const billingAccountGet = createServerFn({ method: "GET" }).handler(async () => {
  const { getBillingAccounts } = await import("./billing-auth.server");
  return { accounts: await getBillingAccounts() };
});

export const billingAccountLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string; password: string }) => d)
  .handler(async ({ data }) => {
    const { verifyBillingAccount } = await import("./billing-auth.server");
    return verifyBillingAccount(data.username, data.password);
  });

export const billingAccountSave = createServerFn({ method: "POST" })
  .inputValidator((d: { role: "admin" | "reseller"; username: string; password: string }) => d)
  .handler(async ({ data }) => {
    const { saveBillingAccount } = await import("./billing-auth.server");
    return saveBillingAccount(data.role, data.username, data.password);
  });
