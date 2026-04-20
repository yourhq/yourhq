"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Asset } from "@/lib/assets/types";
import { logAudit } from "@/lib/audit/log";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";

interface AssetEditorProps {
  asset: Asset;
}

export function AssetEditor({ asset }: AssetEditorProps) {
  const supabase = useMemo(() => createClient(), []);
  const [content, setContent] = useState(asset.content ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isDirty = content !== (asset.content ?? "");

  async function handleSave() {
    setSaving(true);
    await supabase.from("assets").update({ content }).eq("id", asset.id);
    logAudit(supabase, {
      module: "assets",
      entity_type: "asset",
      entity_id: asset.id,
      action: "updated",
      summary: `Updated content of asset '${asset.name}'`,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Content</span>
        <Button
          size="sm"
          variant={isDirty ? "default" : "outline"}
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="h-7 text-xs px-2"
        >
          <Save className="h-3 w-3 mr-1" />
          {saving ? "Saving..." : saved ? "Saved" : "Save"}
        </Button>
      </div>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="min-h-[400px] font-mono text-xs"
        placeholder="Write content here (Markdown supported)..."
      />
    </div>
  );
}
