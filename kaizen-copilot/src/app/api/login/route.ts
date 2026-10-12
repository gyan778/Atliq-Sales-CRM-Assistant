import { NextResponse } from "next/server";
import { z } from "zod";
import { checkPassword, createSession, SESSION_COOKIE } from "@/lib/auth";
import { personById } from "@/lib/config";
import { clientIp, hitLimit } from "@/lib/rate-limit";

const Body = z.object({ personId: z.string().max(40), password: z.string().max(200) });

export async function POST(request: Request) {
  if (hitLimit(`login:${clientIp(request.headers)}`, 8, 60_000)) {
    return NextResponse.json({ error: "Too many attempts. Wait a minute and try again." }, { status: 429 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const person = personById(parsed.data.personId);
  if (!process.env.DEMO_PASSWORD || !process.env.SESSION_SECRET) {
    return NextResponse.json({ error: "Login is not configured: set DEMO_PASSWORD and SESSION_SECRET." }, { status: 500 });
  }
  if (!person || !checkPassword(parsed.data.password)) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const { token, maxAge } = await createSession(person.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return res;
}
