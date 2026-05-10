import { redirect } from "next/navigation";

const isHosted = process.env.DEPLOYMENT_MODE === "hosted";

export default function SignupPage() {
  if (isHosted) redirect("/auth");
  redirect("/onboarding");
}
