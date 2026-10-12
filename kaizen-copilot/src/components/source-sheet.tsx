"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { FileText, Mail, NotebookPen, Quote, ScanText } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCopilot } from "@/components/copilot-provider";
import { formatDate } from "@/lib/dates";
import type { Evidence } from "@/lib/engine/derive";
import type { SourceType } from "@/lib/types";

const Ctx = createContext<{ open: (sourceId: string, quote?: string) => void } | null>(null);

export const SOURCE_ICON: Record<SourceType, typeof Mail> = {
  email: Mail,
  meeting_note: NotebookPen,
  quick_capture: ScanText,
};
export const SOURCE_LABEL: Record<SourceType, string> = {
  email: "Email thread",
  meeting_note: "Meeting note",
  quick_capture: "Quick capture",
};

function locate(text: string, quote: string): [number, number] | null {
  const lower = text.toLowerCase();
  const q = quote.toLowerCase().trim();
  let at = lower.indexOf(q);
  if (at >= 0) return [at, at + q.length];
  const head = q.split(/\.\.\.|…/)[0].trim().slice(0, 48);
  if (head.length >= 12 && (at = lower.indexOf(head)) >= 0) return [at, at + head.length];
  return null;
}

export function SourceSheetProvider({ children }: { children: React.ReactNode }) {
  const { sourceById } = useCopilot();
  const [state, setState] = useState<{ id: string; quote?: string } | null>(null);
  const source = state ? sourceById(state.id) : undefined;
  const span = useMemo(() => (source && state?.quote ? locate(source.text, state.quote) : null), [source, state]);
  const Icon = source ? SOURCE_ICON[source.type] : FileText;

  return (
    <Ctx.Provider value={{ open: (id, quote) => setState({ id, quote }) }}>
      {children}
      <Sheet open={!!state} onOpenChange={(o) => !o && setState(null)}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-xl">
          {source ? (
            <>
              <SheetHeader className="border-b">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon className="size-3.5" />
                  {SOURCE_LABEL[source.type]} · {formatDate(source.date)}
                </div>
                <SheetTitle className="pr-8 leading-snug">{source.title.replace(/^(Email Thread|Email|Meeting Notes)\s*[:—-]\s*/i, "")}</SheetTitle>
                <SheetDescription>
                  {state?.quote ? (span ? "The highlighted passage is the evidence for this item." : "Evidence verified against this source.") : "Full source as the assistant read it (editorial notes removed, sensitive data redacted)."}
                </SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <pre className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/90">
                  {span ? (
                    <>
                      {source.text.slice(0, span[0])}
                      <mark className="rounded bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-500/40" ref={(el) => el?.scrollIntoView({ block: "center" })}>
                        {source.text.slice(span[0], span[1])}
                      </mark>
                      {source.text.slice(span[1])}
                    </>
                  ) : (
                    source.text
                  )}
                </pre>
              </div>
            </>
          ) : (
            <SheetHeader>
              <SheetTitle>Source not found</SheetTitle>
            </SheetHeader>
          )}
        </SheetContent>
      </Sheet>
    </Ctx.Provider>
  );
}

export function useSourceSheet() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSourceSheet must be used inside SourceSheetProvider");
  return ctx;
}

/** A verified quote with a link to its source - the visible face of guardrail G1. */
export function EvidenceQuote({ evidence, compact }: { evidence: Evidence; compact?: boolean }) {
  const { open } = useSourceSheet();
  const { sourceById } = useCopilot();
  const source = sourceById(evidence.sourceId);
  const Icon = source ? SOURCE_ICON[source.type] : FileText;
  return (
    <button
      type="button"
      onClick={() => open(evidence.sourceId, evidence.quote)}
      className="group/q flex w-full items-start gap-2 rounded-lg border-l-2 border-primary/30 bg-muted/50 px-3 py-2 text-left transition-colors hover:border-primary hover:bg-muted"
    >
      <Quote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className={compact ? "line-clamp-2 text-[13px]" : "text-[13px]"}>{evidence.quote}</span>
        {source && (
          <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground group-hover/q:text-foreground">
            <Icon className="size-3" />
            {SOURCE_LABEL[source.type]} · {formatDate(source.date)} · view source
          </span>
        )}
      </span>
    </button>
  );
}
