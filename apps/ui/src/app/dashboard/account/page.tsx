import { redirect } from "next/navigation";
import { AccountPage } from "./account-page";

const isHosted = process.env.DEPLOYMENT_MODE === "hosted";

export default function Account() {
  if (!isHosted) redirect("/dashboard/settings");
  return <AccountPage />;
}
