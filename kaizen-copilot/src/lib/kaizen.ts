import Papa from "papaparse";
import type { Activity, CrmRecord, EditableField, Opportunity } from "./types";

/**
 * Stand-in Kaizen CRM connector. AtliQ's Kaizen CRM has no API, so the copilot keeps a working copy
 * seeded from the CSV export and hands approved changes back as an import file.
 *
 * S6: the connector exposes create, update, append and merge only. There is deliberately no delete.
 */

export const UPDATABLE_FIELDS: EditableField[] = [
  "service_interest",
  "status",
  "est_value_usd",
  "contact_name",
  "contact_email",
  "next_followup_date",
  "owner",
  "last_contact_date",
];

export function cloneCrm(seed: CrmRecord[]): CrmRecord[] {
  return seed.map((r) => ({ ...r, activities: [...r.activities], opportunities: [...r.opportunities] }));
}

export function getRecord(crm: CrmRecord[], leadId: string): CrmRecord | undefined {
  return crm.find((r) => r.lead_id === leadId);
}

export function fieldValue(record: CrmRecord, field: EditableField): string {
  const v = record[field];
  return v == null ? "" : String(v);
}

export function updateField(crm: CrmRecord[], leadId: string, field: EditableField, value: string): void {
  if (!UPDATABLE_FIELDS.includes(field)) throw new Error(`Field ${field} is not writable`);
  const r = getRecord(crm, leadId);
  if (!r) return;
  if (field === "est_value_usd") r.est_value_usd = value ? Number(value) : null;
  else r[field] = value;
}

export function createLead(crm: CrmRecord[], record: CrmRecord): void {
  if (getRecord(crm, record.lead_id)) return;
  crm.push(record);
}

export function appendActivity(crm: CrmRecord[], leadId: string, activity: Activity): void {
  const r = getRecord(crm, leadId);
  if (!r || r.activities.some((a) => a.id === activity.id)) return;
  r.activities.push(activity);
  r.activities.sort((a, b) => a.date.localeCompare(b.date));
}

export function addOpportunity(crm: CrmRecord[], leadId: string, opp: Opportunity): void {
  const r = getRecord(crm, leadId);
  if (!r || r.opportunities.some((o) => o.id === opp.id)) return;
  r.opportunities.push(opp);
}

/** Merge keeps both records: the duplicate is flagged and points at the primary, never deleted. */
export function markMerged(crm: CrmRecord[], primaryId: string, duplicateId: string): void {
  const p = getRecord(crm, primaryId);
  const d = getRecord(crm, duplicateId);
  if (!p || !d || d.merged_into) return;
  for (const f of ["contact_name", "contact_email", "service_interest", "owner"] as const) {
    if (!p[f] && d[f]) p[f] = d[f];
  }
  if (p.est_value_usd == null && d.est_value_usd != null) p.est_value_usd = d.est_value_usd;
  if (d.last_contact_date > p.last_contact_date) p.last_contact_date = d.last_contact_date;
  p.notes = [p.notes, `Merged duplicate ${d.lead_id} (${d.company}${d.notes ? `: ${d.notes}` : ""})`]
    .filter(Boolean)
    .join(" | ");
  p.activities = [...p.activities, ...d.activities].sort((a, b) => a.date.localeCompare(b.date));
  p.opportunities = [...p.opportunities, ...d.opportunities];
  d.merged_into = p.lead_id;
}

/** Kaizen import file: one row per record, same columns as the original export plus copilot columns. */
export function toKaizenCsv(crm: CrmRecord[]): string {
  return Papa.unparse(
    crm.map((r) => ({
      lead_id: r.lead_id,
      company: r.company,
      contact_name: r.contact_name,
      contact_email: r.contact_email,
      source: r.source,
      service_interest: r.service_interest,
      status: r.status,
      est_value_usd: r.est_value_usd ?? "",
      owner: r.owner,
      created_date: r.created_date,
      last_contact_date: r.last_contact_date,
      next_followup_date: r.next_followup_date,
      notes: r.notes,
      opportunities: r.opportunities.map((o) => o.title).join("; "),
      merged_into: r.merged_into ?? "",
    })),
  );
}
