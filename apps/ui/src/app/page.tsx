import { redirect } from "next/navigation";
import { getActiveWorkspace } from "@/lib/workspaces";

export default async function Home() {
  if (process.env.DEPLOYMENT_MODE === "hosted") {
    redirect("/login");
  }

  const workspace = await getActiveWorkspace().catch(() => null);

  if (!workspace) {
    redirect("/onboarding");
  }

  redirect("/dashboard");
}
