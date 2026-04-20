import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SetupWizard } from "@/components/setup/setup-wizard";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const supabase = await createClient();

  const { data: workspace } = await supabase
    .from("workspace")
    .select("initialized")
    .limit(1)
    .maybeSingle();

  if (workspace?.initialized) {
    redirect("/dashboard");
  }

  return <SetupWizard />;
}
