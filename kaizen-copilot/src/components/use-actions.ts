"use client";

import { toast } from "sonner";
import { useCopilot } from "@/components/copilot-provider";
import { useCopilotStore } from "@/lib/store";
import type { Proposal } from "@/lib/engine/derive";
import type { BriefItem } from "@/lib/engine/brief";

/** Every write goes through here so role checks (S7) and audit stamps are applied consistently. */
export function useActions() {
  const { user } = useCopilot();
  const decide = useCopilotStore((s) => s.decide);
  const clearDecision = useCopilotStore((s) => s.clearDecision);
  const markDone = useCopilotStore((s) => s.markDone);
  const unmarkDone = useCopilotStore((s) => s.unmarkDone);
  const canApprove = user.canApprove;

  const guard = () => {
    if (!canApprove) {
      toast.error(`${user.role}s have view-only access. Ask a founder or Jay to approve.`);
      return false;
    }
    return true;
  };
  const now = () => new Date().toISOString();

  return {
    canApprove,
    approve(p: Proposal, value?: string) {
      if (!guard()) return;
      decide(p.id, { status: "approved", by: user.name, at: now(), value: value ?? p.after });
      toast.success(p.kind === "create_lead" ? `${p.company} added to Kaizen` : "Approved and written to Kaizen");
    },
    approveMany(ps: Proposal[]) {
      if (!guard()) return;
      ps.forEach((p) => decide(p.id, { status: "approved", by: user.name, at: now(), value: p.after }));
      toast.success(`${ps.length} changes approved`);
    },
    reject(p: Proposal, reason: string) {
      if (!guard()) return;
      decide(p.id, { status: "rejected", by: user.name, at: now(), reason });
      toast(`Rejected: ${reason}`);
    },
    resolve(p: Proposal, answer: string) {
      if (!guard()) return;
      decide(p.id, { status: "resolved", by: user.name, at: now(), reason: answer });
      toast.success("Clarification recorded");
    },
    undo(p: Proposal) {
      if (!guard()) return;
      if (p.tier === "auto" && p.state === "auto_applied") decide(p.id, { status: "undone", by: user.name, at: now() });
      else clearDecision(p.id);
      toast("Change undone");
    },
    done(item: BriefItem) {
      markDone(item.id, { by: user.name, at: now(), ids: item.ids, label: `${item.company}: ${item.title}` });
      toast.success("Marked done", { description: item.title });
    },
    undone(key: string) {
      unmarkDone(key);
    },
  };
}
