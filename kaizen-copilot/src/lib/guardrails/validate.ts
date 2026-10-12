import type { AccountExtraction, Extraction } from "../extract/schema";
import { SERVICE_LINES, STATUSES } from "../types";
import type { Source } from "../types";

// G1/G2/G15: code checks every AI claim against the source before anything reaches the CRM.

type Item = { evidence: string };
type WithId<T> = T & { id: string };

export interface ValidatedAccount
  extends Omit<
    AccountExtraction,
    "field_updates" | "signals" | "commitments" | "open_requests" | "stakeholders" | "ambiguities"
  > {
  id: string;
  field_updates: WithId<AccountExtraction["field_updates"][number]>[];
  signals: WithId<AccountExtraction["signals"][number]>[];
  commitments: WithId<AccountExtraction["commitments"][number]>[];
  open_requests: WithId<AccountExtraction["open_requests"][number]>[];
  stakeholders: WithId<AccountExtraction["stakeholders"][number]>[];
  ambiguities: WithId<AccountExtraction["ambiguities"][number]>[];
}

export interface BlockedItem {
  account: string;
  kind: string;
  reason: string;
  evidence?: string;
  value?: string;
}

export interface ValidatedExtraction {
  source_summary: string;
  internal_only: boolean;
  accounts: ValidatedAccount[];
  blocked: BlockedItem[];
  stats: { items: number; verified: number; blocked: number };
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/[*#>_`]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the quote (or every part of an elided quote) appears in the source, in order. */
export function evidenceInSource(evidence: string, sourceText: string): boolean {
  const hay = normalize(sourceText);
  const parts = evidence
    .split(/\.\.\.|…|\[\.\.\.\]/)
    .map(normalize)
    .filter((p) => p.length > 0);
  if (parts.length === 0) return false;
  if (parts.join("").length < 6) return false;
  let from = 0;
  for (const part of parts) {
    const at = hay.indexOf(part, from);
    if (at === -1) return false;
    from = at + part.length;
  }
  return true;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
function cleanDate(d: string | null): string | null {
  if (!d || !ISO.test(d)) return null;
  const y = Number(d.slice(0, 4));
  if (y < 2024 || y > 2028 || Number.isNaN(Date.parse(d))) return null;
  return d;
}

/** "35000-40000", "35k–40k", "~38,000" -> lower bound, conservatively (G2: never round up). */
export function parseUsd(value: string): { low: number; high: number } | null {
  const nums = Array.from(value.replace(/,/g, "").matchAll(/(\d+(?:\.\d+)?)\s*(k|K)?/g)).map(
    (m) => Number(m[1]) * (m[2] ? 1000 : 1),
  );
  const valid = nums.filter((n) => n >= 1000 && n < 100_000_000);
  if (valid.length === 0) return null;
  return { low: Math.min(...valid), high: Math.max(...valid) };
}

export function validateExtraction(raw: Extraction, source: Source): ValidatedExtraction {
  const blocked: BlockedItem[] = [];
  let items = 0;
  const sourceLower = source.text.toLowerCase();

  const keep = <T extends Item>(account: string, kind: string, list: T[], prefix: string): WithId<T>[] => {
    const out: WithId<T>[] = [];
    list.forEach((item, i) => {
      items++;
      if (!evidenceInSource(item.evidence, source.text)) {
        blocked.push({ account, kind, reason: "Evidence quote not found in source", evidence: item.evidence });
        return;
      }
      out.push({ ...item, id: `${prefix}:${kind}${i}` });
    });
    return out;
  };

  const accounts: ValidatedAccount[] = raw.accounts
    .filter((a) => !/^atliq\b/i.test(a.company.trim()))
    .map((a, ai) => {
      const prefix = `${source.id}#a${ai}`;
      const company = a.company.trim().replace(/[?!.,;:]+$/, "").trim();

      // Contact email must literally appear in the source (no invented addresses).
      let contactEmail = a.contact_email?.trim().toLowerCase() || null;
      if (contactEmail && !sourceLower.includes(contactEmail)) {
        blocked.push({ account: company, kind: "contact_email", reason: "Email not present in source", value: contactEmail });
        contactEmail = null;
      }

      const fieldUpdates = keep(company, "field", a.field_updates, prefix).filter((f) => {
        const v = f.value.trim();
        let ok = true;
        if (f.field === "status") ok = (STATUSES as readonly string[]).includes(v);
        if (f.field === "service_interest") ok = (SERVICE_LINES as readonly string[]).includes(v);
        if (f.field === "est_value_usd") ok = parseUsd(v) !== null;
        if (f.field === "contact_email") ok = sourceLower.includes(v.toLowerCase());
        if (!ok) blocked.push({ account: company, kind: `field:${f.field}`, reason: "Value outside allowed list or not in source", value: v });
        return ok;
      });

      const signals = keep(company, "signal", a.signals, prefix).map((s) => ({ ...s, due_date: cleanDate(s.due_date) }));
      const commitments = keep(company, "commitment", a.commitments, prefix).map((c) => ({
        ...c,
        due_date: cleanDate(c.due_date),
      }));
      const openRequests = keep(company, "request", a.open_requests, prefix).map((r) => ({
        ...r,
        asked_on: cleanDate(r.asked_on),
      }));

      return {
        ...a,
        id: prefix,
        company,
        contact_email: contactEmail,
        interaction_date: cleanDate(a.interaction_date),
        field_updates: fieldUpdates,
        signals,
        commitments,
        open_requests: openRequests,
        stakeholders: keep(company, "stakeholder", a.stakeholders, prefix),
        ambiguities: keep(company, "ambiguity", a.ambiguities, prefix),
      };
    });

  return {
    source_summary: raw.source_summary,
    internal_only: raw.internal_only,
    accounts,
    blocked,
    stats: { items, verified: items - blocked.filter((b) => b.evidence !== undefined).length, blocked: blocked.length },
  };
}
