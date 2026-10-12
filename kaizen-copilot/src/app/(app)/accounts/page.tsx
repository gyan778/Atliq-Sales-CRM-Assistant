"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useCopilot } from "@/components/copilot-provider";
import { Avatar, PageHeader, Pill, StatusPill } from "@/components/ui-kit";
import { formatDate, formatUsd } from "@/lib/dates";
import { cn } from "@/lib/utils";

export default function AccountsPage() {
  const { derived, brief, today } = useCopilot();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "unowned">("all");

  const openByLead = useMemo(() => {
    const m = new Map<string, { n: number; worst: string }>();
    const rank = { critical: 3, high: 2, medium: 1, low: 0 } as const;
    for (const i of brief.items) {
      if (!i.leadId) continue;
      const cur = m.get(i.leadId);
      m.set(i.leadId, { n: (cur?.n ?? 0) + 1, worst: !cur || rank[i.severity] > rank[cur.worst as keyof typeof rank] ? i.severity : cur.worst });
    }
    return m;
  }, [brief.items]);
  const pendingByLead = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of derived.proposals) if (p.state === "pending" && p.leadId) m.set(p.leadId, (m.get(p.leadId) ?? 0) + 1);
    return m;
  }, [derived.proposals]);

  const rows = derived.crm
    .filter((r) => !r.merged_into)
    .filter((r) => !q || `${r.company} ${r.contact_name} ${r.lead_id}`.toLowerCase().includes(q.toLowerCase()))
    .filter((r) => (filter === "open" ? openByLead.has(r.lead_id) : filter === "unowned" ? !r.owner : true))
    .sort((a, b) => (openByLead.get(b.lead_id)?.n ?? 0) - (openByLead.get(a.lead_id)?.n ?? 0) || a.company.localeCompare(b.company));
  const notInKaizen = derived.proposals.filter((p) => p.kind === "create_lead" && p.state === "pending");

  return (
    <>
      <PageHeader
        title="Accounts"
        description={`Kaizen CRM as of ${formatDate(today)}, with every approved and auto-applied change from the assistant.`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search company, contact, ID" className="h-9 pl-8" />
        </div>
        {(["all", "open", "unowned"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn("rounded-full px-3 py-1 text-sm ring-1", filter === f ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border hover:bg-muted")}
          >
            {f === "all" ? "All" : f === "open" ? "Has open items" : "No owner"}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Company</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Owner</th>
              <th className="px-3 py-2.5 text-right font-medium">Value</th>
              <th className="px-3 py-2.5 font-medium">Last contact</th>
              <th className="px-3 py-2.5 font-medium">Next follow-up</th>
              <th className="px-3 py-2.5 font-medium">Open items</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const open = openByLead.get(r.lead_id);
              const pending = pendingByLead.get(r.lead_id);
              return (
                <tr key={r.lead_id} className="hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <Link href={`/accounts/${r.lead_id}`} className="font-medium hover:underline">
                      {r.company}
                    </Link>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {r.lead_id}
                      {r.created_by_copilot && (
                        <span className="inline-flex items-center gap-0.5 text-primary">
                          <Sparkles className="size-3" /> added by copilot
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-3 py-2.5">
                    {r.owner ? (
                      <span className="flex items-center gap-1.5">
                        <Avatar name={r.owner} className="size-5 text-[10px]" /> {r.owner}
                      </span>
                    ) : (
                      <span className="text-xs text-red-600">none</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatUsd(r.est_value_usd)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatDate(r.last_contact_date)}</td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {r.next_followup_date ? formatDate(r.next_followup_date) : <span className="text-xs text-muted-foreground">not set</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {open && (
                        <Pill
                          className={cn(
                            open.worst === "critical"
                              ? "bg-red-50 text-red-700 ring-red-200"
                              : open.worst === "high"
                                ? "bg-amber-50 text-amber-800 ring-amber-200"
                                : "bg-sky-50 text-sky-800 ring-sky-200",
                          )}
                        >
                          {open.n} open
                        </Pill>
                      )}
                      {pending && <Pill className="bg-background text-muted-foreground ring-border">{pending} to approve</Pill>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {notInKaizen.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-2 text-sm font-semibold">Found in conversations, not yet in Kaizen</h2>
          <div className="flex flex-wrap gap-2">
            {notInKaizen.map((p) => (
              <Link
                key={p.id}
                href={`/review?focus=${encodeURIComponent(p.id)}`}
                className="rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-foreground/10 hover:ring-primary"
              >
                <span className="font-medium">{p.company}</span>
                <span className="ml-2 text-xs text-muted-foreground">review →</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
