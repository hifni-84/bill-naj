import { useEffect } from "react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth-store";

/**
 * Akun demo: semua permintaan yang mengubah data (POST/PUT/PATCH/DELETE)
 * diblokir di sisi klien sebelum sampai ke server.
 */
export function ReadOnlyGuard() {
  const { role, ready } = useAuth();

  useEffect(() => {
    if (!ready || role !== "demo" || typeof window === "undefined") return;
    const original = window.fetch;
    let lastToast = 0;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (
        init?.method ??
        (input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      if (method !== "GET" && method !== "HEAD") {
        if (Date.now() - lastToast > 2000) {
          lastToast = Date.now();
          toast.error("Akun demo hanya bisa melihat, tidak bisa mengubah data");
        }
        return new Response(JSON.stringify({ ok: false, error: "Akun demo read-only" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      return original(input, init);
    };

    return () => {
      window.fetch = original;
    };
  }, [role, ready]);

  if (role !== "demo") return null;
  return (
    <div className="no-print bg-primary/10 px-4 py-2 text-center text-xs font-medium text-primary">
      Mode Demo — akses hanya lihat, perubahan tidak akan tersimpan
    </div>
  );
}