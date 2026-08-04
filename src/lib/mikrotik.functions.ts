import { createServerFn } from "@tanstack/react-start";
import { callRouterOs } from "./mikrotik.server";
import type { MtCreds } from "./mikrotik-types";

export const mikrotikCall = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { creds: MtCreds; path: string; method?: string; body?: unknown }) => input,
  )
  .handler(async ({ data }) =>
    callRouterOs(data.creds, data.path, data.method ?? "GET", data.body),
  );

export const mikrotikBatch = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      creds: MtCreds;
      path: string;
      method?: string;
      items: Array<Record<string, unknown>>;
    }) => input,
  )
  .handler(async ({ data }) => {
    const results = [];
    for (const item of data.items) {
      results.push(await callRouterOs(data.creds, data.path, data.method ?? "PUT", item));
    }
    return {
      total: results.length,
      success: results.filter((r) => r.ok).length,
      errors: results.filter((r) => !r.ok).map((r) => r.error ?? "gagal"),
    };
  });
