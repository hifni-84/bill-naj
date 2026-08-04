import { useQuery } from "@tanstack/react-query";
import { mikrotikCall } from "./mikrotik.functions";
import type {
  HotspotActive,
  HotspotProfile,
  HotspotUser,
  Json,
  MtCreds,
  MtResult,
  PppActive,
  PppSecret,
} from "./mikrotik-types";

export async function mt(
  creds: MtCreds,
  path: string,
  method: string = "GET",
  body?: Record<string, unknown>,
): Promise<MtResult> {
  return mikrotikCall({ data: { creds, path, method, body } });
}

export async function mtList<T>(creds: MtCreds, path: string): Promise<T[]> {
  const res = await mt(creds, path);
  if (!res.ok) throw new Error(res.error ?? "Gagal mengambil data dari router");
  return (Array.isArray(res.data) ? res.data : []) as T[];
}

export function useProfiles(creds: MtCreds, enabled: boolean) {
  return useQuery({
    queryKey: ["profiles", creds.host],
    enabled,
    queryFn: () => mtList<HotspotProfile>(creds, "/ip/hotspot/user/profile"),
  });
}

export function useUsers(creds: MtCreds, enabled: boolean) {
  return useQuery({
    queryKey: ["users", creds.host],
    enabled,
    queryFn: () => mtList<HotspotUser>(creds, "/ip/hotspot/user"),
  });
}

export function useActive(creds: MtCreds, enabled: boolean) {
  return useQuery({
    queryKey: ["active", creds.host],
    enabled,
    refetchInterval: 10000,
    queryFn: () => mtList<HotspotActive>(creds, "/ip/hotspot/active"),
  });
}

export function useIdentity(creds: MtCreds, enabled: boolean) {
  return useQuery({
    queryKey: ["identity", creds.host],
    enabled,
    queryFn: async () => {
      const res = await mt(creds, "/system/resource");
      if (!res.ok) throw new Error(res.error ?? "Gagal");
      return res.data as Record<string, Json>;
    },
  });
}

export function usePppSecrets(creds: MtCreds, enabled: boolean) {
  return useQuery({
    queryKey: ["ppp-secret", creds.host],
    enabled,
    queryFn: () => mtList<PppSecret>(creds, "/ppp/secret"),
  });
}

export function usePppProfiles(creds: MtCreds, enabled: boolean) {
  return useQuery({
    queryKey: ["ppp-profile", creds.host],
    enabled,
    queryFn: () => mtList<HotspotProfile>(creds, "/ppp/profile"),
  });
}

export function usePppActive(creds: MtCreds, enabled: boolean) {
  return useQuery({
    queryKey: ["ppp-active", creds.host],
    enabled,
    refetchInterval: 15000,
    queryFn: () => mtList<PppActive>(creds, "/ppp/active"),
  });
}
