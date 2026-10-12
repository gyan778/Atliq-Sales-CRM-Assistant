"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Papa from "papaparse";
import { Download, RotateCcw, ShieldAlert, ShieldCheck, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCopilot } from "@/components/copilot-provider";
import { useActions } from "@/components/use-actions";
import { PageHeader, StatePill } from "@/components/ui-kit";
import { RULES } from "@/lib/config";
import { formatDate, formatUsd } from "@/lib/dates";
import { toKaizenCsv } from "@/lib/kaizen";
import { useCopilotStore } from "@/lib/store";
import { cn } from "@/lib/utils";

function download(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtValue(field: string | undefined, v: string | undefined) {
  if (!v) return "empty";
  if (field === "est_value_usd") return formatUsd(Number(v));
  return v;
}

export default function AuditPage() {
  const { derived, extractionMeta, user } = useCopilot();
  const actions = useActions();
  const done = useCopilotStore((s) => s.done);
  const reset = useCopilotStore((s) => s.reset);
  const [show, setShow] = useState<"all" | "auto" | "human">("all");

  const entries = useMemo(() => {
    const rows = derived.proposals
      .filter((p) => !["pending", "superseded"].includes(p.state))
      .map((p) => ({
        p,
        at: p.decision?.at ?? extractionMeta[p.sourceIds[0]]?.extractedAt ?? p.date,
        by: p.decision?.by ?? "Kaizen Copilot (policy: low-risk)",
      }));
    return rows
      .filter((r) => (show === "auto" ? r.p.tier === "auto" : show === "human" ? r.p.tier === "approval" : true))
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [derived.proposals, extractionMeta, show]);

  const decided = derived.proposals.filter((p) => p.tier === "approval" && (p.state === "approved" || p.state === "rejected"));
  const rejected = decided.filter((p) => p.state === "rejected");
  const rate = decided.length ? rejected.length / decided.length : 0;
  const alert = decided.length >= RULES.minDecisionsForAlert && rate > RULES.rejectRateAlert;
  const reasons = Object.entries(
    rejected.reduce<Record<string, number>>((m, p) => ((m[p.decision?.reason ?? "unspecified"] = (m[p.decision?.reason ?? "unspecified"] ?? 0) + 1), m), {}),
  );

  const changeLog = () =>
    Papa.unparse(
      derived.proposals
        .filter((p) => p.state === "approved" || p.state === "auto_applied")
        .map((p) => ({
          lead_id: p.leadId ?? p.id,
          company: p.company,
          change: p.kind,
          field: p.field ?? "",
          old_value: p.before ?? "",
          new_value: p.decision?.value ?? p.after ?? (p.kind === "create_opportunity" ? p.opportunity?.title : ""),
          approved_by: p.decision?.by ?? "auto (low-risk policy)",
          approved_at: p.decision?.at ?? "",
          source_ids: p.sourceIds.join(" "),
          evidence: p.evidence.map((e) => e.quote).join(" | "),
        })),
    );

  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Every change Kaizen Copilot made or was asked to make: who approved it, when, and from which source. Anything can be undone."
        actions={
          <>
            <Button variant="outline" onClick={() => download("kaizen-import.csv", toKaizenCsv(derived.crm))}>
              <Download /> Kaizen import file
            </Button>
            <Button variant="outline" onClick={() => download("kaizen-change-log.csv", changeLog())}>
              <Download /> Change log
            </Button>
          </>
        }
      />

      <div
        className={cn(
          "mb-6 flex flex-wrap items-start gap-3 rounded-xl p-4 ring-1",
          alert ? "bg-red-50 ring-red-200 dark:bg-red-950/40 dark:ring-red-900" : "bg-emerald-50/60 ring-emerald-200 dark:bg-emerald-950/30 dark:ring-emerald-900",
        )}
      >
        {alert ? <ShieldAlert className="size-5 text-red-600" /> : <ShieldCheck className="size-5 text-emerald-600" />}
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium">
            {alert ? "Quality alert: founders are rejecting too many suggestions" : "Suggestion quality within limits"}
          </div>
          <div className="text-muted-foreground">
            {decided.length} decisions · {Math.round(rate * 100)}% rejected (alert above {Math.round(RULES.rejectRateAlert * 100)}% after {RULES.minDecisionsForAlert}
            {" "}decisions{alert ? " — pause AI processing with the kill switch and review the prompt" : ""}).
            {reasons.length > 0 && ` Reasons: ${reasons.map(([r, n]) => `${r} (${n})`).join(", ")}.`}
          </div>
        </div>
      </div>

      <div className="mb-3 flex gap-1.5">
        {(["all", "auto", "human"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setShow(s)}
            className={cn("rounded-full px-3 py-1 text-sm ring-1", show === s ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border hover:bg-muted")}
          >
            {s === "all" ? "All" : s === "auto" ? "Auto-applied" : "Founder decisions"}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">When</th>
              <th className="px-3 py-2.5 font-medium">Account</th>
              <th className="px-3 py-2.5 font-medium">Change</th>
              <th className="px-3 py-2.5 font-medium">By</th>
              <th className="px-3 py-2.5 font-medium">State</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {entries.slice(0, 400).map(({ p, at, by }) => (
              <tr key={p.id} className="align-top">
                <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">{formatDate(at.slice(0, 10))}</td>
                <td className="px-3 py-2.5">
                  {p.leadId ? <Link href={`/accounts/${p.leadId}`} className="font-medium hover:underline">{p.company}</Link> : <span className="font-medium">{p.company}</span>}
                </td>
                <td className="px-3 py-2.5">
                  <div>{p.title}</div>
                  {p.kind === "set_field" && (
                    <div className="text-xs text-muted-foreground">
                      {fmtValue(p.field, p.before)} → {fmtValue(p.field, p.decision?.value ?? p.after)}
                    </div>
                  )}
                  {p.decision?.reason && <div className="text-xs text-muted-foreground">Reason: {p.decision.reason}</div>}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{by}</td>
                <td className="px-3 py-2.5"><StatePill state={p.state} /></td>
                <td className="px-3 py-2.5 text-right">
                  {p.state !== "undone" && actions.canApprove && (
                    <Button size="xs" variant="ghost" onClick={() => actions.undo(p)}>
                      <Undo2 /> Undo
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {Object.keys(done).length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold">Marked done</h2>
          <ul className="divide-y rounded-xl bg-card text-[13px] ring-1 ring-foreground/10">
            {Object.entries(done).map(([key, d]) => (
              <li key={key} className="flex items-center gap-3 px-4 py-2">
                <span className="flex-1">{d.label}</span>
                <span className="text-muted-foreground">{d.by} · {formatDate(d.at.slice(0, 10))}</span>
                <Button size="xs" variant="ghost" onClick={() => actions.undone(key)}>
                  <Undo2 /> Reopen
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10 flex items-center justify-between rounded-xl border border-dashed p-4 text-sm">
        <span className="text-muted-foreground">Demo state is stored in this browser. Reset returns Kaizen to the original export.</span>
        <Button
          variant="destructive"
          onClick={() => {
            if (confirm(`Reset all decisions, done marks and captures for this browser? (${user.name})`)) {
              reset();
              toast("Demo reset");
            }
          }}
        >
          <RotateCcw /> Reset demo
        </Button>
      </div>
    </>
  );
}
