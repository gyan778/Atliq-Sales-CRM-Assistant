"use client";

import { useState } from "react";
import { Ban, CheckCircle2, CircleHelp, Copy, ShieldCheck, UserCheck, XCircle, Zap } from "lucide-react";
import evalReport from "@data/eval-report.json";
import { useCopilot } from "@/components/copilot-provider";
import { Input } from "@/components/ui/input";
import { PageHeader, Pill, StatTile } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

interface EvalReport {
  generatedAt?: string;
  model?: string;
  sourcesProcessed?: number;
  accountMatch?: { expected: number; found: number; rate: number };
  signalRecall?: { expected: number; found: number; rate: number };
  byCategory?: Record<string, { expected: number; found: number }>;
  groundedness?: { itemsChecked: number; blockedNoEvidence: number; verifiedRate: number };
  scenarios?: { name: string; pass: boolean }[];
}
const report = evalReport as EvalReport;


const GUARDRAILS = [
  ["G1", "No claim without a source", "Every item carries a quote; code checks it appears word-for-word in the source, or the item is dropped."],
  ["G2", "Nothing invented", "Unknown stays unknown. Emails must literally appear in the source; deal values use the lower bound of a stated range."],
  ["G3", "Approval tiers", "Activity log and last-contact date auto-apply (logged, undoable). New leads, status, value, owner, follow-ups, merges need a founder."],
  ["G4", "Uncertain = ask", "Ambiguities become questions in the Review Queue and are never written to Kaizen."],
  ["G5", "Conflicts shown, not overwritten", "When a source disagrees with Kaizen, both values are shown and a founder chooses."],
  ["G6", "No duplicates", "Records are matched by email, domain, then name before any new lead is proposed; merges keep both records."],
  ["G7", "Never contacts clients", "The app has no email-sending capability at all."],
  ["G8", "Email text is data, not instructions", "The extraction call has no tools and no write access; hidden instructions are flagged and ignored."],
  ["G11", "Confidence computed by code", "Based on quote verification, match method, conflicts and explicitness — not the model's self-rating."],
  ["G12", "Who said it", "Every commitment is tagged AtliQ or client; only AtliQ's promises become to-dos."],
  ["G13", "Relative dates anchored", "'Next week' is resolved against the message date, and the original wording is kept."],
  ["G14", "Older never overwrites newer", "Field changes from sources older than Kaizen's last update are skipped."],
  ["G15", "Closed vocabularies", "Statuses, service lines and signal types come from fixed lists enforced by the output schema."],
  ["G16", "Sensitive data redacted", "Phone, card, ID and password patterns are removed before text is stored or sent to the model."],
  ["G17", "Kill switch + quality alert", "AI_ENABLED=false stops all processing; the Audit Log alerts when founders reject over 30% of suggestions."],
] as const;

const SECURITY = [
  ["S1", "API key stays on the server", "The AI model is called only from server code; the key is a Vercel environment variable."],
  ["S2", "Password-protected", "Every page and API route requires a signed, httpOnly session cookie."],
  ["S3", "Rate and size limits", "Quick Capture: 10 requests/min per IP, 10,000 characters, daily cap."],
  ["S4", "Strict output check", "Model output is parsed against a schema; anything else is rejected."],
  ["S5", "No code injection", "AI text is rendered as plain text; CSP and security headers on every response."],
  ["S6", "No delete operation", "The Kaizen connector can create, update, append and merge — it cannot delete."],
  ["S7", "Roles", "Founders and the sales executive approve; CTO and PM are view-only."],
  ["S8", "No secrets in logs", "Errors are logged without request bodies or keys."],
  ["S9", "Synthetic-data banner", "Shown on every page."],
] as const;

export default function TrustPage() {
  const { derived, extractions, extractionMeta } = useCopilot();
  const [volume, setVolume] = useState(600);

  const all = Object.values(extractions);
  const checked = all.reduce((s, e) => s + e.stats.items, 0);
  const blocked = all.reduce((s, e) => s + e.blocked.length, 0);
  const auto = derived.proposals.filter((p) => p.tier === "auto").length;
  const gated = derived.proposals.filter((p) => p.tier === "approval" && p.kind !== "clarify").length;
  const clar = derived.proposals.filter((p) => p.kind === "clarify").length;
  const dups = derived.proposals.filter((p) => p.kind === "merge_duplicate").length;

  const metas = Object.values(extractionMeta).filter((m) => m.usage.input_tokens > 0);
  const inTok = metas.reduce((s, m) => s + m.usage.input_tokens, 0);
  const outTok = metas.reduce((s, m) => s + m.usage.output_tokens, 0);
  const perSource = metas.length ? metas.reduce((s, m) => s + (m.costUsd ?? 0), 0) / metas.length : 0;
  const pct = (x?: number) => (x == null ? "—" : `${Math.round(x * 100)}%`);

  return (
    <>
      <PageHeader title="Trust & Safety" description="How Kaizen Copilot stays grounded and safe — with live numbers from this dataset." />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatTile label="AI claims checked" icon={CheckCircle2} value={checked} hint="by code, not by the model" />
        <StatTile label="Blocked" icon={Ban} value={blocked} hint="unverifiable or invalid" tone={blocked ? "warn" : "default"} />
        <StatTile label="Auto-applied" icon={Zap} value={auto} hint="low-risk, undoable" />
        <StatTile label="Need a founder" icon={UserCheck} value={gated} hint="never silent" />
        <StatTile label="Held as questions" icon={CircleHelp} value={clar} hint="not written" />
        <StatTile label="Duplicates caught" icon={Copy} value={dups} hint="before they spread" />
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <h2 className="font-semibold">Evaluation against the answer key</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            The dataset&apos;s editorial notes record what really happened. They are stripped before the AI reads anything and used only here.
          </p>
          {report.signalRecall ? (
            <>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div><div className="text-2xl font-semibold">{pct(report.accountMatch?.rate)}</div><div className="text-xs text-muted-foreground">accounts matched</div></div>
                <div><div className="text-2xl font-semibold">{pct(report.signalRecall.rate)}</div><div className="text-xs text-muted-foreground">signals caught</div></div>
                <div><div className="text-2xl font-semibold">{pct(report.groundedness?.verifiedRate)}</div><div className="text-xs text-muted-foreground">quotes verified</div></div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {Object.entries(report.byCategory ?? {}).map(([k, c]) => (
                  <Pill key={k} className="bg-background ring-border">{k.replace("_", "-")} {c.found}/{c.expected}</Pill>
                ))}
              </div>
              <ul className="mt-4 space-y-1 text-[13px]">
                {report.scenarios?.map((s) => (
                  <li key={s.name} className="flex items-start gap-2">
                    {s.pass ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" />}
                    {s.name}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-muted-foreground">Run {report.generatedAt?.slice(0, 10)} on {report.sourcesProcessed} sources with {report.model}. Re-run with npm run eval.</p>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No evaluation yet — run npm run eval after extraction.</p>
          )}
        </div>

        <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <h2 className="font-semibold">Cost to run</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Measured from real token usage on this dataset (one model call per email or note; results cached so nothing is processed twice).</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">Model</dt><dd className="font-medium">{metas[0]?.model ?? report.model ?? "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Sources processed</dt><dd className="font-medium">{metas.length}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Avg tokens / source</dt><dd className="font-medium">{metas.length ? `${Math.round(inTok / metas.length)} in · ${Math.round(outTok / metas.length)} out` : "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Avg cost / source</dt><dd className="font-medium">{metas.length ? `$${perSource.toFixed(4)}` : "—"}</dd></div>
          </dl>
          <div className="mt-5 rounded-lg bg-muted/50 p-3">
            <label className="text-xs text-muted-foreground" htmlFor="vol">Emails + notes per month</label>
            <div className="mt-1 flex items-center gap-3">
              <Input id="vol" type="number" min={0} value={volume} onChange={(e) => setVolume(Math.max(0, Number(e.target.value)))} className="h-8 w-28" />
              <span className="text-sm">
                ≈ <b>${(perSource * volume).toFixed(2)}</b> / month in model usage
              </span>
            </div>
          </div>
        </div>
      </section>

      {[
        ["Guardrails", GUARDRAILS],
        ["Security", SECURITY],
      ].map(([title, rows]) => (
        <section key={title as string} className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-primary" /> {title as string}</h2>
          <div className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
            {(rows as readonly (readonly [string, string, string])[]).map(([id, name, how]) => (
              <div key={id} className="grid gap-1 px-4 py-3 text-[13px] sm:grid-cols-[56px_220px_1fr]">
                <span className="font-mono text-xs text-muted-foreground">{id}</span>
                <span className="font-medium">{name}</span>
                <span className="text-muted-foreground">{how}</span>
              </div>
            ))}
          </div>
        </section>
      ))}

      {derived.blocked.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-semibold">What the guardrails blocked</h2>
          <div className="divide-y rounded-xl bg-card text-[13px] ring-1 ring-foreground/10">
            {derived.blocked.flatMap((b) =>
              b.items.map((it, i) => (
                <div key={`${b.sourceId}${i}`} className={cn("grid gap-1 px-4 py-2.5 sm:grid-cols-[220px_1fr]")}>
                  <span className="text-muted-foreground">{b.sourceId}</span>
                  <span>
                    <b>{it.account}</b> · {it.kind}: {it.reason}
                    {it.evidence && <span className="text-muted-foreground"> — “{it.evidence}”</span>}
                    {it.value && <span className="text-muted-foreground"> — {it.value}</span>}
                  </span>
                </div>
              )),
            )}
          </div>
        </section>
      )}
    </>
  );
}
