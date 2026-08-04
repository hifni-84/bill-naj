import { Link } from "@tanstack/react-router";
import { PlugZap } from "lucide-react";

import { Button } from "@/components/ui/button";

export function NotConfigured() {
  return (
    <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
        <PlugZap className="size-6" />
      </span>
      <h2 className="text-lg font-semibold">Router belum terhubung</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Masukkan alamat IP, username, dan password RouterOS Anda terlebih dahulu agar data hotspot
        dapat dibaca secara langsung.
      </p>
      <Button asChild className="mt-2">
        <Link to="/pengaturan">Buka Pengaturan Router</Link>
      </Button>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
