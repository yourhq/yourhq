"use client";

import { Suspense } from "react";
import { useAutomationRules } from "@/hooks/use-automation-rules";
import { AutomationRulesTable } from "@/components/automations/automation-rules-table";
import { AutomationRuleForm } from "@/components/automations/automation-rule-form";
import { PageHeader } from "@/components/shared/page-header";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Plus, Zap } from "lucide-react";

function AutomationsContent() {
  const { rules, loading, actions, form } = useAutomationRules();

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Zap className="h-4 w-4" />}
        title="Automations"
        description="Rules that fire inbox items when data changes."
        primaryAction={
          <Button size="sm" onClick={form.openCreateForm}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New rule
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-5">
        {loading ? (
          <LoadingSkeleton variant="table" count={5} />
        ) : rules.length === 0 ? (
          <EmptyState
            icon={Zap}
            title="No automation rules"
            description="Create rules to automatically notify agents when contact data changes."
            action={{
              label: "New rule",
              onClick: form.openCreateForm,
            }}
          />
        ) : (
          <AutomationRulesTable
            rules={rules}
            onEdit={form.openEditForm}
            onDelete={actions.deleteRule}
            onToggleActive={actions.toggleActive}
          />
        )}
      </div>

      {form.showForm && (
        <AutomationRuleForm
          editingRule={form.editingRule}
          onSave={form.onFormSaved}
          onCancel={form.closeForm}
        />
      )}
    </div>
  );
}

export default function AutomationsPage() {
  return (
    <Suspense>
      <AutomationsContent />
    </Suspense>
  );
}
