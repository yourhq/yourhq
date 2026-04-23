import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { getRegistry } from "@/lib/projects/registry";

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

  const registry = await getRegistry();
  const switcherProjects = registry.projects.map((p) => ({
    id: p.id,
    label: p.label,
    emoji: p.emoji,
  }));

  return (
    <DashboardShell
      user={user}
      activeProjectId={registry.activeProjectId}
      projects={switcherProjects}
    >
      {children}
    </DashboardShell>
  );
}
