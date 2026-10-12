import type { CrmRecord } from "../types";

// G6: deterministic record matching - email, then domain, then company name. No AI involved.

const STOP = new Set([
  "ltd", "limited", "llc", "inc", "pvt", "private", "group", "co", "company", "the", "corp",
  "corporation", "plc", "and", "of",
]);
const GENERIC_DOMAINS = new Set(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "proton.me"]);

export function companyTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));
}

export function normalizeCompany(name: string): string {
  return companyTokens(name).join(" ");
}

/** True when a and b differ by at most one inserted, deleted or changed character. */
function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function tokenEq(a: string, b: string): boolean {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length >= 4 && l.startsWith(s)) return true;
  // Tolerate a one-letter typo in longer names ("FineEdge" vs "FinEdge").
  return s.length >= 6 && oneEditApart(a, b);
}

/** 0..1 similarity; requires the first (most distinctive) tokens to agree. */
export function companySimilarity(a: string, b: string): number {
  const ta = companyTokens(a);
  const tb = companyTokens(b);
  if (!ta.length || !tb.length) return 0;
  if (!tokenEq(ta[0], tb[0])) return 0;
  const matched = ta.filter((x) => tb.some((y) => tokenEq(x, y))).length;
  const byMin = matched / Math.min(ta.length, tb.length);
  const byMax = matched / Math.max(ta.length, tb.length);
  return byMin >= 1 ? Math.max(0.85, byMax) : byMax;
}

export function domainOf(email: string | null | undefined): string | null {
  const d = email?.split("@")[1]?.toLowerCase();
  return d && !GENERIC_DOMAINS.has(d) ? d : null;
}

export type MatchMethod = "lead_id" | "email" | "domain" | "name";

export interface MatchResult {
  leadId: string;
  method: MatchMethod;
  similarity: number;
  /** Other live records that also match - a duplicate warning. */
  alsoMatches: string[];
}

const STATUS_RANK: Record<string, number> = { Won: 4, "Proposal Sent": 3, Contacted: 2, New: 1, Lost: 1, "": 0 };

export function pickPrimary(records: CrmRecord[]): CrmRecord {
  return [...records].sort(
    (a, b) =>
      (STATUS_RANK[b.status] ?? 0) - (STATUS_RANK[a.status] ?? 0) ||
      (b.est_value_usd ?? 0) - (a.est_value_usd ?? 0) ||
      a.created_date.localeCompare(b.created_date),
  )[0];
}

export function matchAccount(
  account: { company: string; contact_email: string | null; lead_id_mentioned: string | null },
  crm: CrmRecord[],
): MatchResult | null {
  const live = crm.filter((r) => !r.merged_into);
  const resolve = (r: CrmRecord) => (r.merged_into ? crm.find((x) => x.lead_id === r.merged_into) ?? r : r);

  const scored: { r: CrmRecord; method: MatchMethod; sim: number; strength: number }[] = [];
  for (const r of live) {
    const sim = companySimilarity(account.company, r.company);
    if (account.lead_id_mentioned && r.lead_id === account.lead_id_mentioned.toUpperCase() && sim >= 0.5) {
      scored.push({ r, method: "lead_id", sim, strength: 4 });
    } else if (account.contact_email && r.contact_email && account.contact_email === r.contact_email) {
      scored.push({ r, method: "email", sim, strength: 3 });
    } else if (domainOf(account.contact_email) && domainOf(account.contact_email) === domainOf(r.contact_email)) {
      scored.push({ r, method: "domain", sim, strength: 2 });
    } else if (sim >= 0.75) {
      scored.push({ r, method: "name", sim, strength: 1 });
    }
  }
  if (!scored.length) {
    // A mention of a record that was merged away still resolves to its primary.
    const merged = crm.find((r) => r.merged_into && r.lead_id === account.lead_id_mentioned?.toUpperCase());
    return merged ? { leadId: resolve(merged).lead_id, method: "lead_id", similarity: 1, alsoMatches: [] } : null;
  }

  scored.sort((a, b) => b.strength - a.strength || b.sim - a.sim);
  const best = scored[0];
  const candidates = scored.filter((s) => s.strength === best.strength || s.sim >= 0.75).map((s) => s.r);
  const primary = best.method === "name" || best.method === "domain" ? pickPrimary(candidates) : best.r;
  return {
    leadId: primary.lead_id,
    method: best.method,
    similarity: best.sim,
    alsoMatches: candidates.filter((c) => c.lead_id !== primary.lead_id).map((c) => c.lead_id),
  };
}

/** Pairs of live records that look like the same company (shared domain or near-identical name). */
export function findDuplicates(crm: CrmRecord[]): { primary: string; duplicate: string; reason: string }[] {
  const live = crm.filter((r) => !r.merged_into);
  const pairs: { primary: string; duplicate: string; reason: string }[] = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      const reasons: string[] = [];
      if (a.contact_email && a.contact_email === b.contact_email) reasons.push(`same contact email (${a.contact_email})`);
      else if (domainOf(a.contact_email) && domainOf(a.contact_email) === domainOf(b.contact_email))
        reasons.push(`same email domain (${domainOf(a.contact_email)})`);
      if (companySimilarity(a.company, b.company) >= 0.85) reasons.push(`near-identical names ("${a.company}" / "${b.company}")`);
      if (!reasons.length) continue;
      const primary = pickPrimary([a, b]);
      const duplicate = primary === a ? b : a;
      pairs.push({ primary: primary.lead_id, duplicate: duplicate.lead_id, reason: reasons.join(" and ") });
    }
  }
  return pairs;
}
