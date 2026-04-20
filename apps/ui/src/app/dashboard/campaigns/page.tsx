import { redirect } from "next/navigation";

export default function CampaignsRedirect() {
  redirect("/dashboard/crm?tab=campaigns");
}
