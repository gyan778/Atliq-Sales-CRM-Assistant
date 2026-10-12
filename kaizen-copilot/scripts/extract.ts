// Runs LLM extraction + guardrail validation over every source and writes data/extractions.json.
// Results are cached per source content hash, so re-runs only process new or changed sources (G19).
// Run: npm run data:extract            (add --force to ignore the cache)
import "./env";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { extractFromSource, MODEL, PRICE } from "../src/lib/extract/llm";
import { PROMPT_VERSION } from "../src/lib/config";
import { validateExtraction, type ValidatedExtraction } from "../src/lib/guardrails/validate";
import type { Source } from "../src/lib/types";

export interface StoredExtraction {
  hash: string;
  model: string;
  promptVersion: string;
  extractedAt: string;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number };
  costUsd: number;
  result: ValidatedExtraction;
}

const DATA = path.join(process.cwd(), "data");
const OUT = path.join(DATA, "extractions.json");
const costOf = (u: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number }) =>
  ((u.input_tokens - u.cache_read_input_tokens) * PRICE.input + u.cache_read_input_tokens * PRICE.cachedInput + u.output_tokens * PRICE.output) / 1e6;
const force = process.argv.includes("--force");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);


async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set. Add it to .env.local (see .env.example).");
    process.exit(1);
  }
  const sources: Source[] = JSON.parse(fs.readFileSync(path.join(DATA, "sources.json"), "utf8"));
  const store: Record<string, StoredExtraction> = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};

  const hashOf = (s: Source) =>
    crypto.createHash("sha256").update(`${PROMPT_VERSION}|${MODEL}|${s.text}`).digest("hex").slice(0, 16);

  const todo = sources.filter((s) => (!only || s.id.includes(only)) && (force || store[s.id]?.hash !== hashOf(s)));
  console.log(`Model ${MODEL} | ${todo.length} to process, ${sources.filter((s) => store[s.id]?.hash === hashOf(s)).length} already cached`);

  let next = 0;
  const failures: string[] = [];
  const totals = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };

  async function worker() {
    while (next < todo.length) {
      const source = todo[next++];
      const started = Date.now();
      try {
        const { extraction, model, usage } = await extractFromSource(source);
        const result = validateExtraction(extraction, source);
        store[source.id] = {
          hash: hashOf(source),
          model,
          promptVersion: PROMPT_VERSION,
          extractedAt: new Date().toISOString(),
          usage,
          costUsd: costOf(usage),
          result,
        };
        totals.input_tokens += usage.input_tokens;
        totals.output_tokens += usage.output_tokens;
        totals.cache_read_input_tokens += usage.cache_read_input_tokens;
        console.log(
          `  ok  ${source.id}  accounts=${result.accounts.length} blocked=${result.blocked.length}  ${((Date.now() - started) / 1000).toFixed(1)}s`,
        );
        fs.writeFileSync(OUT, JSON.stringify(store, null, 2));
      } catch (err) {
        failures.push(source.id);
        console.error(`  ERR ${source.id}: ${(err as Error).message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: 4 }, worker));
  fs.writeFileSync(OUT, JSON.stringify(store, null, 2));

  const cost =
    ((totals.input_tokens - totals.cache_read_input_tokens) * PRICE.input +
      totals.cache_read_input_tokens * PRICE.cachedInput +
      totals.output_tokens * PRICE.output) /
    1_000_000;
  console.log(
    `\nTokens this run: in=${totals.input_tokens} out=${totals.output_tokens} cacheRead=${totals.cache_read_input_tokens} ~ $${cost.toFixed(3)}`,
  );
  if (failures.length) {
    console.error(`Failed: ${failures.join(", ")}`);
    process.exit(1);
  }
}

main();
