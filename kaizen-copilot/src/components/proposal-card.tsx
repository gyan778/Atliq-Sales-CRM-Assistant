"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, Pencil, TriangleAlert, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EvidenceQuote } from "@/components/source-sheet";
import { ConfidencePill, Pill, StatePill } from "@/components/ui-kit";
import { useActions } from "@/components/use-actions";
import { useCopilot } from "@/components/copilot-provider";
import { formatDate, formatUsd } from "@/lib/dates";
import { getRecord } from "@/lib/kaizen";
import type { Proposal } from "@/lib/engine/derive";
import { cn } from "@/lib/utils";

export const REJECT_REASONS = ["Wrong fact", "Not a real signal", "Wrong account", "Duplicate", "Already handled"];

function show(field: string | undefined, v: string | undefined) {
  if (!v) return <span className="text-muted-foreground italic">empty</span>;
  if (field === "est_value_usd") return formatUsd(Number(v));
  if (field?.endsWith("_date")) return formatDate(v);
  return v;
}

export function ProposalCard({ p, focused }: { p: Proposal; focused?: boolean }) {
  const actions = useActions();
  const { derived } = useCopilot();
  const [mode, setMode] = useState<"idle" | "edit" | "reject" | "answer">("idle");
  const [draft, setDraft] = useState(p.kind === "create_lead" ? p.company : p.kind === "create_opportunity" ? (p.opportunity?.title ?? "") : (p.after ?? ""));
  const [answer, setAnswer] = useState("");
  const pending = p.state === "pending";
  const editable = p.kind === "set_field" || p.kind === "create_lead" || p.kind === "create_opportunity";
  const dup = p.merge ? getRecord(derived.crm, p.merge.duplicate) : undefined;

  return (
    <article
      id={p.id}
      className={cn(
        "space-y-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10",
        focused && "ring-2 ring-primary",
        p.conflict && pending && "ring-amber-300 dark:ring-amber-800",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <h3 className="mr-1 text-sm font-semibold">{p.title}</h3>
        <StatePill state={p.state} />
        {p.tier === "approval" && p.kind !== "clarify" && <ConfidencePill confidence={p.confidence} reasons={p.confidenceReasons} />}
        {p.conflict && (
          <Pill className="bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900">
            <TriangleAlert className="size-3" /> Conflicts with Kaizen
          </Pill>
        )}
        {p.leadId && (
          <Link href={`/accounts/${p.leadId}`} className="ml-auto text-xs text-muted-foreground hover:text-foreground hover:underline">
            {p.leadId}
          </Link>
        )}
      </div>

      {p.kind === "set_field" && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <span className="text-xs font-medium text-muted-foreground uppercase">{p.field?.replaceAll("_", " ")}</span>
          <span className={cn("rounded px-1.5", p.before && "bg-red-100/70 line-through decoration-red-400 dark:bg-red-950/50")}>{show(p.field, p.before)}</span>
          <ArrowRight className="size-3.5 text-muted-foreground" />
          <span className="rounded bg-emerald-100/70 px-1.5 font-medium dark:bg-emerald-950/50">{show(p.field, p.decision?.value ?? p.after)}</span>
        </div>
      )}

      {p.kind === "create_lead" && p.newRecord && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg bg-muted/50 p-3 text-[13px] sm:grid-cols-3">
          {(
            [
              ["Company", p.decision?.value || p.newRecord.company],
              ["Contact", [p.newRecord.contact_name, p.newRecord.contact_email].filter(Boolean).join(" · ")],
              ["Source", p.newRecord.source],
              ["Service", p.newRecord.service_interest],
              ["Value", p.newRecord.est_value_usd ? formatUsd(p.newRecord.est_value_usd) : ""],
              ["Suggested owner", p.newRecord.owner],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] text-muted-foreground">{k}</dt>
              <dd className={cn(!v && "text-muted-foreground italic")}>{v || "unknown"}</dd>
            </div>
          ))}
        </dl>
      )}

      {p.kind === "create_opportunity" && (
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <span className="font-medium">{p.decision?.value || p.opportunity?.title}</span>
          {p.opportunity?.serviceLine && <span className="text-muted-foreground"> · {p.opportunity.serviceLine}</span>}
        </div>
      )}

      {p.kind === "merge_duplicate" && dup && (
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-[13px]">
          Keep <b>{p.merge!.primary}</b> ({p.company}) and flag <b>{p.merge!.duplicate}</b> ({dup.company}, owner {dup.owner || "none"}, status {dup.status || "none"}) as merged.
        </div>
      )}

      <p className="text-[13px] text-muted-foreground">{p.explanation}</p>

      {p.evidence.length > 0 && (
        <div className="space-y-1.5">
          {p.evidence.slice(0, 3).map((e, i) => (
            <EvidenceQuote key={i} evidence={e} compact />
          ))}
        </div>
      )}

      {p.decision && p.state !== "pending" && (
        <p className="text-xs text-muted-foreground">
          {p.state === "undone" ? "Undone" : p.state[0].toUpperCase() + p.state.slice(1)} by {p.decision.by}
          {p.decision.reason ? ` — ${p.decision.reason}` : ""}
        </p>
      )}

      {mode === "edit" && (
        <div className="flex gap-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} className="h-8" autoFocus />
          <Button size="sm" onClick={() => (actions.approve(p, draft.trim()), setMode("idle"))} disabled={!draft.trim()}>
            Save & approve
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>Cancel</Button>
        </div>
      )}

      {mode === "reject" && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Why? (P4: improves accuracy tracking)</span>
          {REJECT_REASONS.map((r) => (
            <Button key={r} size="xs" variant="outline" onClick={() => (actions.reject(p, r), setMode("idle"))}>
              {r}
            </Button>
          ))}
          <Button size="xs" variant="ghost" onClick={() => setMode("idle")}>Cancel</Button>
        </div>
      )}

      {mode === "answer" && (
        <div className="space-y-2">
          <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer is logged on the account timeline" rows={2} autoFocus />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => (actions.resolve(p, answer.trim()), setMode("idle"))} disabled={!answer.trim()}>
              Save answer
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>Cancel</Button>
          </div>
        </div>
      )}

      {mode === "idle" && (
        <div className="flex flex-wrap items-center gap-2">
          {pending && p.kind !== "clarify" && (
            <>
              <Button size="sm" onClick={() => actions.approve(p)} disabled={!actions.canApprove}>
                <Check /> Approve
              </Button>
              {editable && (
                <Button size="sm" variant="outline" onClick={() => setMode("edit")} disabled={!actions.canApprove}>
                  <Pencil /> Edit
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setMode("reject")} disabled={!actions.canApprove}>
                <X /> Reject
              </Button>
            </>
          )}
          {pending && p.kind === "clarify" && (
            <>
              <Button size="sm" onClick={() => setMode("answer")} disabled={!actions.canApprove}>
                Answer
              </Button>
              <Button size="sm" variant="ghost" onClick={() => actions.reject(p, "Not needed")} disabled={!actions.canApprove}>
                Dismiss
              </Button>
            </>
          )}
          {(p.state === "approved" || p.state === "rejected" || p.state === "resolved" || p.state === "auto_applied") && (
            <Button size="sm" variant="ghost" onClick={() => actions.undo(p)} disabled={!actions.canApprove}>
              <Undo2 /> Undo
            </Button>
          )}
          {!actions.canApprove && <span className="text-xs text-muted-foreground">View-only role</span>}
        </div>
      )}
    </article>
  );
}
