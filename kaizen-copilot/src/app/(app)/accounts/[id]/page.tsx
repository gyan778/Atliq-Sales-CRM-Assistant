"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, ClipboardList, FileText, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCopilot } from "@/components/copilot-provider";
import { BriefCard } from "@/components/brief-card";
import { ProposalCard } from "@/components/proposal-card";
import { SOURCE_ICON, useSourceSheet } from "@/components/source-sheet";
import { Avatar, EmptyState, Pill, StatusPill } from "@/components/ui-kit";
import { formatDate, formatUsd } from "@/lib/dates";
import { getRecord } from "@/lib/kaizen";
import type { EditableField } from "@/lib/types";

const FIELDS: { field: EditableField; label: string }[] = [
  { field: "status", label: "Status" },
  { field: "owner", label: "Owner" },
  { field: "est_value_usd", label: "Est. value" },
  { field: "service_interest", label: "Service line" },
  { field: "contact_name", label: "Contact" },
  { field: "contact_email", label: "Email" },
  { field: "last_contact_date", label: "Last contact" },
  { field: "next_followup_date", label: "Next follow-up" },
];

function fmt(field: EditableField, v: unknown): string {
  if (v == null || v === "") return "—";
  if (field === "est_value_usd") return formatUsd(Number(v));
  if (field.endsWith("_date")) return formatDate(String(v));
  return String(v);
}

export default function AccountPage() {
  const { id } = useParams<{ id: string }>();
  const { derived, brief, seed, sourceById } = useCopilot();
  const { open } = useSourceSheet();
  const [showBrief, setShowBrief] = useState(true);
  const record = getRecord(derived.crm, decodeURIComponent(id));
  const original = seed.find((r) => r.lead_id === record?.lead_id);

  const items = brief.items.filter((i) => i.leadId === record?.lead_id);
  const pending = derived.proposals.filter((p) => p.leadId === record?.lead_id && p.state === "pending");
  const links = derived.links.filter((l) => l.leadId === record?.lead_id);

  const stakeholders = useMemo(() => {
    const m = new Map<string, { name: string; role: string | null; email: string | null }>();
    for (const l of links) for (const s of l.account.stakeholders) if (!m.has(s.name)) m.set(s.name, { name: s.name, role: s.role, email: s.email });
    return [...m.values()];
  }, [links]);

  if (!record) return <EmptyState title="Account not found" />;
  if (record.merged_into) {
    return (
      <EmptyState title={`${record.lead_id} was merged`}>
        It now lives under <Link className="underline" href={`/accounts/${record.merged_into}`}>{record.merged_into}</Link>.
      </EmptyState>
    );
  }

  const lastActivity = [...record.activities].reverse().find((a) => a.withClient) ?? record.activities.at(-1);
  const owe = items.filter((i) => ["overdue_promise", "promise_due", "awaiting_reply"].includes(i.kind));
  const coming = items.filter((i) => ["deadline", "renewal", "revisit"].includes(i.kind));
  const risks = items.filter((i) => i.kind === "risk");
  const opps = [...record.opportunities.map((o) => o.title), ...items.filter((i) => i.kind === "cross_sell").map((i) => `${i.title} (not yet logged)`)];

  return (
    <div className="space-y-6">
      <Link href="/accounts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Accounts
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{record.company}</h1>
            <StatusPill status={record.status} />
            {record.created_by_copilot && (
              <Pill className="bg-primary/10 text-primary ring-primary/20">
                <Sparkles className="size-3" /> added by copilot
              </Pill>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {record.lead_id} · {record.source || "source unknown"} · in Kaizen since {formatDate(record.created_date)}
          </p>
        </div>
        <Button variant={showBrief ? "secondary" : "outline"} onClick={() => setShowBrief((s) => !s)}>
          <ClipboardList /> Pre-call brief
        </Button>
      </header>

      {showBrief && (
        <section className="rounded-xl bg-gradient-to-br from-primary/5 to-transparent p-5 ring-1 ring-primary/20">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <ClipboardList className="size-4 text-primary" /> Before you call {record.contact_name || record.company}
          </h2>
          <div className="grid gap-4 text-[13px] sm:grid-cols-2">
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase">Last conversation</div>
              <p className="mt-1">{lastActivity ? `${formatDate(lastActivity.date)}: ${lastActivity.summary}` : "No conversation on record yet."}</p>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase">What we owe them</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {owe.length ? owe.map((i) => <li key={i.id}>{i.title} <span className="text-muted-foreground">({i.dateLabel})</span></li>) : <li className="list-none pl-0 text-muted-foreground">Nothing outstanding.</li>}
              </ul>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase">Dates that matter</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {coming.length ? coming.map((i) => <li key={i.id}>{i.title} <span className="text-muted-foreground">({i.dateLabel})</span></li>) : <li className="list-none pl-0 text-muted-foreground">None captured.</li>}
              </ul>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase">Openings & watch-outs</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {opps.map((o) => <li key={o}>{o}</li>)}
                {risks.map((r) => <li key={r.id} className="text-amber-700 dark:text-amber-400">{r.title}</li>)}
                {!opps.length && !risks.length && <li className="list-none pl-0 text-muted-foreground">None captured.</li>}
              </ul>
            </div>
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">Assembled from Kaizen and verified quotes only. Nothing here is generated beyond what the sources say.</p>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Open items <span className="font-normal text-muted-foreground">· {items.length}</span></h2>
            {items.length ? items.map((i) => <BriefCard key={i.id} item={i} />) : <EmptyState title="Nothing open for this account" />}
          </section>

          {pending.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">Waiting for approval <span className="font-normal text-muted-foreground">· {pending.length}</span></h2>
              {pending.map((p) => <ProposalCard key={p.id} p={p} />)}
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Timeline</h2>
            {record.activities.length === 0 && <EmptyState title="No activity logged yet" />}
            <ol className="relative space-y-4 border-l pl-5">
              {[...record.activities].reverse().map((a) => {
                const src = sourceById(a.sourceId);
                const Icon = src ? SOURCE_ICON[src.type] : FileText;
                return (
                  <li key={a.id} className="relative">
                    <span className="absolute top-1 -left-[27px] flex size-3.5 items-center justify-center rounded-full bg-background ring-2 ring-primary/40" />
                    <div className="text-xs text-muted-foreground">
                      {formatDate(a.date)} · {a.withClient ? "with client" : "internal"}
                    </div>
                    <p className="mt-0.5 text-[13px]">{a.summary}</p>
                    {src && (
                      <button onClick={() => open(src.id)} className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <Icon className="size-3" /> {src.title.replace(/^(Email Thread|Email|Meeting Notes)\s*[:—-]\s*/i, "")}
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <h2 className="mb-3 text-sm font-semibold">Kaizen record</h2>
            <dl className="space-y-2 text-[13px]">
              {FIELDS.map(({ field, label }) => {
                const now = record[field];
                const before = original?.[field];
                const changed = original && (before ?? "") !== (now ?? "");
                return (
                  <div key={field} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right">
                      <span className={changed ? "font-medium text-primary" : ""}>{fmt(field, now)}</span>
                      {changed && <div className="text-[11px] text-muted-foreground line-through">{fmt(field, before)}</div>}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {record.notes && <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">Notes: {record.notes}</p>}
          </section>

          {record.opportunities.length > 0 && (
            <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <h2 className="mb-2 text-sm font-semibold">Opportunities</h2>
              <ul className="space-y-1.5 text-[13px]">
                {record.opportunities.map((o) => (
                  <li key={o.id} className="flex items-start gap-1.5">
                    <Sparkles className="mt-0.5 size-3.5 text-primary" />
                    <span>{o.title}{o.serviceLine && <span className="text-muted-foreground"> · {o.serviceLine}</span>}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Users className="size-4" /> People</h2>
            <ul className="space-y-2 text-[13px]">
              {record.contact_name && (
                <li className="flex items-center gap-2">
                  <Avatar name={record.contact_name} className="size-6 text-[10px]" />
                  <span>{record.contact_name}<span className="block text-[11px] text-muted-foreground">primary contact</span></span>
                </li>
              )}
              {stakeholders.filter((s) => s.name !== record.contact_name).map((s) => (
                <li key={s.name} className="flex items-center gap-2">
                  <Avatar name={s.name} className="size-6 text-[10px]" />
                  <span>{s.name}{s.role && <span className="block text-[11px] text-muted-foreground">{s.role}</span>}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
