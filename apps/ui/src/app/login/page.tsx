import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";

const isHosted = process.env.DEPLOYMENT_MODE === "hosted";

export default function LoginPage() {
  if (isHosted) redirect("/auth");
  return <LoginForm mode="oss" />;
}
