"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlarmClock, ClipboardCheck, DollarSign, MailQuestion, UserPlus } from "lucide-react";
import { useCopilot } from "@/components/copilot-provider";
import { BriefCard } from "@/components/brief-card";
import { EmptyState, StatTile } from "@/components/ui-kit";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatUsd } from "@/lib/dates";
import { computeKpis, type BriefGroup, type BriefItem } from "@/lib/engine/brief";
import { cn } from "@/lib/utils";

const GROUPS: { id: BriefGroup; label: string; empty: string }[] = [
  { id: "follow_ups", label: "Follow-ups", empty: "No promises or replies outstanding." },
  { id: "opportunities", label: "Opportunities", empty: "No open cross-sells, revisits or new leads." },
  { id: "deadlines", label: "Deadlines & risks", empty: "Nothing time-critical in the next three weeks." },
  { id: "hygiene", label: "Data hygiene", empty: "No duplicates or open questions." },
];

export default function BriefPage() {
  const { user, brief, derived, extractions, today } = useCopilot();
  const [scope, setScope] = useState<"mine" | "all">(user.canApprove ? "mine" : "all");

  const mine = (i: BriefItem) => i.owner === user.name || i.accountOwner === user.name;
  const items = useMemo(() => (scope === "mine" ? brief.items.filter(mine) : brief.items), [brief.items, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const top = items.filter((i) => i.severity === "critical" || i.severity === "high").slice(0, 5);
  const topIds = new Set(top.map((i) => i.id));
  const k = useMemo(() => computeKpis(items, derived.proposals), [items, derived.proposals]);
  const noData = Object.keys(extractions).length === 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{formatDate(today)} · Daily Brief</p>
          <h1 className="text-2xl font-semibold tracking-tight">Good morning, {user.name}</h1>
        </div>
        <div className="inline-flex rounded-lg bg-muted p-0.5 text-sm">
          {(["mine", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={cn("rounded-md px-3 py-1 font-medium", scope === s ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {s === "mine" ? "My items" : "Everyone"}
            </button>
          ))}
        </div>
      </div>

      {noData && (
        <EmptyState title="No conversations processed yet">
          Run <code className="rounded bg-muted px-1">npm run data:extract</code> to let the assistant read the dataset, or try Quick Capture.
        </EmptyState>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="col-span-2 lg:col-span-1">
          <StatTile
            label="Revenue at risk"
            icon={DollarSign}
            tone="danger"
            value={formatUsd(k.revenueAtRisk)}
            hint={`${k.atRiskAccounts} accounts${k.atRiskUnknownValue ? ` · ${k.atRiskUnknownValue} with no value in Kaizen` : ""}`}
          />
        </div>
        <StatTile label="Promises overdue" icon={AlarmClock} tone={k.overduePromises ? "warn" : "default"} value={k.overduePromises} hint="things AtliQ said it would do" />
        <StatTile label="Clients waiting on us" icon={MailQuestion} tone={k.waitingOnUs ? "warn" : "default"} value={k.waitingOnUs} hint="unanswered asks" />
        <Link href="/review" className="rounded-xl transition hover:ring-2 hover:ring-primary/40">
          <StatTile label="Changes to approve" icon={ClipboardCheck} value={k.pendingApprovals} hint="open the Review Queue →" />
        </Link>
        <StatTile label="Leads not in Kaizen" icon={UserPlus} value={k.newLeads} hint="found in inboxes and notes" />
      </section>

      {top.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">Act today</h2>
          <div className="grid gap-3">
            {top.map((i) => (
              <BriefCard key={i.id} item={i} prominent />
            ))}
          </div>
        </section>
      )}

      <section>
        <Tabs defaultValue="follow_ups">
          <TabsList className="flex-wrap">
            {GROUPS.map((g) => (
              <TabsTrigger key={g.id} value={g.id}>
                {g.label}
                <span className="ml-1 rounded-full bg-background/70 px-1.5 text-[11px] tabular-nums">
                  {items.filter((i) => i.group === g.id && !topIds.has(i.id)).length}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          {GROUPS.map((g) => {
            const list = items.filter((i) => i.group === g.id && !topIds.has(i.id));
            return (
              <TabsContent key={g.id} value={g.id} className="mt-3 grid gap-3">
                {list.length ? list.map((i) => <BriefCard key={i.id} item={i} />) : <EmptyState title={g.empty} />}
              </TabsContent>
            );
          })}
        </Tabs>
      </section>
    </div>
  );
}
