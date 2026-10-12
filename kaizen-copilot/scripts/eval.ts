// Scores the stored extractions against eval/expected.json and runs end-to-end scenario checks
// on the Daily Brief. Writes data/eval-report.json. No API calls - free to run.
// Run: npm run eval
import fs from "node:fs";
import path from "node:path";
import { DEMO_TODAY } from "../src/lib/config";
import { buildBrief, type BriefKind } from "../src/lib/engine/brief";
import { derive, type ExtractionMap } from "../src/lib/engine/derive";
import { companySimilarity, matchAccount } from "../src/lib/engine/match";
import type { ValidatedAccount, ValidatedExtraction } from "../src/lib/guardrails/validate";
import type { CrmRecord, Source } from "../src/lib/types";

const DATA = path.join(process.cwd(), "data");
const read = <T>(p: string): T => JSON.parse(fs.readFileSync(p, "utf8"));

const seed = read<CrmRecord[]>(path.join(DATA, "crm_seed.json"));
const sources = read<Source[]>(path.join(DATA, "sources.json"));
const stored = read<Record<string, { model: string; result: ValidatedExtraction; usage: { input_tokens: number; output_tokens: number } }>>(
  path.join(DATA, "extractions.json"),
);
const expected = read<Record<string, { account: string; expect: string[] }[] | string>>(path.join(process.cwd(), "eval", "expected.json"));

const extractions: ExtractionMap = Object.fromEntries(Object.entries(stored).map(([k, v]) => [k, v.result]));

function has(acc: ValidatedAccount, cat: string, isNew: boolean): boolean {
  switch (cat) {
    case "promise":
      return acc.commitments.some((c) => c.by === "atliq" && !c.fulfilled_in_source);
    case "request":
      return acc.open_requests.some((r) => !r.answered_in_source);
    case "ambiguity":
      return acc.ambiguities.length > 0;
    case "new_lead":
      return isNew;
    default:
      return acc.signals.some((s) => s.type === cat);
  }
}

const categories: Record<string, { expected: number; found: number }> = {};
const misses: { sourceId: string; account: string; missing: string }[] = [];
let accExpected = 0;
let accMatched = 0;

for (const [sourceId, list] of Object.entries(expected)) {
  if (typeof list === "string") continue;
  const ext = extractions[sourceId];
  for (const { account, expect } of list) {
    accExpected++;
    const isNewExp = account.startsWith("NEW:");
    const target = isNewExp ? account.slice(4) : account;
    const acc = ext?.accounts.find((a) => {
      const m = matchAccount(a, seed);
      return isNewExp ? !m && companySimilarity(a.company, target) >= 0.5 : m?.leadId === target || m?.alsoMatches.includes(target);
    });
    if (acc) accMatched++;
    else misses.push({ sourceId, account, missing: "account not found / wrong match" });

    for (const alt of expect) {
      const key = alt.split("|")[0];
      categories[key] ??= { expected: 0, found: 0 };
      categories[key].expected++;
      if (acc && alt.split("|").some((c) => has(acc, c, isNewExp))) categories[key].found++;
      else misses.push({ sourceId, account, missing: alt });
    }
  }
}

// Groundedness: how many AI items were checked and how many were blocked.
let items = 0;
let blockedEvidence = 0;
let blockedOther = 0;
for (const e of Object.values(extractions)) {
  items += e.stats.items;
  blockedEvidence += e.blocked.filter((b) => b.evidence !== undefined).length;
  blockedOther += e.blocked.filter((b) => b.evidence === undefined).length;
}

// End-to-end scenarios: state with no founder decisions yet.
const derived = derive({ seed, sources, extractions, decisions: {}, done: {}, today: DEMO_TODAY });
const brief = buildBrief(derived, {}, DEMO_TODAY);
const briefHas = (key: string | RegExp, kind: BriefKind) =>
  brief.items.some((i) => i.kind === kind && (typeof key === "string" ? i.leadId === key : key.test(i.company)));
const scenarios = [
  { name: "Northwind: overdue promise on samples", pass: briefHas("L-1005", "overdue_promise") },
  { name: "Northwind: dashboard cross-sell surfaced", pass: briefHas("L-1005", "cross_sell") },
  { name: "Meridian: client waiting on proposal answers", pass: briefHas("L-1003", "awaiting_reply") },
  { name: "Meridian: L-1027 flagged as duplicate", pass: derived.proposals.some((p) => p.id === "merge:L-1027>L-1003" && p.state === "pending") },
  { name: "GlobalMart: L-1040 flagged as duplicate", pass: derived.proposals.some((p) => p.id === "merge:L-1040>L-1004") },
  { name: "Harbor & Finch: found as a lead missing from Kaizen", pass: briefHas(/harbor/i, "new_lead") },
  { name: "Quantia: lost deal revisit surfaced", pass: briefHas("L-1035", "revisit") },
  { name: "NovaPharma: questionnaire deadline surfaced", pass: briefHas("L-1029", "deadline") },
  { name: "MedTrack: unclear need held for clarification", pass: briefHas("L-1016", "clarify") },
  { name: "FinEdge ($95K): client waiting surfaced", pass: briefHas("L-1023", "awaiting_reply") || briefHas("L-1023", "overdue_promise") },
  { name: "Nothing written to Kaizen without approval (fields unchanged)", pass: derived.crm.every((r) => {
      const s = seed.find((x) => x.lead_id === r.lead_id);
      return !s || (s.status === r.status && s.est_value_usd === r.est_value_usd && s.owner === r.owner && s.service_interest === r.service_interest);
    }) },
  { name: "Answer key never shown to the AI", pass: sources.every((s) => !/\*\(/.test(s.text)) },
];

const total = Object.values(categories).reduce((s, c) => ({ e: s.e + c.expected, f: s.f + c.found }), { e: 0, f: 0 });
const usage = Object.values(stored).reduce((s, v) => ({ i: s.i + v.usage.input_tokens, o: s.o + v.usage.output_tokens }), { i: 0, o: 0 });
const report = {
  generatedAt: new Date().toISOString(),
  model: Object.values(stored)[0]?.model ?? null,
  sourcesProcessed: Object.keys(stored).length,
  accountMatch: { expected: accExpected, found: accMatched, rate: accMatched / Math.max(accExpected, 1) },
  signalRecall: { expected: total.e, found: total.f, rate: total.f / Math.max(total.e, 1) },
  byCategory: categories,
  groundedness: { itemsChecked: items, blockedNoEvidence: blockedEvidence, blockedInvalidValue: blockedOther, verifiedRate: (items - blockedEvidence) / Math.max(items, 1) },
  scenarios,
  usage: { inputTokens: usage.i, outputTokens: usage.o },
  misses,
};
fs.writeFileSync(path.join(DATA, "eval-report.json"), JSON.stringify(report, null, 2));

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
console.log(`Account matching: ${accMatched}/${accExpected} (${pct(report.accountMatch.rate)})`);
console.log(`Signal recall:    ${total.f}/${total.e} (${pct(report.signalRecall.rate)})`);
for (const [k, c] of Object.entries(categories)) console.log(`  ${k.padEnd(10)} ${c.found}/${c.expected}`);
console.log(`Groundedness: ${items} items checked, ${blockedEvidence} blocked for unverifiable quotes (${pct(report.groundedness.verifiedRate)} verified)`);
console.log("Scenarios:");
for (const s of scenarios) console.log(`  ${s.pass ? "PASS" : "FAIL"}  ${s.name}`);
if (misses.length) console.log(`\nMisses (${misses.length}):\n${misses.map((m) => `  ${m.sourceId} ${m.account}: ${m.missing}`).join("\n")}`);
