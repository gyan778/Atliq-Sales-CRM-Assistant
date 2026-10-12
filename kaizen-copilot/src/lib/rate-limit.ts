// S3 / G19: simple in-memory limits. On serverless each instance keeps its own counters, which is
// enough to stop casual abuse of the demo; production would use a shared store (e.g. Redis).

const windows = new Map<string, number[]>();
let day = "";
let dayCount = 0;

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
}

export function hitLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    windows.set(key, recent);
    return true;
  }
  recent.push(now);
  windows.set(key, recent);
  return false;
}

export function hitDailyCap(max: number): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    dayCount = 0;
  }
  if (dayCount >= max) return true;
  dayCount++;
  return false;
}
