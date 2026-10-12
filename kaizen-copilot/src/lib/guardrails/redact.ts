// G16: strip sensitive identifiers before text is stored or sent to the model.
// Business email addresses are kept because they are needed to match Kaizen records.

const PATTERNS: { label: string; re: RegExp }[] = [
  { label: "CARD", re: /\b(?:\d[ -]?){13,19}\b/g },
  { label: "AADHAAR", re: /\b\d{4}[ -]\d{4}[ -]\d{4}\b/g },
  { label: "PAN", re: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  { label: "SSN", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { label: "IBAN", re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g },
  { label: "PHONE", re: /\+?\(?\d[\d ()-]{8,16}\d\b/g },
  { label: "PASSWORD", re: /\b(password|passcode|pwd)\s*[:=]\s*\S+/gi },
];

export function redact(text: string): { text: string; count: number } {
  let count = 0;
  let out = text;
  for (const { label, re } of PATTERNS) {
    out = out.replace(re, (match) => {
      // Leave dates and short numeric ranges alone (e.g. 2026-07-10, 14–16k).
      if (/^\d{4}-\d{2}-\d{2}$/.test(match.trim())) return match;
      if (label === "PHONE") {
        const digits = match.replace(/\D/g, "").length;
        if (digits < 10 || digits > 13 || /\d{4}-\d{2}-\d{2}/.test(match)) return match;
      }
      count++;
      return `[REDACTED-${label}]`;
    });
  }
  return { text: out, count };
}
