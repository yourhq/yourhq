import { redirect } from "next/navigation";

export default function Home() {
  if (process.env.DEPLOYMENT_MODE === "hosted") {
    redirect("/login");
  }
  redirect("/dashboard");
}
