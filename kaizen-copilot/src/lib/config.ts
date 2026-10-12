// Demo-wide constants. The dataset treats 10 July 2026 as "today".
export const DEMO_TODAY = "2026-07-10";

export const PROMPT_VERSION = "extract-v4";

export interface Person {
  id: string;
  name: string;
  role: string;
  email: string;
  canApprove: boolean; // S7: sellers approve, pre-sales staff are view-only
}

export const PEOPLE: Person[] = [
  { id: "bhavin", name: "Bhavin", role: "Founder", email: "bhavin@atliq.com", canApprove: true },
  { id: "dhaval", name: "Dhaval", role: "Founder", email: "dhaval@atliq.com", canApprove: true },
  { id: "karandeep", name: "Karandeep", role: "CEO", email: "karandeep@atliq.com", canApprove: true },
  { id: "jay", name: "Jay", role: "Sales Executive", email: "jay@atliq.com", canApprove: true },
  { id: "pranav", name: "Pranav", role: "CTO", email: "pranav@atliq.com", canApprove: false },
  { id: "ayush", name: "Ayush", role: "AI Product Manager", email: "ayush@atliq.com", canApprove: false },
];

export const SELLERS = PEOPLE.filter((p) => p.canApprove).map((p) => p.name);

export function personById(id: string | undefined | null): Person | undefined {
  return PEOPLE.find((p) => p.id === id);
}

// Rules engine thresholds (plain code, not AI).
export const RULES = {
  /** An AtliQ promise with no stated date is treated as due this many days after it was made. */
  promiseDefaultDays: 7,
  /** A client message unanswered for this many days becomes a brief item. */
  awaitingReplyDays: 2,
  /** Deadlines inside this window appear on the brief. */
  deadlineWindowDays: 21,
  /** Open deals with no contact for this long are flagged stale. */
  staleDealDays: 21,
  /** Revisit signals surface this many days before their date. */
  revisitLeadDays: 30,
  /** Reject-rate alert (G17): above this share of decisions, with at least minDecisions. */
  rejectRateAlert: 0.3,
  minDecisionsForAlert: 8,
};

/** Limits for live Quick Capture (S3, G19). */
export const LIMITS = {
  maxCaptureChars: 10_000,
  capturesPerMinutePerIp: 10,
  capturesPerDay: 200,
};
