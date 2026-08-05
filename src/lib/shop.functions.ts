import { createServerFn } from "@tanstack/react-start";

import type { Order, PortalPlan } from "./shop-types";

export const portalPlansGet = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { portalPlans } = await import("./shop.server");
    return { plans: (await portalPlans()) as PortalPlan[] };
  } catch {
    return { plans: [] as PortalPlan[] };
  }
});

export const orderCreate = createServerFn({ method: "POST" })
  .inputValidator((d: { plan: string; phone?: string; qty?: number }) => d)
  .handler(async ({ data }) => {
    try {
      const { createOrder } = await import("./shop.server");
      const res = await createOrder(data.plan, data.phone ?? "", data.qty ?? 1);
      return { ok: true as const, ...res, error: null as string | null };
    } catch (e) {
      return { ok: false as const, code: "", url: "", qty: 0, error: (e as Error).message };
    }
  });

export const orderStatusGet = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string }) => d)
  .handler(async ({ data }) => {
    try {
      const { orderStatus } = await import("./shop.server");
      return { order: (await orderStatus(data.code)) as Order | null };
    } catch {
      return { order: null as Order | null };
    }
  });
