import { redirect } from "next/navigation";
import { SignupForm } from "./signup-form";

const isHosted = process.env.DEPLOYMENT_MODE === "hosted";

export default function SignupPage() {
  if (!isHosted) redirect("/onboarding");
  return <SignupForm />;
}
