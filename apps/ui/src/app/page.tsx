import { redirect } from "next/navigation";
import { getActiveProject } from "@/lib/projects";

export default async function Home() {
  const mode = process.env.DEPLOYMENT_MODE;
  console.log(`[page /] DEPLOYMENT_MODE="${mode}"`);

  if (mode === "hosted") {
    redirect("/login");
  }

  const project = await getActiveProject().catch((err) => {
    console.error("[page /] getActiveProject error:", err);
    return null;
  });
  console.log(`[page /] project=${project ? project.id : "null"}`);

  if (!project) {
    redirect("/onboarding");
  }

  redirect("/dashboard");
}
