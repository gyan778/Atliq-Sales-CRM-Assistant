"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PEOPLE } from "@/lib/config";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui-kit";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [personId, setPersonId] = useState("bhavin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personId, password }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Sign-in failed");
      return;
    }
    const next = params.get("next");
    router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
  };

  return (
    <form onSubmit={submit} className="w-full max-w-md space-y-6 rounded-2xl bg-card p-6 shadow-sm ring-1 ring-foreground/10 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">K</span>
        <div>
          <h1 className="text-lg font-semibold">Kaizen Copilot</h1>
          <p className="text-sm text-muted-foreground">AtliQ&apos;s sales memory</p>
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Sign in as</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PEOPLE.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => setPersonId(p.id)}
              aria-pressed={personId === p.id}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl p-3 text-center ring-1 transition",
                personId === p.id ? "bg-primary/5 ring-2 ring-primary" : "ring-border hover:bg-muted",
              )}
            >
              <Avatar name={p.name} className="size-8" />
              <span className="text-sm font-medium">{p.name}</span>
              <span className="text-[11px] leading-tight text-muted-foreground">
                {p.role}
                {!p.canApprove && <><br />view only</>}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="pw" className="text-sm font-medium">
          Demo password
        </label>
        <Input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <Button type="submit" className="h-10 w-full" disabled={busy || !password}>
        {busy ? <Loader2 className="animate-spin" /> : <Lock />}
        Sign in
      </Button>
      <p className="text-center text-[11px] text-muted-foreground">Synthetic data only. Founders and the sales executive can approve changes; CTO and PM can view.</p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-background p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
