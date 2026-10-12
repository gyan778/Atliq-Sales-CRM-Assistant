import OpenAI from "openai";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readSession, SESSION_COOKIE } from "@/lib/auth";
import { DEMO_TODAY, LIMITS } from "@/lib/config";
import { extractFromSource, ExtractionError } from "@/lib/extract/llm";
import { validateExtraction } from "@/lib/guardrails/validate";
import { clientIp, hitDailyCap, hitLimit } from "@/lib/rate-limit";
import { buildSource } from "@/lib/sources/parse";

export const maxDuration = 60;

const Body = z.object({
  text: z.string().trim().min(20, "Paste at least a sentence or two.").max(LIMITS.maxCaptureChars),
  kind: z.enum(["email", "meeting_note"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(request: Request) {
  const person = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!person) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // G17 kill switch.
  if (process.env.AI_ENABLED === "false") {
    return NextResponse.json({ error: "AI processing is switched off by an administrator (kill switch)." }, { status: 503 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "No AI API key configured on the server." }, { status: 503 });
  }
  // S3 / G19 limits.
  if (hitLimit(`capture:${clientIp(request.headers)}`, LIMITS.capturesPerMinutePerIp, 60_000)) {
    return NextResponse.json({ error: "Rate limit reached. Try again in a minute." }, { status: 429 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  if (hitDailyCap(LIMITS.capturesPerDay)) {
    return NextResponse.json({ error: "Daily processing cap reached for this demo." }, { status: 429 });
  }

  const { text, kind, date } = parsed.data;
  const id = `capture-${Date.now().toString(36)}`;
  const looksLikeThread = /\*\*From:\*\*/.test(text);
  const { source } = buildSource({
    id,
    type: kind === "email" && looksLikeThread ? "email" : "meeting_note",
    file: `quick-capture/${id}`,
    raw: text.startsWith("#") ? text : `# Quick capture by ${person.name}\n**Date:** ${date ?? DEMO_TODAY}\n\n${text}`,
    fallbackDate: date ?? DEMO_TODAY,
  });
  source.type = "quick_capture";

  try {
    const { extraction, model, usage } = await extractFromSource(source);
    const result = validateExtraction(extraction, source);
    return NextResponse.json({ source, result, model, usage });
  } catch (err) {
    if (err instanceof ExtractionError) {
      return NextResponse.json({ error: err.message, kind: err.kind }, { status: 422 });
    }
    if (err instanceof OpenAI.RateLimitError) {
      return NextResponse.json({ error: "The AI provider is rate limiting requests. Try again shortly." }, { status: 429 });
    }
    if (err instanceof OpenAI.AuthenticationError) {
      return NextResponse.json({ error: "The server's AI API key was rejected." }, { status: 502 });
    }
    if (err instanceof OpenAI.APIError) {
      return NextResponse.json({ error: `AI API error (${err.status ?? "network"}).` }, { status: 502 });
    }
    console.error("capture failed", (err as Error).message);
    return NextResponse.json({ error: "Processing failed." }, { status: 500 });
  }
}
