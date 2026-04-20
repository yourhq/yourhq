import { redirect } from "next/navigation";

export default async function ContactDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/crm/contacts/${id}`);
}
