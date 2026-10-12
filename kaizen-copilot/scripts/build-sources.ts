// Reads ../Dataset and writes data/sources.json, data/crm_seed.json and data/ground_truth.json.
// Run: npm run data:build
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { buildSource } from "../src/lib/sources/parse";
import type { CrmRecord, Source } from "../src/lib/types";

const ROOT = process.cwd();
const DATASET = path.resolve(ROOT, process.env.DATASET_DIR ?? "../Dataset");
const OUT = path.join(ROOT, "data");
fs.mkdirSync(OUT, { recursive: true });

// --- Kaizen CRM seed (from the CSV export) ---
const csv = fs.readFileSync(path.join(DATASET, "crm_export.csv"), "utf8");
const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
const crm: CrmRecord[] = parsed.data.map((r) => ({
  lead_id: r.lead_id.trim(),
  company: r.company.trim(),
  contact_name: r.contact_name.trim(),
  contact_email: r.contact_email.trim().toLowerCase(),
  source: r.source.trim(),
  service_interest: r.service_interest.trim(),
  status: r.status.trim(),
  est_value_usd: r.est_value_usd.trim() ? Number(r.est_value_usd) : null,
  owner: r.owner.trim(),
  created_date: r.created_date.trim(),
  last_contact_date: r.last_contact_date.trim(),
  next_followup_date: r.next_followup_date.trim(),
  notes: r.notes.trim(),
  activities: [],
  opportunities: [],
}));

// --- Emails and meeting notes ---
const sources: Source[] = [];
const groundTruth: Record<string, string[]> = {};
let redactions = 0;

for (const [dir, type] of [
  ["emails", "email"],
  ["meeting_notes", "meeting_note"],
] as const) {
  for (const file of fs.readdirSync(path.join(DATASET, dir)).filter((f) => f.endsWith(".md")).sort()) {
    const raw = fs.readFileSync(path.join(DATASET, dir, file), "utf8");
    const id = file.replace(/\.md$/, "");
    const { source, editorialNotes } = buildSource({
      id,
      type,
      file: `${dir}/${file}`,
      raw,
      fallbackDate: id.slice(0, 10),
    });
    sources.push(source);
    groundTruth[id] = editorialNotes;
    redactions += source.redactions;
  }
}

sources.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

fs.writeFileSync(path.join(OUT, "crm_seed.json"), JSON.stringify(crm, null, 2));
fs.writeFileSync(path.join(OUT, "sources.json"), JSON.stringify(sources, null, 2));
fs.writeFileSync(path.join(OUT, "ground_truth.json"), JSON.stringify(groundTruth, null, 2));

const leaked = sources.filter((s) => /\*\(/.test(s.text)).map((s) => s.id);
console.log(`CRM records: ${crm.length}`);
console.log(`Sources: ${sources.length} (${sources.filter((s) => s.type === "email").length} emails)`);
console.log(`Editorial notes stripped: ${Object.values(groundTruth).flat().length}`);
console.log(`Redactions applied: ${redactions}`);
if (leaked.length) {
  console.error(`Answer-key text still present in: ${leaked.join(", ")}`);
  process.exit(1);
}
