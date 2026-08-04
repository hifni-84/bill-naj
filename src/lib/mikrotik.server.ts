import type { Json, MtCreds, MtResult } from "./mikrotik-types";

export async function callRouterOs(
  creds: MtCreds,
  path: string,
  method: string,
  body?: unknown,
): Promise<MtResult> {
  const scheme = creds.useHttps ? "https" : "http";
  const port = creds.port ? `:${creds.port}` : "";
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${scheme}://${creds.host}${port}/rest${cleanPath}`;

  const auth = btoa(`${creds.username}:${creds.password}`);

  try {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    };
    if (body !== undefined) init.body = JSON.stringify(body);

    const res = await fetch(url, init);

    const text = await res.text();
    let parsed: Json = null;
    try {
      parsed = text ? (JSON.parse(text) as Json) : null;
    } catch {
      parsed = text;
    }

    if (!res.ok) {
      const detail =
        parsed && typeof parsed === "object" && "detail" in (parsed as Record<string, unknown>)
          ? String((parsed as Record<string, Json>)["detail"])
          : typeof parsed === "string"
            ? parsed
            : res.statusText;
      return { ok: false, status: res.status, data: parsed, error: detail || "Permintaan gagal" };
    }

    return { ok: true, status: res.status, data: parsed };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Kesalahan tidak diketahui";
    return {
      ok: false,
      status: 0,
      data: null,
      error: `Tidak dapat menghubungi router (${message}). Pastikan service www (REST API) aktif dan router dapat diakses dari internet.`,
    };
  }
}
