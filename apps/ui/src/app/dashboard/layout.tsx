import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { listSwitcherWorkspaces } from "@/lib/workspaces";

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

  // Redirect to setup wizard if workspace is not initialized.
  // In hosted mode, the worker's provisioner calls complete_setup() so this
  // should already be true by the time the user reaches the dashboard.
  if (process.env.DEPLOYMENT_MODE !== "hosted") {
    const { data: workspace } = await supabase
      .from("workspace")
      .select("initialized")
      .limit(1)
      .maybeSingle();

    if (!workspace || !workspace.initialized) {
      redirect("/setup");
    }
  }

  const { activeWorkspaceId, workspaces } = await listSwitcherWorkspaces();
  const isHosted = process.env.DEPLOYMENT_MODE === "hosted";

  const { data: ws } = await supabase
    .from("workspace")
    .select("settings")
    .limit(1)
    .maybeSingle();
  const modules = (ws?.settings as Record<string, unknown>)?.modules as
    | Record<string, boolean>
    | undefined;

  return (
    <DashboardShell
      user={user}
      activeWorkspaceId={activeWorkspaceId}
      workspaces={workspaces}
      isHosted={isHosted}
      modules={modules}
    >
      {children}
    </DashboardShell>
  );
}
