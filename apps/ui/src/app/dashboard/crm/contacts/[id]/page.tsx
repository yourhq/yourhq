import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Contact } from "@/lib/crm/types";
import { ContactDetailView } from "@/components/crm/contact-detail-view";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("*, campaign:campaigns(id, name)")
    .eq("id", id)
    .single();

  if (!contact) notFound();

  return <ContactDetailView contact={contact as Contact} />;
}
