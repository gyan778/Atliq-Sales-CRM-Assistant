import { z } from "zod";
import { LEAD_SOURCES, SERVICE_LINES, SIGNAL_TYPES, STATUSES } from "../types";

// G15: closed vocabularies. The model can only emit values from these lists.

const evidence = z
  .string()
  .describe("Exact, verbatim quote copied character-for-character from the source that supports this item.");

const isoDateOrNull = z
  .string()
  .nullable()
  .describe("YYYY-MM-DD, or null when the source gives no date. Never guess.");

export const FieldUpdateSchema = z.object({
  field: z.enum(["service_interest", "status", "est_value_usd", "contact_name", "contact_email"]),
  value: z
    .string()
    .describe(
      `service_interest: one of ${SERVICE_LINES.join(" | ")}. status: one of ${STATUSES.join(" | ")}. ` +
        "est_value_usd: a number or range in USD as stated, e.g. '35000' or '35000-40000'. contact fields: as written.",
    ),
  evidence,
});

export const SignalSchema = z.object({
  type: z.enum(SIGNAL_TYPES),
  title: z.string().describe("Short headline, max 10 words."),
  detail: z.string().describe("One sentence of context, only facts stated in the source."),
  service_line: z.enum(SERVICE_LINES).nullable(),
  due_date: isoDateOrNull,
  due_phrase: z.string().nullable().describe("The original wording of the timing, e.g. 'mid-July', 'Q2 2026'."),
  explicit: z.boolean().describe("true if stated outright, false if implied."),
  evidence,
});

export const CommitmentSchema = z.object({
  by: z.enum(["atliq", "client"]).describe("G12: who made the promise."),
  person: z.string().nullable().describe("First name of the person who owns it, or null if unassigned/unclear."),
  action: z.string().describe("What was promised, imperative, max 12 words."),
  due_date: isoDateOrNull,
  due_phrase: z.string().nullable(),
  fulfilled_in_source: z
    .boolean()
    .describe("true only if the same source later shows it was done."),
  evidence,
});

export const OpenRequestSchema = z.object({
  request: z.string().describe("What the client asked AtliQ for, max 15 words."),
  asked_on: isoDateOrNull,
  answered_in_source: z.boolean().describe("true only if AtliQ fully answered it later in this source."),
  evidence,
});

export const StakeholderSchema = z.object({
  name: z.string(),
  email: z.string().nullable(),
  role: z.string().nullable(),
  evidence,
});

export const AmbiguitySchema = z.object({
  question: z.string().describe("What a founder must clarify before the CRM can be updated."),
  evidence,
});

export const AccountExtractionSchema = z.object({
  company: z.string().describe("Client or prospect company name as written. Never an AtliQ entity."),
  lead_id_mentioned: z.string().nullable().describe("A CRM id like L-1003 if the source states it, else null."),
  contact_name: z.string().nullable(),
  contact_email: z.string().nullable(),
  interaction_with_client: z
    .boolean()
    .describe("true if AtliQ and this company actually communicated in this source; false if only mentioned."),
  interaction_date: isoDateOrNull,
  summary: z.string().describe("2-3 sentences: what happened and where things stand, facts only."),
  lead_source: z.enum(LEAD_SOURCES).nullable().describe("Only when the source shows how the lead arrived."),
  referred_by: z.string().nullable(),
  field_updates: z.array(FieldUpdateSchema),
  signals: z.array(SignalSchema),
  commitments: z.array(CommitmentSchema),
  open_requests: z.array(OpenRequestSchema),
  stakeholders: z.array(StakeholderSchema),
  ambiguities: z.array(AmbiguitySchema),
});

export const ExtractionSchema = z.object({
  source_summary: z.string().describe("One sentence describing the source."),
  internal_only: z.boolean().describe("true if no client took part (internal meeting or forward)."),
  accounts: z.array(AccountExtractionSchema),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
export type AccountExtraction = z.infer<typeof AccountExtractionSchema>;
export type Signal = z.infer<typeof SignalSchema>;
export type Commitment = z.infer<typeof CommitmentSchema>;
export type OpenRequest = z.infer<typeof OpenRequestSchema>;
