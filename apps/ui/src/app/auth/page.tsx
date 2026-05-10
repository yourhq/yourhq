import { redirect } from "next/navigation";
import { AuthForm } from "./auth-form";

const isHosted = process.env.DEPLOYMENT_MODE === "hosted";

export default function AuthPage() {
  if (!isHosted) redirect("/login");
  return <AuthForm />;
}
