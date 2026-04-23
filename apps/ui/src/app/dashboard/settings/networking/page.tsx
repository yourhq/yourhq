import { PageHeader } from "@/components/shared/page-header";
import { Globe } from "lucide-react";
import { NetworkingSettings } from "@/components/networking/networking-settings";
import { detectTailscale } from "@/lib/tailscale/detect";
import { readActiveProjectPublic } from "@/lib/projects/server";

export const dynamic = "force-dynamic";

export default async function NetworkingSettingsPage() {
  const [status, project] = await Promise.all([
    detectTailscale(),
    readActiveProjectPublic(),
  ]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Globe className="h-4 w-4" />}
        title="Networking"
        description="How you reach HQ — localhost, tailnet, or public."
      />
      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-2xl p-5">
          <NetworkingSettings
            initialStatus={{
              installed: status.installed,
              loggedIn: status.loggedIn,
              selfIp: status.selfIp,
              magicDnsName: status.magicDnsName,
              selfHostname: status.selfHostname,
              error: status.error,
            }}
            projectOrigins={project?.uiOrigins ?? []}
            projectId={project?.id ?? null}
          />
        </div>
      </div>
    </div>
  );
}
