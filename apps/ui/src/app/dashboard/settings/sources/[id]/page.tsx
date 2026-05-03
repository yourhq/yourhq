import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { SourceConnection } from "@/lib/sources/types";
import { SourceConnectionDetail } from "@/components/sources/source-connection-detail";

export default async function SourceConnectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: connection } = await supabase
    .from("source_connections")
    .select("*")
    .eq("id", id)
    .single();

  if (!connection) notFound();

  return <SourceConnectionDetail connection={connection as SourceConnection} />;
}
