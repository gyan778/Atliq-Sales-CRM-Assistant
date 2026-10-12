"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Decision, DoneMark } from "./engine/derive";
import type { ValidatedExtraction } from "./guardrails/validate";
import type { Source } from "./types";

// Demo state lives in the viewer's browser (agreed option a). Each viewer has their own copy;
// "Reset demo" returns to the dataset as delivered.

export interface Capture {
  source: Source;
  result: ValidatedExtraction;
  by: string;
  at: string;
  model: string;
}

interface CopilotStore {
  decisions: Record<string, Decision>;
  done: Record<string, DoneMark>;
  captures: Capture[];
  decide: (id: string, decision: Decision) => void;
  clearDecision: (id: string) => void;
  markDone: (key: string, mark: DoneMark) => void;
  unmarkDone: (key: string) => void;
  addCapture: (c: Capture) => void;
  reset: () => void;
}

const safeStorage = createJSONStorage(() => {
  try {
    const k = "__kc_probe";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
  }
});

export const useCopilotStore = create<CopilotStore>()(
  persist(
    (set) => ({
      decisions: {},
      done: {},
      captures: [],
      decide: (id, decision) => set((s) => ({ decisions: { ...s.decisions, [id]: decision } })),
      clearDecision: (id) =>
        set((s) => {
          const next = { ...s.decisions };
          delete next[id];
          return { decisions: next };
        }),
      markDone: (key, mark) => set((s) => ({ done: { ...s.done, [key]: mark } })),
      unmarkDone: (key) =>
        set((s) => {
          const next = { ...s.done };
          delete next[key];
          return { done: next };
        }),
      addCapture: (c) => set((s) => ({ captures: [...s.captures, c] })),
      reset: () => set({ decisions: {}, done: {}, captures: [] }),
    }),
    { name: "kaizen-copilot-v1", storage: safeStorage, skipHydration: true },
  ),
);
