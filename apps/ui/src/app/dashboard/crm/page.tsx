"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Users, Settings2 } from "lucide-react";
import { FirstVisitHint } from "@/components/onboarding/first-visit-hint";
import { ContactsTab } from "@/components/crm/contacts-tab";
import { TemplatesTab } from "@/components/crm/templates-tab";
import { CampaignsTab } from "@/components/crm/campaigns-tab";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

const tabs = [
  { key: "contacts", label: "Contacts" },
  { key: "campaigns", label: "Campaigns" },
  { key: "templates", label: "Templates" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

function CrmContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const activeTab = (searchParams.get("tab") as TabKey) || "contacts";

  function setTab(tab: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "contacts") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  return (
    <div className="flex h-full flex-col">
      <Tabs value={activeTab} onValueChange={setTab} className="flex h-full flex-col">
        <PageHeader
          icon={<Users className="h-4 w-4" />}
          title="CRM"
          description="People, campaigns, and outreach templates."
          secondaryActions={
            <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
              <Link href="/dashboard/settings/pipeline" title="CRM settings">
                <Settings2 className="h-3.5 w-3.5" />
              </Link>
            </Button>
          }
          tabs={
            <TabsList variant="line" className="h-10">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                  className="text-[13px]"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          }
        />
        <div className="px-5 pt-3">
          <FirstVisitHint
            pageKey="contacts"
            title="Your relationship network"
            description="Contacts and organizations live here. Agents can research, enrich, and reach out on your behalf."
          />
        </div>
        <TabsContent value="contacts" className="flex-1 overflow-hidden">
          <ContactsTab />
        </TabsContent>
        <TabsContent value="campaigns" className="flex-1 overflow-hidden">
          <CampaignsTab />
        </TabsContent>
        <TabsContent value="templates" className="flex-1 overflow-hidden">
          <TemplatesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function CrmPage() {
  return (
    <Suspense>
      <CrmContent />
    </Suspense>
  );
}
