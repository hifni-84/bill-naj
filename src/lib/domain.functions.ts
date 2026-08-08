import { createServerFn } from "@tanstack/react-start";

export type DomainForm = { domains: string[]; email: string; port: string; https: boolean };

export const domainStatusGet = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { domainStatus } = await import("./domain.server");
    return { ok: true as const, status: await domainStatus(), error: null as string | null };
  } catch (e) {
    return { ok: false as const, status: null, error: (e as Error).message };
  }
});

export const domainApplySave = createServerFn({ method: "POST" })
  .inputValidator((d: { options: DomainForm }) => d)
  .handler(async ({ data }) => {
    try {
      const { domainApply } = await import("./domain.server");
      const res = await domainApply(data.options);
      return { ok: res.ok, log: res.log, error: null as string | null };
    } catch (e) {
      return { ok: false as const, log: "", error: (e as Error).message };
    }
  });
