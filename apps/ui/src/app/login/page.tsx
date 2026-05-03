import { LoginForm } from "./login-form";

const isHosted = process.env.DEPLOYMENT_MODE === "hosted";

export default function LoginPage() {
  return (
    <LoginForm mode={isHosted ? "hosted" : "oss"} />
  );
}
