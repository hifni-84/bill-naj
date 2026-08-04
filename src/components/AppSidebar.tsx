import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Package,
  Wallet,
  Database,
  LayoutTemplate,
  LogOut,
  Radio,
  Receipt,
  Router as RouterIcon,
  Settings,
  ShieldCheck,
  Ticket,
  Wifi,

} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { logout } from "@/lib/auth-store";

const items = [
  { title: "RADIUS", desc: "Status & ringkasan", url: "/radius", icon: Database },
  { title: "Paket", desc: "Bandwidth & masa aktif", url: "/paket", icon: Package },
  { title: "Voucher & User", desc: "Generate & daftar", url: "/voucher", icon: Ticket },
  { title: "Tagihan", desc: "Otomatis H-1 · 30 hari", url: "/tagihan", icon: Receipt },
  { title: "Sesi Aktif", desc: "Sesi RADIUS berjalan", url: "/sesi-aktif", icon: Activity },
  { title: "User Aktif", desc: "Sesi berjalan", url: "/user-aktif", icon: Wifi },
  { title: "Pendapatan", desc: "Harian & bulanan", url: "/pendapatan", icon: Wallet },
  { title: "Template Voucher", desc: "Desain cetak", url: "/template", icon: LayoutTemplate },
  { title: "TR-069", desc: "GenieACS · ONU", url: "/tr069", icon: Radio },
  { title: "VPN Router", desc: "WireGuard multi-router", url: "/vpn", icon: ShieldCheck },
  { title: "Laporan", desc: "Pendapatan", url: "/laporan", icon: BarChart3 },
  { title: "Pengaturan", desc: "Akun, NAS & sistem", url: "/pengaturan", icon: Settings },
];


export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <RouterIcon className="size-4" />
          </span>
          {!collapsed && (
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight">NAJWA_BILLING</p>
              <p className="text-[11px] text-muted-foreground">Billing RADIUS</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.18em]">
            Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {items.map((item) => {
                const active = pathname === item.url;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      className="h-auto rounded-lg py-2 transition-colors"
                    >
                      <Link to={item.url} className="flex items-center gap-3">
                        <span
                          className={`flex size-7 shrink-0 items-center justify-center rounded-md border transition-colors ${
                            active
                              ? "border-primary/40 bg-primary/15 text-primary"
                              : "border-sidebar-border bg-sidebar-accent/40 text-muted-foreground"
                          }`}
                        >
                          <item.icon className="size-4" />
                        </span>
                        {!collapsed && (
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-sm font-medium">{item.title}</span>
                            <span className="truncate text-[11px] text-muted-foreground">
                              {item.desc}
                            </span>
                          </span>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout} aria-label="Keluar" tooltip="Keluar">
              <LogOut className="size-4" />
              {!collapsed && <span>Keluar</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
