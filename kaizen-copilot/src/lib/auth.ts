import { personById, type Person } from "./config";

// S2/S7: signed session cookie (HMAC-SHA256 via Web Crypto, works in the proxy and route handlers).

export const SESSION_COOKIE = "kc_session";
const MAX_AGE_SECONDS = 12 * 60 * 60;

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  arr.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): string {
  return atob(s.replace(/-/g, "+").replace(/_/g, "/"));
}

async function hmac(data: string): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters)");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSession(personId: string): Promise<{ token: string; maxAge: number }> {
  const payload = b64url(enc.encode(JSON.stringify({ u: personId, exp: Date.now() + MAX_AGE_SECONDS * 1000 })));
  return { token: `${payload}.${await hmac(payload)}`, maxAge: MAX_AGE_SECONDS };
}

export async function readSession(token: string | undefined): Promise<Person | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  try {
    if (!safeEqual(sig, await hmac(payload))) return null;
    const { u, exp } = JSON.parse(fromB64url(payload)) as { u: string; exp: number };
    if (Date.now() > exp) return null;
    return personById(u) ?? null;
  } catch {
    return null;
  }
}

export function checkPassword(input: string): boolean {
  const expected = process.env.DEMO_PASSWORD;
  if (!expected) return false;
  return safeEqual(input, expected);
}
