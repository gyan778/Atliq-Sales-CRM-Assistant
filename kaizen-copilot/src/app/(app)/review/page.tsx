"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCopilot } from "@/components/copilot-provider";
import { ProposalCard } from "@/components/proposal-card";
import { EmptyState, PageHeader } from "@/components/ui-kit";
import { useActions } from "@/components/use-actions";
import type { Proposal } from "@/lib/engine/derive";
import { cn } from "@/lib/utils";

const FILTERS: { id: string; label: string; test: (p: Proposal) => boolean }[] = [
  { id: "all", label: "All pending", test: (p) => p.state === "pending" && p.kind !== "clarify" },
  { id: "leads", label: "New leads", test: (p) => p.state === "pending" && p.kind === "create_lead" },
  { id: "opps", label: "Opportunities", test: (p) => p.state === "pending" && p.kind === "create_opportunity" },
  { id: "fields", label: "Field updates", test: (p) => p.state === "pending" && p.kind === "set_field" },
  { id: "dups", label: "Duplicates", test: (p) => p.state === "pending" && p.kind === "merge_duplicate" },
  { id: "clarify", label: "Needs clarification", test: (p) => p.state === "pending" && p.kind === "clarify" },
  { id: "decided", label: "Decided", test: (p) => p.tier === "approval" && ["approved", "rejected", "resolved"].includes(p.state) },
];

function ReviewQueue() {
  const { derived } = useCopilot();
  const actions = useActions();
  const params = useSearchParams();
  const focus = params.get("focus");
  const focusP = focus ? derived.proposals.find((p) => p.id === focus) : undefined;
  const [filter, setFilter] = useState(() => (focusP ? (FILTERS.find((f) => f.id !== "all" && f.test(focusP))?.id ?? "all") : "all"));

  const active = FILTERS.find((f) => f.id === filter)!;
  const list = useMemo(() => derived.proposals.filter(active.test), [derived.proposals, active]);
  const groups = useMemo(() => {
    const m = new Map<string, Proposal[]>();
    for (const p of list) m.set(p.company, [...(m.get(p.company) ?? []), p]);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [list]);
  const bulk = list.filter((p) => p.state === "pending" && p.confidence === "high" && !p.conflict && p.kind !== "clarify" && p.kind !== "merge_duplicate");

  useEffect(() => {
    if (focus) document.getElementById(focus)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focus]);

  return (
    <>
      <PageHeader
        title="Review Queue"
        description="Changes the assistant wants to make in Kaizen. Low-risk updates (activity log, last-contact date) apply automatically; everything here waits for a founder."
        actions={
          bulk.length > 0 && filter !== "decided" ? (
            <Button variant="outline" onClick={() => actions.approveMany(bulk)} disabled={!actions.canApprove}>
              <CheckCheck /> Approve {bulk.length} high-confidence
            </Button>
          ) : null
        }
      />
      <div className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const n = derived.proposals.filter(f.test).length;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full px-3 py-1 text-sm font-medium ring-1 transition",
                filter === f.id ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border hover:bg-muted",
              )}
            >
              {f.label} <span className="tabular-nums opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      {groups.length === 0 ? (
        <EmptyState title="Nothing here">Kaizen is up to date for this view.</EmptyState>
      ) : (
        <div className="space-y-8">
          {groups.map(([company, ps]) => (
            <section key={company} className="space-y-3">
              <h2 className="text-sm font-semibold">
                {company} <span className="font-normal text-muted-foreground">· {ps.length}</span>
              </h2>
              {ps.map((p) => (
                <ProposalCard key={p.id} p={p} focused={p.id === focus} />
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

export default function ReviewPage() {
  return (
    <Suspense>
      <ReviewQueue />
    </Suspense>
  );
}
