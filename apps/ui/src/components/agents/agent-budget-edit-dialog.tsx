"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { setAgentBudget } from "@/app/dashboard/agents/usage-actions";
import type { AgentBudget } from "@/lib/usage/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  current: AgentBudget | null;
  onSaved?: () => void;
}

export function AgentBudgetEditDialog({
  open,
  onOpenChange,
  agentId,
  current,
  onSaved,
}: Props) {
  const [limitStr, setLimitStr] = useState("");
  const [threshold, setThreshold] = useState(80);
  const [hardCutoff, setHardCutoff] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && current) {
      setLimitStr(
        current.monthly_limit_usd != null
          ? String(current.monthly_limit_usd)
          : "",
      );
      setThreshold(current.soft_threshold_pct);
      setHardCutoff(current.hard_cutoff);
    } else if (open) {
      setLimitStr("");
      setThreshold(80);
      setHardCutoff(true);
    }
  }, [open, current]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const parsed = limitStr.trim() === "" ? null : parseFloat(limitStr);
      if (parsed !== null && (isNaN(parsed) || parsed < 0)) {
        toast.error("Enter a valid dollar amount or leave empty for no limit");
        return;
      }
      await setAgentBudget({
        agentId,
        monthlyLimitUsd: parsed,
        softThresholdPct: Math.max(1, Math.min(100, threshold)),
        hardCutoff,
      });
      toast.success("Budget updated");
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to save budget",
      );
    } finally {
      setSaving(false);
    }
  }, [agentId, limitStr, threshold, hardCutoff, onOpenChange, onSaved]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit budget</DialogTitle>
          <DialogDescription>
            Set a monthly spend limit for this agent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-muted-foreground">
              Monthly limit (USD)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={limitStr}
              onChange={(e) => setLimitStr(e.target.value)}
              placeholder="No limit"
              className="w-full h-9 rounded-md border border-border/60 bg-transparent px-3 text-sm tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-border placeholder:text-muted-foreground/40"
            />
            <p className="text-[11px] text-muted-foreground/50">
              Leave empty for no limit — usage is still tracked.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-muted-foreground">
              Soft warning at
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={100}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-20 h-9 rounded-md border border-border/60 bg-transparent px-3 text-sm tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-border"
              />
              <span className="text-[12px] text-muted-foreground">%</span>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hardCutoff}
              onChange={(e) => setHardCutoff(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <span className="text-[12px] text-foreground">
              Hard cutoff — stop the agent when exceeded
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
