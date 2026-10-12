"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import crmSeed from "@data/crm_seed.json";
import datasetSources from "@data/sources.json";
import storedExtractions from "@data/extractions.json";
import { DEMO_TODAY, type Person } from "@/lib/config";
import { derive, type DerivedState, type ExtractionMap } from "@/lib/engine/derive";
import { buildBrief, type BriefItem, type BriefKpis } from "@/lib/engine/brief";
import type { ValidatedExtraction } from "@/lib/guardrails/validate";
import { useCopilotStore } from "@/lib/store";
import type { CrmRecord, Source } from "@/lib/types";

interface StoredExtraction {
  model: string;
  extractedAt: string;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number };
  costUsd?: number;
  result: ValidatedExtraction;
}

const stored = storedExtractions as unknown as Record<string, StoredExtraction>;

interface CopilotContext {
  user: Person;
  hydrated: boolean;
  today: string;
  derived: DerivedState;
  brief: { items: BriefItem[]; kpis: BriefKpis };
  sources: Source[];
  sourceById: (id: string) => Source | undefined;
  extractions: ExtractionMap;
  extractionMeta: Record<string, Omit<StoredExtraction, "result">>;
  seed: CrmRecord[];
}

const Ctx = createContext<CopilotContext | null>(null);

export function CopilotProvider({ user, children }: { user: Person; children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    Promise.resolve(useCopilotStore.persist.rehydrate()).finally(() => setHydrated(true));
  }, []);

  const decisions = useCopilotStore((s) => s.decisions);
  const done = useCopilotStore((s) => s.done);
  const captures = useCopilotStore((s) => s.captures);

  const value = useMemo<CopilotContext>(() => {
    const sources = [...(datasetSources as Source[]), ...captures.map((c) => c.source)];
    const extractions: ExtractionMap = {};
    const extractionMeta: CopilotContext["extractionMeta"] = {};
    for (const [id, e] of Object.entries(stored)) {
      extractions[id] = e.result;
      extractionMeta[id] = { model: e.model, extractedAt: e.extractedAt, usage: e.usage, costUsd: e.costUsd };
    }
    for (const c of captures) {
      extractions[c.source.id] = c.result;
      extractionMeta[c.source.id] = {
        model: c.model,
        extractedAt: c.at,
        usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 },
      };
    }
    const seed = crmSeed as CrmRecord[];
    const derived = derive({ seed, sources, extractions, decisions, done, today: DEMO_TODAY });
    const brief = buildBrief(derived, done, DEMO_TODAY);
    const byId = new Map(sources.map((s) => [s.id, s]));
    return {
      user,
      hydrated,
      today: DEMO_TODAY,
      derived,
      brief,
      sources,
      sourceById: (id) => byId.get(id),
      extractions,
      extractionMeta,
      seed,
    };
  }, [user, hydrated, decisions, done, captures]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCopilot(): CopilotContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCopilot must be used inside CopilotProvider");
  return ctx;
}
