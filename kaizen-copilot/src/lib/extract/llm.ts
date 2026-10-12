import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { ExtractionSchema, type Extraction } from "./schema";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";
import type { Source } from "../types";

// Server-only: the API key is read from the environment and never reaches the browser (S1).

export const MODEL = process.env.OPENAI_MODEL || "gpt-6.1-sol";
type Effort = "minimal" | "low" | "medium" | "high";
const EFFORT = process.env.EXTRACT_EFFORT as Effort | undefined;

/** Standard-tier list prices per 1M tokens, used only to report cost (override per model in env). */
export const PRICE = {
  input: Number(process.env.PRICE_INPUT_PER_M ?? 2),
  output: Number(process.env.PRICE_OUTPUT_PER_M ?? 10),
  cachedInput: Number(process.env.PRICE_CACHED_INPUT_PER_M ?? 0.2),
};

let client: OpenAI | null = null;
function getClient(): OpenAI {
  client ??= new OpenAI();
  return client;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
}

export interface ExtractResult {
  extraction: Extraction;
  model: string;
  usage: Usage;
}

export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly kind: "refusal" | "truncated" | "invalid_output" | "api",
  ) {
    super(message);
  }
}

export async function extractFromSource(source: Source): Promise<ExtractResult> {
  // G8: the extraction call has no tools and no write access - it can only return JSON.
  const response = await getClient().responses.parse({
    model: MODEL,
    instructions: SYSTEM_PROMPT,
    input: buildUserPrompt(source),
    max_output_tokens: 16000,
    store: false,
    ...(EFFORT ? { reasoning: { effort: EFFORT } } : {}),
    text: { format: zodTextFormat(ExtractionSchema, "extraction") },
  });

  const refused = response.output.some(
    (item) => item.type === "message" && item.content.some((c) => c.type === "refusal"),
  );
  if (refused) throw new ExtractionError("The model declined to process this source.", "refusal");
  if (response.status === "incomplete") {
    throw new ExtractionError(`Output incomplete (${response.incomplete_details?.reason ?? "unknown"}).`, "truncated");
  }
  // S4: anything that does not match the schema is rejected, never stored.
  const parsed = ExtractionSchema.safeParse(response.output_parsed);
  if (!parsed.success) {
    throw new ExtractionError("Model output did not match the expected structure.", "invalid_output");
  }

  return {
    extraction: parsed.data,
    model: response.model,
    usage: {
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
      cache_read_input_tokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
    },
  };
}
