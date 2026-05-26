"use client";

import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { useModules } from "@/components/shared/modules-context";
import type { WorkspacePulseData } from "@/lib/types/dashboard";
import { PulseTasksTab } from "./pulse-tasks-tab";
import { PulsePipelineTab } from "./pulse-pipeline-tab";
import { PulseSpendTab } from "./pulse-spend-tab";
import { PulseUsageTab } from "./pulse-usage-tab";
import { PulseSystemTab } from "./pulse-system-tab";

const triggerClass =
  "text-[11px] px-2.5 h-6 rounded-[4px] data-[state=active]:bg-card data-[state=active]:shadow-sm";

export function WorkspacePulse({ data }: { data: WorkspacePulseData }) {
  const modules = useModules();
  const showPipeline = modules?.crm !== false;
  const showUsage = data.usage.agentBudgets.length > 0;
  const showSpend = data.spend.agent_count > 0;
  const showSystem = data.gateways.length > 0;

  return (
    <section className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
      <Tabs defaultValue={data.smartDefaultTab}>
        <div className="flex items-center justify-between px-5 pt-4 pb-0">
          <h2 className="text-label text-muted-foreground/70">Workspace</h2>
          <TabsList className="h-7 bg-muted/30 p-0.5 rounded-lg">
            {showUsage && (
              <TabsTrigger value="usage" className={triggerClass}>
                Usage
              </TabsTrigger>
            )}
            <TabsTrigger value="tasks" className={triggerClass}>
              Tasks
            </TabsTrigger>
            {showPipeline && (
              <TabsTrigger value="pipeline" className={triggerClass}>
                Pipeline
              </TabsTrigger>
            )}
            {showSpend && (
              <TabsTrigger value="spend" className={triggerClass}>
                Spend
              </TabsTrigger>
            )}
            {showSystem && (
              <TabsTrigger value="system" className={triggerClass}>
                System
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <div className="px-5 pb-4 pt-4">
          {showUsage && (
            <TabsContent value="usage" className="mt-0">
              <PulseUsageTab usage={data.usage} />
            </TabsContent>
          )}

          <TabsContent value="tasks" className="mt-0">
            <PulseTasksTab
              tasks={data.tasks}
              completionTrend={data.tasks.completionTrend7d}
            />
          </TabsContent>

          {showPipeline && (
            <TabsContent value="pipeline" className="mt-0">
              <PulsePipelineTab crm={data.crm} />
            </TabsContent>
          )}

          {showSpend && (
            <TabsContent value="spend" className="mt-0">
              <PulseSpendTab spend={data.spend} />
            </TabsContent>
          )}

          {showSystem && (
            <TabsContent value="system" className="mt-0">
              <PulseSystemTab
                gateways={data.gateways}
                commandQueue={data.commandQueue}
                inboxQueue={data.inboxQueue}
              />
            </TabsContent>
          )}
        </div>
      </Tabs>
    </section>
  );
}
