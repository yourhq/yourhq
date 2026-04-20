import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Organization } from "@/lib/organizations/types";
import { OrgDetail } from "@/components/organizations/org-detail";

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: organization } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", id)
    .single();

  if (!organization) notFound();

  return <OrgDetail organization={organization as Organization} />;
}
