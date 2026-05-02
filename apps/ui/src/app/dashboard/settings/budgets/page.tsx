"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DollarSign } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit/log";
import { PageHeader, PageSection } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";

export default function BudgetDefaultsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [budgetLimit, setBudgetLimit] = useState("");
  const [budgetThreshold, setBudgetThreshold] = useState(80);
  const [budgetHardCutoff, setBudgetHardCutoff] = useState(true);

  useEffect(() => {
    supabase
      .from("workspace")
      .select("*")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setWorkspaceId(data.id);
          const d = data as Record<string, unknown>;
          setBudgetLimit(d.default_agent_budget_usd != null ? String(d.default_agent_budget_usd) : "");
          setBudgetThreshold(typeof d.default_soft_threshold_pct === "number" ? d.default_soft_threshold_pct : 80);
          setBudgetHardCutoff(d.default_hard_cutoff !== false);
        }
        setLoading(false);
      });
  }, [supabase]);

  const handleSave = useCallback(async () => {
    if (!workspaceId) return;
    setSaving(true);

    const parsedLimit = budgetLimit.trim() === "" ? null : parseFloat(budgetLimit);
    const payload = {
      default_agent_budget_usd: parsedLimit !== null && !isNaN(parsedLimit) ? parsedLimit : null,
      default_soft_threshold_pct: Math.max(1, Math.min(100, budgetThreshold)),
      default_hard_cutoff: budgetHardCutoff,
    };

    const { error } = await supabase
      .from("workspace")
      .update(payload)
      .eq("id", workspaceId);

    if (error) {
      toast.error("Failed to save");
      setSaving(false);
      return;
    }

    logAudit(supabase, {
      module: "settings",
      entity_type: "workspace",
      entity_id: workspaceId,
      action: "updated",
      summary: "Updated budget defaults",
    });

    toast.success("Saved");
    setSaving(false);
  }, [supabase, workspaceId, budgetLimit, budgetThreshold, budgetHardCutoff]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<DollarSign className="h-4 w-4" />}
        title="Budget Defaults"
        description="Default budget settings applied to newly created agents."
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-2xl">
          {loading ? (
            <PageSection>
              <div className="space-y-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-9 rounded bg-muted/20 animate-pulse" />
                ))}
              </div>
            </PageSection>
          ) : (
            <>
              <PageSection
                title="Defaults"
                description="Existing agents keep their own settings. These apply to new agents only."
              >
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-medium text-muted-foreground">
                      Default monthly budget (USD)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={budgetLimit}
                      onChange={(e) => setBudgetLimit(e.target.value)}
                      placeholder="No limit"
                      className="w-full h-9 rounded-md border border-border/60 bg-transparent px-3 text-sm tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-border placeholder:text-muted-foreground/40"
                    />
                    <p className="text-[11px] text-muted-foreground/50">
                      Leave empty for no limit — usage is still tracked.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-medium text-muted-foreground">
                      Soft warning threshold
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={budgetThreshold}
                        onChange={(e) => setBudgetThreshold(Number(e.target.value))}
                        className="w-20 h-9 rounded-md border border-border/60 bg-transparent px-3 text-sm tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-border"
                      />
                      <span className="text-[12px] text-muted-foreground">%</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground/50">
                      Agents show a warning when usage exceeds this percentage of their budget.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={budgetHardCutoff}
                      onChange={(e) => setBudgetHardCutoff(e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    <span className="text-[12px] text-foreground">
                      Hard cutoff — stop agents that exceed their limit
                    </span>
                  </label>
                </div>
              </PageSection>

              <PageSection>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save"}
                </Button>
              </PageSection>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
