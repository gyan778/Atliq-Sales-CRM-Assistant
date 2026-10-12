# Kaizen Copilot — AtliQ Sales & CRM Assistant

AtliQ's founder-led sales team loses revenue to forgotten follow-ups, unlogged leads and missed cross-sells — "a lack of memory, not a lack of leads". Kaizen Copilot reads the emails and meeting notes where deals actually happen, keeps a copy of **Kaizen CRM** current, and each morning tells the founders what needs doing, with a verified quote behind every item.

> AI does the remembering, code does the checking, founders do the deciding.

## What it does

| Screen | Purpose |
|---|---|
| **Daily Brief** | Ranked to-dos: overdue promises, clients waiting on AtliQ, deadlines, cross-sells, revisits, leads missing from Kaizen. Headline "revenue at risk". "My items" / "Everyone". |
| **Review Queue** | Every proposed Kaizen change as before → after with source evidence. Approve, edit, reject with a reason, or bulk-approve high-confidence items. |
| **Accounts** | Kaizen records with all applied changes, open items, a one-click pre-call brief and a timeline built from the sources. |
| **Quick Capture** | Paste a phone note or email; it is processed live and queued for review. Includes a prompt-injection sample. |
| **Audit Log** | Every change (auto-applied and founder-approved) with who/when/source, undo, reject-rate alert, Kaizen import CSV export, demo reset. |
| **Trust & Safety** | Live guardrail numbers, evaluation results, measured cost per source and a monthly cost calculator. |

## How it works

```
Email / meeting note / quick capture
  → redact sensitive data (G16) and strip the dataset's answer-key notes
  → LLM extraction (OpenAI, structured output, no tools)   src/lib/extract
  → code validation: quotes must appear verbatim (G1/G2/G15) src/lib/guardrails
  → match to Kaizen by email → domain → name (G6)           src/lib/engine/match.ts
  → proposals: auto-apply low-risk, queue the rest (G3/G5)  src/lib/engine/derive.ts
  → rules engine builds the Daily Brief (no AI)             src/lib/engine/brief.ts
  → approved changes → Kaizen connector (no delete) → CSV   src/lib/kaizen.ts
```

- **Kaizen CRM** has no API, so the app keeps a working copy seeded from `crm_export.csv` and exports approved changes as an import file.
- **State** (decisions, done marks, captures) is stored in the viewer's browser. *Reset demo* on the Audit Log page restores the original export.
- **Demo date** is fixed to 10 July 2026, as the dataset specifies.

## Run locally

Requires Node 20+.

```bash
npm install
cp .env.example .env.local   # then fill in OPENAI_API_KEY, DEMO_PASSWORD, SESSION_SECRET
npm run data:build           # Dataset/ -> data/sources.json, crm_seed.json (answer key split out)
npm run data:extract         # the model reads all 50 sources (cached; only new/changed ones re-run)
npm run eval                 # scores extraction vs eval/expected.json + scenario checks (no API calls)
npm run dev                  # http://localhost:3000
```

Sign in as any AtliQ team member with the demo password from `.env.local`. Bhavin, Dhaval, Karandeep and Jay can approve; Pranav and Ayush are view-only.

## Deploy to Vercel (free tier)

1. Push this folder to a GitHub repo (the generated `data/*.json` files are committed, so the deployed app does not need the dataset or re-extraction).
2. Import the repo in Vercel.
3. Add environment variables: `OPENAI_API_KEY`, `DEMO_PASSWORD`, `SESSION_SECRET`, optionally `OPENAI_MODEL`, `EXTRACT_EFFORT`, `PRICE_*`, `AI_ENABLED`.
4. Deploy. Set `AI_ENABLED=false` at any time to stop all live AI processing (kill switch).

## Guardrails and security

| | Guardrail | Enforced in |
|---|---|---|
| G1 | Every claim has a verbatim quote, checked by code | `guardrails/validate.ts` |
| G2 | Nothing invented; ranges use the lower bound | `validate.ts`, `prompt.ts` |
| G3 | Auto-apply only activity log + last-contact date | `engine/derive.ts` |
| G4 | Ambiguities held as questions, never written | `derive.ts` |
| G5 | Conflicts shown side by side | `derive.ts`, Review Queue |
| G6 | Match before create; merges keep both records | `engine/match.ts`, `kaizen.ts` |
| G7 | No ability to email clients | (no such code path) |
| G8 | Source text treated as untrusted data; extraction call has no tools | `extract/llm.ts`, `prompt.ts` |
| G11 | Confidence computed by code | `derive.ts` |
| G12 | Commitments tagged AtliQ vs client | `extract/schema.ts`, `brief.ts` |
| G13 | Relative dates anchored to message date | `prompt.ts`, `validate.ts` |
| G14 | Older sources never overwrite newer data | `derive.ts` |
| G15 | Closed vocabularies via structured output | `extract/schema.ts` |
| G16 | Phone/card/ID/password redaction | `guardrails/redact.ts` |
| G17 | Kill switch + reject-rate alert | `api/capture`, Audit Log |
| S1–S9 | Server-side key, password + signed cookie, rate/size limits, schema check, CSP, no delete, roles, clean logs, synthetic-data banner | `proxy.ts`, `auth.ts`, `rate-limit.ts`, `next.config.ts` |

## Dataset changes

None to the original files. `data/` holds derived JSON; the dataset's italic editorial notes are moved to `data/ground_truth.json` and used only by the evaluation. `eval/expected.json` is a hand-labelled answer key built from those notes.

## Model

Extraction uses OpenAI's Responses API with Zod structured outputs (`zodTextFormat`), default model `gpt-6.1-sol` (set `OPENAI_MODEL` to change; `EXTRACT_EFFORT` optionally sets reasoning effort). The call has no tools and `store: false`. Everything after extraction - validation, matching, approvals, rules - is plain code, so the provider can be swapped by changing `src/lib/extract/llm.ts` only. The Trust & Safety page reports measured tokens and cost per source using the `PRICE_*` settings.
