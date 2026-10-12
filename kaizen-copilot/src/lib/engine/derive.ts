import type { ValidatedAccount, ValidatedExtraction, BlockedItem } from "../guardrails/validate";
import { parseUsd } from "../guardrails/validate";
import type { CrmRecord, EditableField, Source } from "../types";
import { SELLERS, RULES } from "../config";
import { addDays } from "../dates";
import {
  addOpportunity,
  appendActivity,
  cloneCrm,
  createLead,
  fieldValue,
  getRecord,
  markMerged,
  updateField,
} from "../kaizen";
import { companySimilarity, companyTokens, domainOf, findDuplicates, matchAccount, normalizeCompany, type MatchResult } from "./match";

// Turns validated AI extractions into proposed Kaizen changes, applies the ones policy or a founder
// allows, and returns the resulting CRM state. Pure function: same inputs -> same state.

export interface Decision {
  status: "approved" | "rejected" | "undone" | "resolved";
  by: string;
  at: string;
  value?: string; // value written at approval (possibly edited)
  reason?: string; // reject reason or clarification note
}

export interface DoneMark {
  by: string;
  at: string;
  ids: string[];
  label: string;
}

export type ProposalKind = "log_activity" | "set_field" | "create_lead" | "create_opportunity" | "merge_duplicate" | "clarify";
export type ProposalState = "auto_applied" | "pending" | "approved" | "rejected" | "undone" | "superseded" | "resolved";
export type Confidence = "high" | "medium" | "low";

export interface Evidence {
  quote: string;
  sourceId: string;
}

export interface Proposal {
  id: string;
  kind: ProposalKind;
  tier: "auto" | "approval";
  leadId: string | null;
  company: string;
  title: string;
  explanation: string;
  field?: EditableField;
  before?: string;
  after?: string;
  conflict?: boolean;
  evidence: Evidence[];
  sourceIds: string[];
  date: string;
  confidence: Confidence;
  confidenceReasons: string[];
  state: ProposalState;
  decision?: Decision;
  newRecord?: CrmRecord;
  opportunity?: { title: string; serviceLine: string | null; signalIds: string[] };
  merge?: { primary: string; duplicate: string; reason: string };
}

/** One company as it appears in one source, linked to a Kaizen record (or a proposed new lead). */
export interface AccountLink {
  key: string; // lead_id, or "new:<normalized name>" while the lead is not in Kaizen
  leadId: string | null;
  company: string;
  source: Source;
  account: ValidatedAccount;
  match: MatchResult | null;
  createProposalId?: string;
  internal: boolean; // internal note or forward - no client took part
}

export interface DerivedState {
  crm: CrmRecord[];
  proposals: Proposal[];
  links: AccountLink[];
  blocked: { sourceId: string; items: BlockedItem[] }[];
  skipped: { sourceId: string; company: string; field: string; reason: string }[];
  signalProposal: Record<string, string>; // cross-sell signal id -> opportunity proposal id
}

export type ExtractionMap = Record<string, ValidatedExtraction>;

const STAGE: Record<string, number> = { New: 0, Contacted: 1, "Proposal Sent": 2, Won: 3, Lost: 0 };

function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36).toUpperCase().padStart(4, "0").slice(-4);
}

function words(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3));
}
export function similarText(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((w) => B.has(w) && inter++);
  return inter / Math.min(A.size, B.size);
}

/** The AtliQ seller handling a conversation: whoever sent AtliQ's messages, else whoever is named. */
export function sellerOnSource(source: Source): string | null {
  for (const m of [...source.messages].reverse()) {
    if (!m.isAtliq || !m.fromEmail) continue;
    const name = SELLERS.find((s) => m.fromEmail === `${s.toLowerCase()}@atliq.com`);
    if (name) return name;
  }
  const toSeller = SELLERS.find((s) => source.emails.includes(`${s.toLowerCase()}@atliq.com`));
  if (toSeller) return toSeller;
  return source.atliqPeople.find((p) => SELLERS.includes(p)) ?? null;
}

/** A real two-way conversation with this company: AtliQ and the client both took part. */
function isDirectContact(l: AccountLink): boolean {
  if (l.internal || !l.account.interaction_with_client) return false;
  const msgs = l.source.messages;
  if (msgs.length) {
    const domain = domainOf(l.account.contact_email);
    const fromClient = msgs.some((m) => !m.isAtliq && !m.isAutoReply && (!domain || domainOf(m.fromEmail) === domain));
    return fromClient && msgs.some((m) => m.isAtliq);
  }
  return l.account.id.endsWith("#a0"); // in a note, only the note's main company
}

/**
 * Latest conversation wins: open promises and asks from an older source are retired once AtliQ has
 * had a later two-way conversation with the same company. Anything still open is raised again by
 * that newer source, so nothing real is lost - only stale items are.
 */
export function supersededBy(link: AccountLink, links: AccountLink[]): AccountLink | undefined {
  return links.find((l) => l.key === link.key && l.source.date > link.source.date && isDirectContact(l));
}

function sameName(a: string, b: string): boolean {
  const ta = companyTokens(a.replace(/\b(dr|mr|mrs|ms|prof)\b\.?/gi, ""));
  const tb = companyTokens(b.replace(/\b(dr|mr|mrs|ms|prof)\b\.?/gi, ""));
  const [s, l] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return s.length > 0 && s.every((t) => l.some((x) => x === t || x.startsWith(t) || t.startsWith(x)));
}

export function derive(input: {
  seed: CrmRecord[];
  sources: Source[];
  extractions: ExtractionMap;
  decisions: Record<string, Decision>;
  done: Record<string, DoneMark>;
  today: string;
}): DerivedState {
  const { decisions, today } = input;
  const crm = cloneCrm(input.seed);
  const base = new Map(input.seed.map((r) => [r.lead_id, r]));
  const proposals: Proposal[] = [];
  const links: AccountLink[] = [];
  const skipped: DerivedState["skipped"] = [];
  const signalProposal: Record<string, string> = {};
  const doneIds = new Set(Object.values(input.done).flatMap((d) => d.ids));

  const add = (p: Omit<Proposal, "state" | "decision">): Proposal => {
    const decision = decisions[p.id];
    let state: ProposalState;
    if (p.tier === "auto") state = decision?.status === "undone" ? "undone" : "auto_applied";
    else if (decision?.status === "approved") state = "approved";
    else if (decision?.status === "rejected") state = "rejected";
    else if (decision?.status === "resolved") state = "resolved";
    else state = "pending";
    const full: Proposal = { ...p, state, decision };
    proposals.push(full);
    return full;
  };
  const applied = (p: Proposal) => p.state === "auto_applied" || p.state === "approved";
  const valueOf = (p: Proposal) => p.decision?.value ?? p.after ?? "";

  // 1. Duplicate records already in Kaizen (rule-based, G6).
  for (const dup of findDuplicates(crm)) {
    const d = getRecord(crm, dup.duplicate)!;
    const p = add({
      id: `merge:${dup.duplicate}>${dup.primary}`,
      kind: "merge_duplicate",
      tier: "approval",
      leadId: dup.primary,
      company: getRecord(crm, dup.primary)!.company,
      title: `Merge ${dup.duplicate} into ${dup.primary}`,
      explanation: `${dup.duplicate} (${d.company}, owner ${d.owner || "none"}) looks like the same account: ${dup.reason}. The duplicate is kept and flagged, never deleted.`,
      evidence: [],
      sourceIds: [],
      date: today,
      confidence: dup.reason.includes("same contact email") ? "high" : "medium",
      confidenceReasons: [dup.reason],
      merge: dup,
    });
    if (applied(p)) markMerged(crm, dup.primary, dup.duplicate);
  }

  const fieldProposals = new Map<string, Proposal>();
  const ordered = [...input.sources].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  for (const source of ordered) {
    const ext = input.extractions[source.id];
    if (!ext) continue;

    for (const acc of ext.accounts) {
      let match = matchAccount(acc, crm);
      let leadId = match?.leadId ?? null;
      let createProposalId: string | undefined;
      const norm = normalizeCompany(acc.company);

      // 2. Company not in Kaizen -> one create-lead proposal per company (G6: never a silent create).
      if (!leadId) {
        const existing = proposals.find(
          (p) => p.kind === "create_lead" && companySimilarity(p.company, acc.company) >= 0.85,
        );
        if (existing) {
          existing.evidence.push(...acc.signals.slice(0, 1).map((s) => ({ quote: s.evidence, sourceId: source.id })));
          if (!existing.sourceIds.includes(source.id)) existing.sourceIds.push(source.id);
          createProposalId = existing.id;
        } else {
          const id = `KC-${shortHash(norm)}`;
          const service = acc.field_updates.find((f) => f.field === "service_interest")?.value ?? "";
          const est = acc.field_updates.find((f) => f.field === "est_value_usd");
          const owner = sellerOnSource(source) ?? "";
          const quote =
            acc.signals[0]?.evidence ?? acc.open_requests[0]?.evidence ?? acc.commitments[0]?.evidence ?? acc.stakeholders[0]?.evidence;
          const reasons: string[] = [];
          if (!acc.contact_email) reasons.push("no contact email in source");
          if (!acc.interaction_with_client) reasons.push("company only mentioned, no direct contact");
          if (acc.ambiguities.length) reasons.push("open questions about this company");
          const newRecord: CrmRecord = {
            lead_id: id,
            company: acc.company,
            contact_name: acc.contact_name ?? "",
            contact_email: acc.contact_email ?? "",
            source: acc.lead_source ?? (acc.referred_by ? "Referral" : ""),
            service_interest: service,
            status: "New",
            est_value_usd: est ? (parseUsd(est.value)?.low ?? null) : null,
            owner,
            created_date: source.date,
            last_contact_date: acc.interaction_with_client ? (acc.interaction_date ?? source.date) : "",
            next_followup_date: "",
            notes: [acc.referred_by ? `Referred by ${acc.referred_by}.` : "", acc.summary].filter(Boolean).join(" "),
            activities: [],
            opportunities: [],
            created_by_copilot: true,
          };
          const p = add({
            id,
            kind: "create_lead",
            tier: "approval",
            leadId: null,
            company: acc.company,
            title: `New lead: ${acc.company}`,
            explanation: `${acc.company} is not in Kaizen.${acc.referred_by ? ` Referred by ${acc.referred_by}.` : ""} ${acc.summary}`,
            evidence: quote ? [{ quote, sourceId: source.id }] : [],
            sourceIds: [source.id],
            date: source.date,
            confidence: reasons.length === 0 ? "high" : reasons.length === 1 ? "medium" : "low",
            confidenceReasons: reasons.length ? reasons : ["contact email and direct conversation in source"],
            newRecord,
          });
          createProposalId = p.id;
          if (applied(p)) {
            const company = p.decision?.value?.trim() || newRecord.company;
            createLead(crm, { ...newRecord, company });
            leadId = id;
            match = { leadId: id, method: "lead_id", similarity: 1, alsoMatches: [] };
          }
        }
        if (!leadId) {
          links.push({ key: `new:${norm}`, leadId: null, company: acc.company, source, account: acc, match: null, createProposalId, internal: ext.internal_only });
          continue;
        }
      }

      const record = getRecord(crm, leadId)!;
      const baseRecord = base.get(leadId);
      const matchReasons: string[] = [];
      let matchConfidence: Confidence = "high";
      if (match && (match.method === "name" || match.method === "domain")) {
        matchConfidence = "medium";
        matchReasons.push(`matched to ${leadId} by ${match.method === "name" ? "company name" : "email domain"}`);
      }
      if (match?.alsoMatches.length) matchReasons.push(`also resembles ${match.alsoMatches.join(", ")}`);
      links.push({ key: leadId, leadId, company: record.company, source, account: acc, match, createProposalId, internal: ext.internal_only });

      // 3. Low-risk, append-only changes: auto-applied and logged (G3).
      const actDate = acc.interaction_date && acc.interaction_date <= today ? acc.interaction_date : source.date;
      const act = add({
        id: `act:${acc.id}`,
        kind: "log_activity",
        tier: "auto",
        leadId,
        company: record.company,
        title: `Log ${source.type === "meeting_note" ? "meeting note" : source.type === "email" ? "email" : "note"} from ${actDate}`,
        explanation: acc.summary,
        evidence: [],
        sourceIds: [source.id],
        date: actDate,
        confidence: matchConfidence,
        confidenceReasons: matchReasons,
      });
      if (applied(act)) {
        appendActivity(crm, leadId, {
          id: act.id,
          date: actDate,
          sourceId: source.id,
          summary: acc.summary,
          withClient: acc.interaction_with_client,
        });
      }

      if (acc.interaction_with_client && actDate > record.last_contact_date) {
        const lc = add({
          id: `lc:${acc.id}`,
          kind: "set_field",
          tier: "auto",
          leadId,
          company: record.company,
          field: "last_contact_date",
          before: record.last_contact_date,
          after: actDate,
          title: "Update last contact date",
          explanation: `Direct contact on ${actDate} is newer than Kaizen's last contact date.`,
          evidence: [],
          sourceIds: [source.id],
          date: actDate,
          confidence: matchConfidence,
          confidenceReasons: matchReasons,
        });
        if (applied(lc)) updateField(crm, leadId, "last_contact_date", actDate);
      }

      // 4. Field changes need a founder (G3), conflicts are shown not overwritten (G5),
      //    and older sources never overwrite newer CRM data (G14).
      for (const fu of acc.field_updates) {
        const field = fu.field as EditableField;
        const range = field === "est_value_usd" ? parseUsd(fu.value) : null;
        const next = range ? String(range.low) : fu.value.trim();
        const current = fieldValue(record, field);
        if (current.toLowerCase() === next.toLowerCase()) continue;
        if (field === "contact_name" && current && sameName(current, next)) continue;
        // Contacts only fill blanks: another person on a thread is a stakeholder, not a replacement.
        if ((field === "contact_name" || field === "contact_email") && current) continue;
        // Pipeline only moves forward. New work from a Won client is an opportunity, not a downgrade;
        // the only way back is a Lost deal reopening.
        if (field === "status" && current && STAGE[next] !== undefined && STAGE[current] !== undefined) {
          const reopening = current === "Lost" && next !== "Lost";
          if (!reopening && next !== "Lost" && STAGE[next] <= STAGE[current]) continue;
          if (current === "Won" && next !== "Lost") continue;
        }
        if (current && baseRecord && source.date < baseRecord.last_contact_date) {
          skipped.push({ sourceId: source.id, company: record.company, field, reason: "Source is older than Kaizen's last update" });
          continue;
        }
        const key = `${leadId}:${field}`;
        const prev = fieldProposals.get(key);
        if (prev && prev.state === "pending") prev.state = "superseded";

        const reasons = [...matchReasons];
        if (current) reasons.push("conflicts with current Kaizen value");
        if (range && range.low !== range.high) reasons.push(`lower bound of stated range ${range.low}-${range.high}`);
        const p = add({
          id: `fld:${fu.id}`,
          kind: "set_field",
          tier: "approval",
          leadId,
          company: record.company,
          field,
          before: current,
          after: next,
          conflict: !!current,
          title: `${current ? "Change" : "Set"} ${field.replaceAll("_", " ")}`,
          explanation: current
            ? `Kaizen says "${current}"; the ${source.type === "email" ? "email" : "note"} says "${fu.value}".`
            : `Kaizen has no ${field.replaceAll("_", " ")}; the source states "${fu.value}".`,
          evidence: [{ quote: fu.evidence, sourceId: source.id }],
          sourceIds: [source.id],
          date: source.date,
          confidence: reasons.length === 0 ? "high" : current || range ? "medium" : matchConfidence,
          confidenceReasons: reasons.length ? reasons : ["stated explicitly in source"],
        });
        fieldProposals.set(key, p);
        if (applied(p)) updateField(crm, leadId, field, valueOf(p));
      }

      // 5. Cross-sell signals -> opportunity proposals (one per distinct need per account).
      for (const sig of acc.signals.filter((s) => s.type === "cross_sell")) {
        const existing = proposals.find(
          (p) => p.kind === "create_opportunity" && p.leadId === leadId && similarText(p.opportunity!.title, sig.title) >= 0.5,
        );
        if (existing) {
          existing.evidence.push({ quote: sig.evidence, sourceId: source.id });
          existing.opportunity!.signalIds.push(sig.id);
          if (!existing.sourceIds.includes(source.id)) existing.sourceIds.push(source.id);
          signalProposal[sig.id] = existing.id;
          continue;
        }
        const reasons = [...matchReasons];
        if (!sig.explicit) reasons.push("need is implied, not stated outright");
        const p = add({
          id: `opp:${sig.id}`,
          kind: "create_opportunity",
          tier: "approval",
          leadId,
          company: record.company,
          title: `New opportunity: ${sig.title}`,
          explanation: sig.detail,
          evidence: [{ quote: sig.evidence, sourceId: source.id }],
          sourceIds: [source.id],
          date: source.date,
          confidence: reasons.length === 0 ? "high" : "medium",
          confidenceReasons: reasons.length ? reasons : ["client stated the need directly"],
          opportunity: { title: sig.title, serviceLine: sig.service_line, signalIds: [sig.id] },
        });
        signalProposal[sig.id] = p.id;
        if (applied(p)) {
          addOpportunity(crm, leadId, {
            id: p.id,
            title: p.decision?.value?.trim() || sig.title,
            serviceLine: sig.service_line,
            sourceId: source.id,
            evidence: sig.evidence,
            createdAt: p.decision?.at ?? source.date,
          });
        }
      }

      // 6. Unowned accounts -> suggest the seller already on the conversation (rule, not AI).
      if (!record.owner && !proposals.some((p) => p.id === `own:${leadId}`)) {
        const seller = sellerOnSource(source);
        if (seller) {
          const p = add({
            id: `own:${leadId}`,
            kind: "set_field",
            tier: "approval",
            leadId,
            company: record.company,
            field: "owner",
            before: "",
            after: seller,
            title: "Assign an owner",
            explanation: `Kaizen has no owner for ${record.company}. ${seller} is handling the conversation in "${source.title}".`,
            evidence: [],
            sourceIds: [source.id],
            date: source.date,
            confidence: "medium",
            confidenceReasons: ["rule: suggest the AtliQ seller on the thread"],
          });
          if (applied(p)) updateField(crm, leadId, "owner", valueOf(p));
        }
      }

      // 7. Ambiguities are questions for a founder - never written to Kaizen (G4).
      for (const amb of acc.ambiguities) {
        const p = add({
          id: `clar:${amb.id}`,
          kind: "clarify",
          tier: "approval",
          leadId,
          company: record.company,
          title: "Needs clarification",
          explanation: amb.question,
          evidence: [{ quote: amb.evidence, sourceId: source.id }],
          sourceIds: [source.id],
          date: source.date,
          confidence: "low",
          confidenceReasons: ["the source is unclear - Kaizen is not updated until a founder answers"],
        });
        if (p.state === "resolved" && p.decision?.reason) {
          appendActivity(crm, leadId, {
            id: `${p.id}:answer`,
            date: p.decision.at.slice(0, 10),
            sourceId: source.id,
            summary: `Clarified by ${p.decision.by}: ${p.decision.reason}`,
            withClient: false,
          });
        }
      }
    }
  }

  // Clarifications for companies that are not in Kaizen yet.
  for (const link of links.filter((l) => !l.leadId)) {
    for (const amb of link.account.ambiguities) {
      add({
        id: `clar:${amb.id}`,
        kind: "clarify",
        tier: "approval",
        leadId: null,
        company: link.company,
        title: "Needs clarification",
        explanation: amb.question,
        evidence: [{ quote: amb.evidence, sourceId: link.source.id }],
        sourceIds: [link.source.id],
        date: link.source.date,
        confidence: "low",
        confidenceReasons: ["the source is unclear - nothing is written until a founder answers"],
      });
    }
  }

  // 8. Next follow-up date = earliest open item per account (needs approval).
  const byLead = new Map<string, AccountLink[]>();
  for (const l of links) if (l.leadId) byLead.set(l.leadId, [...(byLead.get(l.leadId) ?? []), l]);
  for (const [leadId, ls] of byLead) {
    const record = getRecord(crm, leadId);
    if (!record || record.merged_into) continue;
    const candidates: { date: string; label: string; quote: string; sourceId: string }[] = [];
    for (const l of ls) {
      const stale = !!supersededBy(l, links);
      for (const c of stale ? [] : l.account.commitments) {
        if (c.by !== "atliq" || c.fulfilled_in_source || doneIds.has(c.id)) continue;
        candidates.push({ date: c.due_date ?? addDays(l.source.date, RULES.promiseDefaultDays), label: c.action, quote: c.evidence, sourceId: l.source.id });
      }
      for (const r of stale ? [] : l.account.open_requests) {
        if (r.answered_in_source || doneIds.has(r.id)) continue;
        candidates.push({ date: addDays(r.asked_on ?? l.source.date, RULES.awaitingReplyDays), label: `Reply: ${r.request}`, quote: r.evidence, sourceId: l.source.id });
      }
      for (const s of l.account.signals) {
        if (!s.due_date || doneIds.has(s.id) || !["deadline", "revisit", "renewal"].includes(s.type)) continue;
        candidates.push({ date: s.type === "deadline" ? addDays(s.due_date, -3) : s.due_date, label: s.title, quote: s.evidence, sourceId: l.source.id });
      }
    }
    if (!candidates.length) continue;
    candidates.sort((a, b) => a.date.localeCompare(b.date));
    const first = candidates[0];
    const next = first.date < today ? today : first.date;
    if (record.next_followup_date && record.next_followup_date >= today) continue;
    if (record.next_followup_date === next) continue;
    const p = add({
      id: `fu:${leadId}`,
      kind: "set_field",
      tier: "approval",
      leadId,
      company: record.company,
      field: "next_followup_date",
      before: record.next_followup_date,
      after: next,
      title: "Set next follow-up date",
      explanation: `Earliest open item: "${first.label}" (${first.date < today ? `overdue since ${first.date}` : `due ${first.date}`}).`,
      evidence: [{ quote: first.quote, sourceId: first.sourceId }],
      sourceIds: [first.sourceId],
      date: today,
      confidence: "high",
      confidenceReasons: ["rule: earliest open commitment, request or deadline"],
    });
    if (applied(p)) updateField(crm, leadId, "next_followup_date", valueOf(p));
  }

  const blocked = ordered
    .map((s) => ({ sourceId: s.id, items: input.extractions[s.id]?.blocked ?? [] }))
    .filter((b) => b.items.length > 0);

  return { crm, proposals, links, blocked, skipped, signalProposal };
}
