"use client";

import { useEffect, useState } from "react";
import { Puzzle, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/shared/page-header";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface ModuleConfig {
  key: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const MODULES: ModuleConfig[] = [
  {
    key: "crm",
    label: "CRM",
    description:
      "Contacts, organizations, pipeline stages, and custom fields. Disable to hide the CRM section from the sidebar. Your data is preserved.",
    icon: Users,
  },
];

export default function ModulesSettingsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [modules, setModules] = useState<Record<string, boolean> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("workspace")
      .select("id, settings")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setWorkspaceId(data?.id ?? null);
        const settings = data?.settings as Record<string, unknown> | undefined;
        const mods = (settings?.modules as Record<string, boolean>) ?? {
          crm: true,
        };
        setModules(mods);
        setLoading(false);
      });
  }, [supabase]);

  async function toggleModule(key: string, enabled: boolean) {
    if (!workspaceId) return;
    const updated = { ...modules, [key]: enabled };
    setModules(updated);

    const { data: ws } = await supabase
      .from("workspace")
      .select("settings")
      .eq("id", workspaceId)
      .maybeSingle();
    const currentSettings =
      (ws?.settings as Record<string, unknown>) ?? {};

    await supabase
      .from("workspace")
      .update({
        settings: { ...currentSettings, modules: updated },
      })
      .eq("id", workspaceId);

    router.refresh();
  }

  if (loading) return <LoadingSkeleton variant="list" count={3} />;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Puzzle className="h-4 w-4" />}
        title="Modules"
        description="Enable or disable workspace features. Data is preserved when a module is disabled."
      />
      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-2xl p-5 space-y-3">
          {MODULES.map((mod) => {
            const Icon = mod.icon;
            const enabled = modules?.[mod.key] !== false;

            return (
              <div
                key={mod.key}
                className={cn(
                  "flex items-center gap-4 rounded-lg border border-border/60 bg-card px-4 py-4",
                  !enabled && "opacity-60",
                )}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium">{mod.label}</div>
                  <div className="text-[12px] text-muted-foreground leading-relaxed">
                    {mod.description}
                  </div>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(v) => toggleModule(mod.key, v)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
