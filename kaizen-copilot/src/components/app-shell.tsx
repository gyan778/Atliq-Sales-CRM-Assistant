"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Building2,
  ClipboardCheck,
  History,
  LogOut,
  Menu,
  ScanText,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import { useCopilot } from "@/components/copilot-provider";
import { Avatar } from "@/components/ui-kit";

const NAV = [
  { href: "/", label: "Daily Brief", icon: Sun },
  { href: "/review", label: "Review Queue", icon: ClipboardCheck, badge: "pending" as const },
  { href: "/accounts", label: "Accounts", icon: Building2 },
  { href: "/capture", label: "Quick Capture", icon: ScanText },
  { href: "/audit", label: "Audit Log", icon: History },
  { href: "/trust", label: "Trust & Safety", icon: ShieldCheck },
];

export function AppShell({ children, aiEnabled }: { children: React.ReactNode; aiEnabled: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, brief, today, hydrated } = useCopilot();
  const [mobileOpen, setMobileOpen] = useState(false);

  const logout = async () => {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
  };

  const nav = (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon, badge }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
              active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            <span className="flex-1">{label}</span>
            {badge && hydrated && brief.kpis.pendingApprovals > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums">
                {brief.kpis.pendingApprovals}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link href="/" className="flex items-center gap-2.5 px-1">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">K</span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold">Kaizen Copilot</span>
          <span className="block text-[11px] text-muted-foreground">AtliQ sales memory</span>
        </span>
      </Link>
      {nav}
      <div className="mt-auto space-y-3">
        <div className="rounded-lg bg-muted/60 p-3 text-[11px] leading-relaxed text-muted-foreground">
          <div className="font-medium text-foreground">Demo date: {formatDate(today)}</div>
          AI processing {aiEnabled ? "on" : <span className="font-semibold text-red-600">off (kill switch)</span>}
        </div>
        <div className="flex items-center gap-2.5 px-1">
          <Avatar name={user.name} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {user.role}
              {!user.canApprove && " · view only"}
            </div>
          </div>
          <button onClick={logout} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Sign out">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col">
      {/* S9 */}
      <div className="h-7 bg-zinc-900 px-4 py-1.5 text-center text-[11px] leading-4 text-zinc-200">
        Demo with synthetic AtliQ data — do not paste real client information.
      </div>
      <div className="flex flex-1">
        <aside className="sticky top-0 hidden h-[calc(100vh-1.75rem)] w-60 shrink-0 border-r bg-sidebar lg:block">{sidebar}</aside>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-64 border-r bg-sidebar">{sidebar}</aside>
          </div>
        )}
        <main className="min-w-0 flex-1">
          <div className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/90 px-4 py-2 backdrop-blur lg:hidden">
            <button onClick={() => setMobileOpen((o) => !o)} className="rounded-md p-1.5 hover:bg-muted" aria-label="Menu">
              {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            <span className="text-sm font-semibold">Kaizen Copilot</span>
          </div>
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {hydrated ? children : <div className="h-64 animate-pulse rounded-xl bg-muted/60" />}
          </div>
        </main>
      </div>
    </div>
  );
}
