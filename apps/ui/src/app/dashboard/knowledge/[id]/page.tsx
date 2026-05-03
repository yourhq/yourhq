import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { KnowledgeItem, KnowledgeFolder } from "@/lib/knowledge/types";
import { KnowledgeDetailEditor } from "@/components/knowledge/knowledge-detail-editor";

export default async function KnowledgeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("knowledge_items")
    .select("*, folder:knowledge_folders(id, name)")
    .eq("id", id)
    .single();

  if (!item) notFound();

  const { data: folders } = await supabase
    .from("knowledge_folders")
    .select("*")
    .order("sort_order", { ascending: true });

  return (
    <KnowledgeDetailEditor
      item={item as unknown as KnowledgeItem}
      folders={(folders ?? []) as unknown as KnowledgeFolder[]}
    />
  );
}
