import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Document, DocumentFolder } from "@/lib/documents/types";
import { DocumentEditor } from "@/components/documents/document-editor";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("*, folder:document_folders(id, name)")
    .eq("id", id)
    .single();

  if (!doc) notFound();

  const [{ data: folders }, { data: agents }] = await Promise.all([
    supabase
      .from("document_folders")
      .select("*")
      .order("sort_order", { ascending: true }),
    supabase
      .from("agents")
      .select("slug, name")
      .order("name", { ascending: true }),
  ]);

  return (
    <DocumentEditor
      document={doc as unknown as Document}
      folders={(folders ?? []) as unknown as DocumentFolder[]}
      agents={(agents ?? []) as { slug: string; name: string }[]}
    />
  );
}
