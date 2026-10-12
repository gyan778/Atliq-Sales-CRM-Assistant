"use client";

import {
  AlarmClock,
  CalendarClock,
  CircleHelp,
  Copy,
  Handshake,
  Hourglass,
  MailQuestion,
  RefreshCcw,
  Repeat2,
  ShieldAlert,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { BriefKind, Severity } from "@/lib/engine/brief";
import type { Confidence, ProposalState } from "@/lib/engine/derive";

export const KIND_META: Record<BriefKind, { label: string; icon: LucideIcon }> = {
  overdue_promise: { label: "Promise overdue", icon: AlarmClock },
  promise_due: { label: "Promise due", icon: Hourglass },
  awaiting_reply: { label: "Client waiting", icon: MailQuestion },
  deadline: { label: "Deadline", icon: CalendarClock },
  revisit: { label: "Revisit", icon: Repeat2 },
  cross_sell: { label: "Cross-sell", icon: Sparkles },
  renewal: { label: "Renewal", icon: RefreshCcw },
  risk: { label: "Deal risk", icon: ShieldAlert },
  new_lead: { label: "Not in Kaizen", icon: UserPlus },
  stale_deal: { label: "Going cold", icon: Handshake },
  duplicate: { label: "Duplicate", icon: Copy },
  clarify: { label: "Needs clarification", icon: CircleHelp },
};

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900",
  high: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900",
  medium: "bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-900",
  low: "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
};

export const SEVERITY_BAR: Record<Severity, string> = {
  critical: "bg-red-500",
  high: "bg-amber-500",
  medium: "bg-sky-500",
  low: "bg-zinc-400",
};

export function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SeverityPill({ severity }: { severity: Severity }) {
  return <Pill className={SEVERITY_STYLE[severity]}>{severity === "critical" ? "Critical" : severity[0].toUpperCase() + severity.slice(1)}</Pill>;
}

export function KindPill({ kind }: { kind: BriefKind }) {
  const { label, icon: Icon } = KIND_META[kind];
  return (
    <Pill className="bg-background text-muted-foreground ring-border">
      <Icon className="size-3" />
      {label}
    </Pill>
  );
}

const CONF_STYLE: Record<Confidence, string> = {
  high: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900",
  medium: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900",
  low: "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
};

export function ConfidencePill({ confidence, reasons }: { confidence: Confidence; reasons?: string[] }) {
  return (
    <span title={reasons?.join("; ")}>
      <Pill className={CONF_STYLE[confidence]}>{confidence[0].toUpperCase() + confidence.slice(1)} confidence</Pill>
    </span>
  );
}

const STATE_STYLE: Record<ProposalState, { label: string; cls: string }> = {
  auto_applied: { label: "Auto-applied", cls: "bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:ring-violet-900" },
  pending: { label: "Awaiting approval", cls: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900" },
  approved: { label: "Approved", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900" },
  rejected: { label: "Rejected", cls: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900" },
  undone: { label: "Undone", cls: "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700" },
  superseded: { label: "Superseded", cls: "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700" },
  resolved: { label: "Resolved", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900" },
};

export function StatePill({ state }: { state: ProposalState }) {
  return <Pill className={STATE_STYLE[state].cls}>{STATE_STYLE[state].label}</Pill>;
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const hue = [...name].reduce((h, c) => h + c.charCodeAt(0), 0) % 360;
  return (
    <span
      className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white", className)}
      style={{ background: `oklch(0.55 0.13 ${hue})` }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "danger" | "warn";
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </div>
      <div
        className={cn(
          "mt-1.5 text-2xl font-semibold tracking-tight tabular-nums",
          tone === "danger" && "text-red-600 dark:text-red-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed p-10 text-center">
      <div className="font-medium">{title}</div>
      {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  Won: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  "Proposal Sent": "bg-violet-50 text-violet-800 ring-violet-200",
  Contacted: "bg-sky-50 text-sky-800 ring-sky-200",
  New: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  Lost: "bg-red-50 text-red-700 ring-red-200",
};

export function StatusPill({ status }: { status: string }) {
  return <Pill className={STATUS_STYLE[status] ?? "bg-zinc-50 text-zinc-500 ring-zinc-200 italic"}>{status || "no status"}</Pill>;
}

