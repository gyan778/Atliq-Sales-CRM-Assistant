import type { Source, SourceType, ThreadMessage } from "../types";
import { PEOPLE } from "../config";
import { redact } from "../guardrails/redact";

/**
 * The dataset marks "what really happened" with italic parentheticals: *( ... )*.
 * They are the answer key, so they are removed before the AI ever sees the text.
 */
export function stripEditorial(raw: string): { text: string; notes: string[] } {
  const notes: string[] = [];
  const text = raw.replace(/\*\(([\s\S]*?)\)\*/g, (_m, inner: string) => {
    notes.push(inner.trim());
    return "";
  });
  return {
    text: text
      .split("\n")
      .map((l) => l.replace(/\s+$/, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    notes,
  };
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function parseFrom(line: string): { name: string; email: string | null } {
  const m = line.match(/^\s*(.*?)\s*<([^>]+)>/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  const email = line.match(EMAIL_RE)?.[0]?.toLowerCase() ?? null;
  return { name: line.replace(EMAIL_RE, "").trim(), email };
}

/** Split an email thread on "---" separators and read From / Date headers (deterministic, no AI). */
export function parseThread(text: string): ThreadMessage[] {
  const chunks = text.split(/\n-{3,}\n/);
  const messages: ThreadMessage[] = [];
  for (const chunk of chunks) {
    const from = chunk.match(/\*\*From:\*\*\s*(.+)/)?.[1];
    const date = chunk.match(/\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})/)?.[1];
    if (!from || !date) continue;
    const { name, email } = parseFrom(from);
    messages.push({
      fromName: name,
      fromEmail: email,
      date,
      isAtliq: !!email && email.endsWith("@atliq.com"),
      isAutoReply: /automatic reply|out of (the )?office/i.test(chunk),
      asks: /\?/.test(chunk.replace(/\*\*Subject:\*\*.*$/m, "")),
    });
  }
  return messages;
}

export function buildSource(input: {
  id: string;
  type: SourceType;
  file: string;
  raw: string;
  fallbackDate: string;
}): { source: Source; editorialNotes: string[] } {
  const { text: stripped, notes } = stripEditorial(input.raw);
  const { text, count } = redact(stripped);
  const messages = input.type === "email" ? parseThread(text) : [];
  const title = (text.match(/^#\s+(.+)$/m)?.[1] ?? input.file).trim();
  const date =
    messages.length > 0
      ? messages.map((m) => m.date).sort().at(-1)!
      : (text.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] ?? input.fallbackDate);
  const emails = Array.from(new Set((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase())));
  const lower = text.toLowerCase();
  const atliqPeople = PEOPLE.filter(
    (p) => emails.includes(p.email) || new RegExp(`\\b${p.name.toLowerCase()}\\b`).test(lower),
  ).map((p) => p.name);

  return {
    source: {
      id: input.id,
      type: input.type,
      file: input.file,
      title,
      date,
      text,
      messages,
      emails,
      atliqPeople,
      redactions: count,
    },
    editorialNotes: notes,
  };
}
