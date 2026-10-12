# AtliQ Sales & CRM Assistant — Kaizen Copilot

**AI PM Capstone · Gyan Prakash, AI Product Manager**

> AtliQ doesn't lack leads. It lacks memory.
> **Kaizen Copilot** reads the emails and meeting notes where deals actually happen, keeps Kaizen CRM current, and gives each founder a ranked Daily Brief of what needs doing — with a verified quote behind every item.
>
> *AI does the remembering, code does the checking, founders do the deciding.*

---

## The problem

AtliQ Technologies sells founder-led: two founders and the CEO close most deals, with one salesperson, while also running the company. Leads arrive from referrals, LinkedIn, conferences and existing clients — often between meetings — and many never reach the CRM. What clients say lives in inboxes and notebooks, so follow-ups slip, cross-sells go unnoticed and lost deals are never revisited.

**What the data showed** (CRM export of 40 records, 34 email threads, 16 meeting notes, demo date 10 July 2026):

- None of the 40 CRM records has a next follow-up date.
- 5 prospects who contacted AtliQ were never entered; only 4 of ~15 TechSummit business cards made it in.
- 2 accounts are duplicated under different owners (Meridian, GlobalMart).
- The largest deal (FinEdge, $95K) waited three weeks for a reply while the CRM showed last contact in March.

**Root cause:** keeping the CRM current depends on manual effort at exactly the moment the founder-sellers have no time. "Update the CRM same-day" was agreed in April — and again in July.

## The solution

| Step | Who | What |
|---|---|---|
| Read | AI | One structured-output call per email, meeting note or pasted phone note |
| Verify | Code | Every extracted fact must quote the source word for word, or it is dropped |
| Match | Code | Find the Kaizen record by email → domain → name; flag duplicates |
| Update | Code + founder | Low-risk updates (activity log, last contact) apply automatically; status, value, owner, new leads, opportunities and merges wait for founder approval |
| Surface | Code | Daily Brief ranked by severity, deal value and urgency |

Six screens: **Daily Brief · Review Queue · Accounts (with pre-call brief) · Quick Capture · Audit Log · Trust & Safety.**

## Results (prototype on the AtliQ dataset)

| Measure | Result |
|---|---|
| Companies matched to the right Kaizen record | **100%** (52/52) |
| Expected follow-ups and opportunities caught | **98%** (62/63) |
| AI claims verified against the source | **99%** (3 of 375 blocked automatically) |
| End-to-end demo scenarios | **12/12 pass** |
| Pipeline flagged at risk on day one | **$492K** across 21 accounts |
| AI cost to read all 50 sources | **$0.04** (gpt-6-luna, ~$0.001 each) |
| Business case (see cost estimate) | ~**$2,100/month saved**, 78% less CRM admin, ~53 founder hours back per month |

## Deliverables

| # | Deliverable | Format | Link |
|---|---|---|---|
| 1 | User research worksheet | Excel | [Files/Activity_Worksheet_v2.xlsx](Files/Activity_Worksheet_v2.xlsx) |
| 2 | AI opportunity map | Miro board / PDF export | [Miro board](https://miro.com/app/board/uXjVEfC-cNw=/) · [Files/AI Opportunity Mapping.pdf](Files/AI%20Opportunity%20Mapping.pdf) |
| 3 | AI PRD | Word | [Files/AI_PRD_Sales CRM Assistant_v2.docx](Files/AI_PRD_Sales%20CRM%20Assistant_v2.docx) |
| 4 | Cost estimation | Excel | [Files/Atliq Sales CRM_Cost_Estimation.xlsx](Files/Atliq%20Sales%20CRM_Cost_Estimation.xlsx) |
| 5 | Working AI prototype | Code + README | [kaizen-copilot/](kaizen-copilot/) · [setup and run guide](kaizen-copilot/README.md) |
| 6 | Presentation | PPTX | [Files/Kaizen Copilot AtliQ's Sales Memory.pptx](Files/Kaizen%20Copilot%20AtliQ's%20Sales%20Memory.pptx) |
| 7 | Stakeholder demo video | Loom | [Watch the demo](https://www.loom.com/share/7a0713178f644d85910885f942e96165) |

## Guardrails

| Risk | Guardrail (enforced in code) |
|---|---|
| Hallucination | Every claim carries a quote that must appear verbatim in the source |
| Wrong CRM change | Founder approval for pipeline changes; conflicts shown side by side; status never moves backwards; contacts only fill blanks |
| Duplicates | Match before create; merges keep both records |
| Prompt injection | Email text is data — the extraction call has no tools or write access; suspicious instructions are flagged |
| Sensitive data | Redaction before model calls; no delete operation; role-based approval; API key server-side only |
| Alert fatigue | Latest conversation wins; cross-type deduplication; reject-rate alert and kill switch |

Full list (17 guardrails, 9 security controls) is in the [PRD](Files/AI_PRD_Sales%20CRM%20Assistant_v2.docx) and on the app's Trust & Safety page.

## Repository structure

```
├── Dataset/            AtliQ synthetic dataset (CRM export, emails, meeting notes) — as provided
├── Files/              Capstone deliverables (worksheet, opportunity map, PRD, cost estimate, deck, video link)
└── kaizen-copilot/     The prototype (Next.js + TypeScript)
    ├── src/lib/extract/     LLM extraction: prompt, schema, OpenAI call
    ├── src/lib/guardrails/  Quote verification, redaction
    ├── src/lib/engine/      Record matching, proposals, Daily Brief rules
    ├── scripts/             Dataset build, extraction, evaluation
    ├── eval/expected.json   Hand-labelled answer key
    └── data/                Generated sources, CRM seed, extractions, eval report
```

## Run the prototype

Requires Node 20+ and an OpenAI API key.

```bash
cd kaizen-copilot
npm install
cp .env.example .env.local   # add OPENAI_API_KEY, DEMO_PASSWORD, SESSION_SECRET
npm run dev                  # http://localhost:3000/login
```

The extracted data is committed in `kaizen-copilot/data/`, so the app runs without re-processing the dataset. To rebuild and re-score: `npm run data:build`, `npm run data:extract`, `npm run eval`. Details, deployment to Vercel and the full guardrail map: [kaizen-copilot/README.md](kaizen-copilot/README.md).

---

*All data is synthetic (provided with the capstone brief). No real client information is used.*
