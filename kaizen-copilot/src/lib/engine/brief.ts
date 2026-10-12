import { RULES } from "../config";
import { addDays, daysBetween } from "../dates";
import { getRecord } from "../kaizen";
import type { CrmRecord } from "../types";
import { similarText, supersededBy, type AccountLink, type DerivedState, type DoneMark, type Evidence, type Proposal } from "./derive";
import { parseUsd } from "../guardrails/validate";
import { domainOf, normalizeCompany } from "./match";

// Deterministic rules over the derived state. No AI here: dates, thresholds and ranking are plain code.

export type BriefKind =
  | "overdue_promise"
  | "promise_due"
  | "awaiting_reply"
  | "deadline"
  | "revisit"
  | "cross_sell"
  | "renewal"
  | "risk"
  | "new_lead"
  | "stale_deal"
  | "duplicate"
  | "clarify";

export type BriefGroup = "follow_ups" | "opportunities" | "deadlines" | "hygiene";
export type Severity = "critical" | "high" | "medium" | "low";

export interface BriefItem {
  id: string;
  ids: string[]; // underlying extraction item ids (marking done covers all of them)
  kind: BriefKind;
  group: BriefGroup;
  severity: Severity;
  score: number;
  title: string;
  detail: string;
  company: string;
  key: string;
  leadId: string | null;
  owner: string | null; // person responsible for this item
  accountOwner: string | null;
  valueUsd: number | null;
  date: string | null; // due / since date
  dateLabel: string;
  assumedDate?: boolean;
  evidence: Evidence[];
  proposalId?: string;
  doneable: boolean;
  internal?: boolean; // raised only by an internal note
}

export interface BriefKpis {
  revenueAtRisk: number;
  atRiskAccounts: number;
  atRiskUnknownValue: number;
  overduePromises: number;
  waitingOnUs: number;
  pendingApprovals: number;
  newLeads: number;
  openOpportunities: number;
  unowned: number;
}

const GROUP: Record<BriefKind, BriefGroup> = {
  overdue_promise: "follow_ups",
  promise_due: "follow_ups",
  awaiting_reply: "follow_ups",
  stale_deal: "follow_ups",
  cross_sell: "opportunities",
  renewal: "opportunities",
  new_lead: "opportunities",
  revisit: "opportunities",
  deadline: "deadlines",
  risk: "deadlines",
  duplicate: "hygiene",
  clarify: "hygiene",
};

const FOLLOW = new Set<BriefKind>(["overdue_promise", "promise_due", "awaiting_reply"]);

/** Two brief items describe the same thing (same account checked by the caller). */
function isTwin(a: Pick<BriefItem, "kind" | "title" | "date">, b: Pick<BriefItem, "kind" | "title" | "date">): boolean {
  if (FOLLOW.has(a.kind) && FOLLOW.has(b.kind)) return similarText(a.title, b.title) >= 0.5;
  // "Check back in Q2" is captured both as a promise and as a revisit - one item.
  if ((a.kind === "revisit" && FOLLOW.has(b.kind)) || (b.kind === "revisit" && FOLLOW.has(a.kind))) return similarText(a.title, b.title) >= 0.5;
  if (a.kind !== b.kind) return false;
  if (a.kind === "risk") return true; // one risk item per account, evidence merged
  if (a.kind === "deadline") return (!!a.date && a.date === b.date) || similarText(a.title, b.title) >= 0.5;
  if (a.kind === "stale_deal" || a.kind === "duplicate" || a.kind === "clarify" || a.kind === "new_lead") return a.title === b.title;
  return similarText(a.title, b.title) >= 0.4;
}

const WEIGHT: Record<Severity, number> = { critical: 100, high: 60, medium: 30, low: 10 };
const OPEN_STATUSES = new Set(["", "New", "Contacted", "Proposal Sent"]);

export function buildBrief(state: DerivedState, done: Record<string, DoneMark>, today: string) {
  const doneIds = new Set(Object.values(done).flatMap((d) => d.ids));
  const items: BriefItem[] = [];
  const proposalsById = new Map(state.proposals.map((p) => [p.id, p]));

  const accountInfo = (link: AccountLink): { record?: CrmRecord; owner: string | null; value: number | null } => {
    const record = link.leadId ? getRecord(state.crm, link.leadId) : undefined;
    if (record) return { record, owner: record.owner || null, value: record.est_value_usd };
    const create = link.createProposalId ? proposalsById.get(link.createProposalId) : undefined;
    const est = link.account.field_updates.find((f) => f.field === "est_value_usd");
    return {
      owner: create?.newRecord?.owner || null,
      value: est ? (parseUsd(est.value)?.low ?? null) : (create?.newRecord?.est_value_usd ?? null),
    };
  };

  const push = (it: Omit<BriefItem, "group" | "score" | "id"> & { id?: string }) => {
    it.internal ??= false;
    // Same promise or request repeated across sources -> one item with all the evidence.
    let twin = items.find((x) => x.key === it.key && isTwin(x, it));
    // An internal note restating a client's ask adds evidence to the client's item, not a new card.
    if (!twin && it.internal && FOLLOW.has(it.kind)) twin = items.find((x) => x.key === it.key && FOLLOW.has(x.kind) && !x.internal);
    if (twin) {
      twin.ids.push(...it.ids);
      twin.evidence.push(...it.evidence);
      // A promise (has an owner and a due date) is more actionable than the matching client ask.
      if (it.internal && !twin.internal) return; // internal restatement: evidence only, keep the client's wording
      if (twin.kind === "awaiting_reply" && it.kind !== "awaiting_reply" && FOLLOW.has(it.kind)) {
        Object.assign(twin, { kind: it.kind, title: it.title, detail: it.detail, owner: it.owner, assumedDate: it.assumedDate });
      }
      if (it.kind === "revisit" && twin.kind !== "revisit") {
        Object.assign(twin, {
          kind: it.kind,
          group: GROUP[it.kind],
          severity: it.severity,
          title: it.title,
          detail: it.detail,
          dateLabel: it.dateLabel,
          date: it.date,
          assumedDate: false,
        });
        return;
      }
      if (WEIGHT[it.severity] > WEIGHT[twin.severity]) {
        twin.severity = it.severity;
        twin.date = it.date;
        twin.dateLabel = it.dateLabel;
      }
      return;
    }
    items.push({ ...it, id: it.id ?? it.ids[0], group: GROUP[it.kind], score: 0 });
  };

  for (const link of state.links) {
    const { source, account } = link;
    const { record, owner, value } = accountInfo(link);
    if (record?.merged_into) continue;
    // Latest conversation wins: a later two-way conversation retires this source's open items.
    const stale = !!supersededBy(link, state.links);
    const common = {
      internal: link.internal,
      company: link.company,
      key: link.key,
      leadId: link.leadId,
      accountOwner: owner,
      valueUsd: value,
      doneable: true,
    };

    // AtliQ's own promises (G12: client promises are not AtliQ's to-dos).
    for (const c of stale ? [] : account.commitments) {
      if (c.by !== "atliq" || c.fulfilled_in_source || doneIds.has(c.id)) continue;
      const due = c.due_date ?? addDays(source.date, RULES.promiseDefaultDays);
      const late = daysBetween(due, today);
      if (late < -7) continue;
      const big = (value ?? 0) >= 50_000;
      push({
        ...common,
        ids: [c.id],
        kind: late > 0 ? "overdue_promise" : "promise_due",
        severity: late >= 14 || (big && late >= 3) ? "critical" : late > 0 ? "high" : late >= -3 ? "medium" : "low",
        title: c.action,
        detail: `${c.person ?? "Nobody"} promised this${c.due_phrase ? ` ("${c.due_phrase}")` : ""} in "${source.title}".`,
        owner: c.person ?? owner,
        date: due,
        dateLabel: late > 0 ? `${late}d overdue` : late === 0 ? "due today" : `due in ${-late}d`,
        assumedDate: !c.due_date,
        evidence: [{ quote: c.evidence, sourceId: source.id }],
      });
    }

    // Client asks that AtliQ has not answered.
    let requestFromThisSource = false;
    for (const r of stale ? [] : account.open_requests) {
      if (r.answered_in_source || doneIds.has(r.id)) continue;
      const since = r.asked_on ?? source.date;
      const waiting = daysBetween(since, today);
      if (waiting < RULES.awaitingReplyDays) continue;
      requestFromThisSource = true;
      push({
        ...common,
        ids: [r.id],
        kind: "awaiting_reply",
        severity: waiting >= 14 ? "critical" : waiting >= 5 ? "high" : "medium",
        title: r.request,
        detail: `Client asked on ${since}; no answer in the thread.`,
        owner,
        date: since,
        dateLabel: `waiting ${waiting}d`,
        evidence: [{ quote: r.evidence, sourceId: source.id }],
      });
    }

    // Deterministic backstop: the thread's last message is from the client and nobody replied.
    const last = source.messages.at(-1);
    const awaitId = `await:${source.id}`;
    const fromThisCompany =
      !!last && (account.contact_email ? last.fromEmail === account.contact_email || domainOf(last.fromEmail) === domainOf(account.contact_email) : true);
    if (
      !stale &&
      !requestFromThisSource &&
      account.interaction_with_client &&
      last &&
      !last.isAtliq &&
      !last.isAutoReply &&
      last.asks &&
      fromThisCompany &&
      !doneIds.has(awaitId) &&
      daysBetween(last.date, today) >= RULES.awaitingReplyDays &&
      !items.some((x) => x.ids.includes(awaitId))
    ) {
      const waiting = daysBetween(last.date, today);
      push({
        ...common,
        ids: [awaitId],
        kind: "awaiting_reply",
        severity: waiting >= 14 ? "critical" : waiting >= 5 ? "high" : "medium",
        title: `Reply to ${last.fromName}`,
        detail: `Last message in "${source.title}" is from the client; AtliQ has not replied.`,
        owner,
        date: last.date,
        dateLabel: `waiting ${waiting}d`,
        evidence: [],
      });
    }

    for (const s of account.signals) {
      if (doneIds.has(s.id)) continue;
      const ev = [{ quote: s.evidence, sourceId: source.id }];
      if (s.type === "deadline" && s.due_date) {
        const until = daysBetween(today, s.due_date);
        if (until < -14 || until > RULES.deadlineWindowDays) continue;
        push({
          ...common,
          ids: [s.id],
          kind: "deadline",
          severity: until <= 7 ? "critical" : until <= 14 ? "high" : "medium",
          title: s.title,
          detail: s.detail,
          owner,
          date: s.due_date,
          dateLabel: until < 0 ? `passed ${-until}d ago` : until === 0 ? "today" : `in ${until}d`,
          evidence: ev,
        });
      } else if (s.type === "revisit") {
        if (stale) continue;
        const until = s.due_date ? daysBetween(today, s.due_date) : null;
        if (until !== null && until > RULES.revisitLeadDays) continue;
        push({
          ...common,
          ids: [s.id],
          kind: "revisit",
          severity: until === null || until <= 0 ? "high" : "medium",
          title: s.title,
          detail: s.detail,
          owner,
          date: s.due_date,
          dateLabel: until === null ? (s.due_phrase ?? "now") : until <= 0 ? `due since ${s.due_date}` : `in ${until}d`,
          evidence: ev,
        });
      } else if (s.type === "cross_sell") {
        const pid = state.signalProposal[s.id];
        const p = pid ? proposalsById.get(pid) : undefined;
        if (p && (p.state === "approved" || p.state === "rejected")) continue;
        push({
          ...common,
          ids: [s.id],
          kind: "cross_sell",
          severity: "medium",
          title: s.title,
          detail: s.detail,
          owner,
          date: source.date,
          dateLabel: `raised ${daysBetween(source.date, today)}d ago`,
          evidence: ev,
          proposalId: pid,
        });
      } else if (s.type === "renewal") {
        const until = s.due_date ? daysBetween(today, s.due_date) : null;
        if (until !== null && until > 120) continue;
        push({
          ...common,
          ids: [s.id],
          kind: "renewal",
          severity: until !== null && until <= 45 ? "high" : "medium",
          title: s.title,
          detail: s.detail,
          owner,
          date: s.due_date,
          dateLabel: until === null ? (s.due_phrase ?? "") : `in ${until}d`,
          evidence: ev,
        });
      } else if (s.type === "risk" && daysBetween(source.date, today) <= 60) {
        push({
          ...common,
          ids: [s.id],
          kind: "risk",
          severity: "low",
          title: s.title,
          detail: s.detail,
          owner,
          date: source.date,
          dateLabel: `flagged ${daysBetween(source.date, today)}d ago`,
          evidence: ev,
        });
      }
    }
  }

  // Proposals that deserve a place on the brief.
  for (const p of state.proposals) {
    if (p.state !== "pending") continue;
    if (p.kind === "create_lead") {
      const referral = p.newRecord?.source === "Referral";
      push(proposalItem(p, "new_lead", referral || daysBetween(p.date, today) <= 14 ? "high" : "medium", p.newRecord?.owner || null, today));
    } else if (p.kind === "merge_duplicate") {
      push(proposalItem(p, "duplicate", "medium", getRecord(state.crm, p.leadId!)?.owner || null, today));
    } else if (p.kind === "clarify") {
      const owner = p.leadId ? getRecord(state.crm, p.leadId)?.owner || null : null;
      push(proposalItem(p, "clarify", "low", owner, today));
    }
  }

  // Stale open deals with nothing else on the brief.
  const pendingDuplicates = new Set(
    state.proposals.filter((p) => p.kind === "merge_duplicate" && p.state === "pending").map((p) => p.merge!.duplicate),
  );
  for (const r of state.crm) {
    if (r.merged_into || pendingDuplicates.has(r.lead_id) || !OPEN_STATUSES.has(r.status)) continue;
    if (items.some((x) => x.leadId === r.lead_id) || doneIds.has(`stale:${r.lead_id}`)) continue;
    const lastTouch = [r.last_contact_date, r.created_date].filter(Boolean).sort().at(-1) ?? r.created_date;
    const idle = daysBetween(lastTouch, today);
    if (idle < RULES.staleDealDays) continue;
    push({
      ids: [`stale:${r.lead_id}`],
      kind: "stale_deal",
      severity: r.status === "Proposal Sent" || (r.est_value_usd ?? 0) >= 40_000 ? "high" : "medium",
      title: `No contact in ${idle} days`,
      detail: `${r.status || "No status"}${r.notes ? ` · Kaizen note: "${r.notes}"` : ""}`,
      company: r.company,
      key: r.lead_id,
      leadId: r.lead_id,
      owner: r.owner || null,
      accountOwner: r.owner || null,
      valueUsd: r.est_value_usd,
      date: lastTouch,
      dateLabel: `idle ${idle}d`,
      evidence: [],
      doneable: true,
    });
  }

  for (const it of items) {
    // Within a severity band, deal size outweighs how long something has been overdue.
    const valueBoost = Math.min((it.valueUsd ?? 0) / 5_000, 20);
    const overdueBoost = it.date && it.date < today && it.kind !== "revisit" ? Math.min(daysBetween(it.date, today), 15) : 0;
    const imminent = it.date && it.date >= today && daysBetween(today, it.date) <= 7 && (it.kind === "deadline" || it.kind === "promise_due") ? 15 : 0;
    it.score = WEIGHT[it.severity] + valueBoost + overdueBoost + imminent;
  }
  items.sort((a, b) => b.score - a.score);
  return { items, kpis: computeKpis(items, state.proposals) };
}

/** Headline numbers for a set of brief items (the whole team, or one person's view). */
export function computeKpis(items: BriefItem[], proposals: Proposal[]): BriefKpis {
  const atRiskKinds = new Set<BriefKind>(["overdue_promise", "awaiting_reply", "deadline", "stale_deal"]);
  const atRisk = new Map<string, number | null>();
  for (const it of items) {
    if (atRiskKinds.has(it.kind) && it.severity === "critical") atRisk.set(it.key, it.valueUsd);
  }
  return {
    revenueAtRisk: [...atRisk.values()].reduce<number>((s, v) => s + (v ?? 0), 0),
    atRiskAccounts: atRisk.size,
    atRiskUnknownValue: [...atRisk.values()].filter((v) => v == null).length,
    overduePromises: items.filter((i) => i.kind === "overdue_promise").length,
    waitingOnUs: items.filter((i) => i.kind === "awaiting_reply").length,
    pendingApprovals: proposals.filter((p) => p.state === "pending" && p.kind !== "clarify").length,
    newLeads: items.filter((i) => i.kind === "new_lead").length,
    openOpportunities: items.filter((i) => i.kind === "cross_sell").length,
    unowned: items.filter((i) => !i.owner && i.group !== "hygiene").length,
  };
}

function proposalItem(p: Proposal, kind: BriefKind, severity: Severity, owner: string | null, today: string) {
  return {
    ids: [p.id],
    kind,
    severity,
    title: kind === "new_lead" ? `${p.company} is not in Kaizen` : kind === "duplicate" ? p.title : p.explanation,
    detail: kind === "clarify" ? "Kaizen stays unchanged until a founder answers." : p.explanation,
    company: p.company,
    key: p.leadId ?? `new:${normalizeCompany(p.company)}`,
    leadId: p.leadId,
    owner,
    accountOwner: owner,
    valueUsd: p.newRecord?.est_value_usd ?? null,
    date: p.date,
    dateLabel: kind === "new_lead" ? `seen ${daysBetween(p.date, today)}d ago` : "",
    evidence: p.evidence,
    proposalId: p.id,
    doneable: false,
  };
}
