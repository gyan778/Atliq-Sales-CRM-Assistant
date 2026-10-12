"use client";

import Link from "next/link";
import { ArrowRight, Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EvidenceQuote } from "@/components/source-sheet";
import { Avatar, KindPill, Pill, SEVERITY_BAR, SeverityPill } from "@/components/ui-kit";
import { useActions } from "@/components/use-actions";
import { formatUsd } from "@/lib/dates";
import type { BriefItem } from "@/lib/engine/brief";
import { cn } from "@/lib/utils";

export function BriefCard({ item, prominent }: { item: BriefItem; prominent?: boolean }) {
  const actions = useActions();
  const sources = new Set(item.evidence.map((e) => e.sourceId)).size;

  return (
    <article className="relative flex overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className={cn("w-1 shrink-0", SEVERITY_BAR[item.severity])} />
      <div className={cn("min-w-0 flex-1 space-y-3", prominent ? "p-4 sm:p-5" : "p-4")}>
        <div className="flex flex-wrap items-center gap-1.5">
          {item.leadId ? (
            <Link href={`/accounts/${item.leadId}`} className="mr-1 text-sm font-semibold hover:underline">
              {item.company}
            </Link>
          ) : (
            <span className="mr-1 text-sm font-semibold">{item.company}</span>
          )}
          <KindPill kind={item.kind} />
          <SeverityPill severity={item.severity} />
          {item.valueUsd != null && <Pill className="bg-background text-foreground ring-border">{formatUsd(item.valueUsd)}</Pill>}
          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            {item.dateLabel}
            {item.assumedDate && (
              <span title="No date was given; policy treats AtliQ promises as due 7 days after they were made.">
                <Info className="size-3.5" />
              </span>
            )}
          </span>
        </div>

        <div>
          <h3 className={cn("font-medium leading-snug", prominent && "text-[15px]")}>{item.title}</h3>
          {item.detail && <p className="mt-0.5 text-[13px] text-muted-foreground">{item.detail}</p>}
        </div>

        {item.evidence[0] && <EvidenceQuote evidence={item.evidence[0]} compact={!prominent} />}

        <div className="flex flex-wrap items-center gap-2">
          {item.owner ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Avatar name={item.owner} className="size-5 text-[10px]" />
              {item.owner}
            </span>
          ) : (
            <Pill className="bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900">No owner</Pill>
          )}
          {sources > 1 && <span className="text-xs text-muted-foreground">· seen in {sources} sources</span>}
          <div className="ml-auto flex gap-1.5">
            {item.proposalId && (
              <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/review?focus=${encodeURIComponent(item.proposalId)}`} />}>
                Review change <ArrowRight />
              </Button>
            )}
            {item.doneable && (
              <Button size="sm" variant="ghost" onClick={() => actions.done(item)}>
                <Check /> Mark done
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
