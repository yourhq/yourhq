import { redirect } from "next/navigation";
import { getActiveProject } from "@/lib/projects";

export default async function Home() {
  if (process.env.DEPLOYMENT_MODE === "hosted") {
    redirect("/login");
  }

  const project = await getActiveProject().catch(() => null);
  if (!project) {
    redirect("/onboarding");
  }

  redirect("/dashboard");
}
