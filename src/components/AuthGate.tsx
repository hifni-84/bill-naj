import { useState, type ReactNode } from "react";
import { LockKeyhole } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, useAuth } from "@/lib/auth-store";

function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (!(await login(username, password))) toast.error("Username atau password salah");
    } catch {
      toast.error("Server billing tidak dapat dihubungi");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4">
      <form onSubmit={submit} className="panel w-full max-w-sm p-7">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
            <LockKeyhole className="size-6" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">NAJWA_BILLING</h1>
          <p className="text-sm text-muted-foreground">Masuk untuk mengelola hotspot & PPPoE</p>
        </div>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="lu">Username</Label>
            <Input
              id="lu"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="lp">Password</Label>
            <Input
              id="lp"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="mt-1 w-full" disabled={submitting}>
            {submitting ? "Memeriksa..." : "Masuk"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { authed, ready } = useAuth();
  if (!ready) return null;
  if (!authed) return <LoginScreen />;
  return <>{children}</>;
}
