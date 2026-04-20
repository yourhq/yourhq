import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Redirect to setup wizard if workspace is not initialized
  const { data: workspace } = await supabase
    .from("workspace")
    .select("initialized")
    .limit(1)
    .maybeSingle();

  if (!workspace || !workspace.initialized) {
    redirect("/setup");
  }

  return <DashboardShell user={user}>{children}</DashboardShell>;
}
