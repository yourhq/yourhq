"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTaskAttachments } from "@/hooks/use-task-attachments";
import type { AttachmentEntityType, TaskAttachment } from "@/lib/tasks/types";
import type { AssetFolder } from "@/lib/assets/types";
import { AttachmentPicker } from "./attachment-picker";
import { AssetUpload } from "@/components/assets/asset-upload";
import { AssetForm } from "@/components/assets/asset-form";
import { FileText, Package, ExternalLink, X, Paperclip } from "lucide-react";
import Link from "next/link";

interface TaskAttachmentsProps {
  taskId: string;
}

function AttachmentIcon({ attachment }: { attachment: TaskAttachment }) {
  if (attachment.entity_type === "document") {
    if (attachment.resolved_icon) {
      return <span className="text-sm leading-none">{attachment.resolved_icon}</span>;
    }
    return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
  }
  if (attachment.entity_type === "asset") {
    return <Package className="h-3.5 w-3.5 text-muted-foreground" />;
  }
  return <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />;
}

function AttachmentName({ attachment }: { attachment: TaskAttachment }) {
  const name = attachment.resolved_name ?? attachment.label ?? attachment.url ?? "Unnamed";

  if (attachment.entity_type === "document" && attachment.entity_id) {
    return (
      <Link
        href={`/dashboard/documents/${attachment.entity_id}`}
        className="text-sm hover:underline truncate"
        onClick={(e) => e.stopPropagation()}
      >
        {name}
      </Link>
    );
  }
  if (attachment.entity_type === "asset" && attachment.entity_id) {
    return (
      <Link
        href={`/dashboard/assets/${attachment.entity_id}`}
        className="text-sm hover:underline truncate"
        onClick={(e) => e.stopPropagation()}
      >
        {name}
      </Link>
    );
  }
  if (attachment.entity_type === "url" && attachment.url) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm hover:underline truncate"
        onClick={(e) => e.stopPropagation()}
      >
        {attachment.label || attachment.url}
      </a>
    );
  }
  return <span className="text-sm truncate">{name}</span>;
}

export function TaskAttachments({ taskId }: TaskAttachmentsProps) {
  const { attachments, loading, actions } = useTaskAttachments(taskId);
  const [showUpload, setShowUpload] = useState(false);
  const [showCreateNote, setShowCreateNote] = useState(false);
  const [assetFolders, setAssetFolders] = useState<AssetFolder[]>([]);

  const supabase = useMemo(() => createClient(), []);

  // Fetch asset folders when needed for upload/create dialogs
  useEffect(() => {
    if (showUpload || showCreateNote) {
      supabase
        .from("asset_folders")
        .select("*")
        .order("sort_order")
        .then(({ data }) => {
          if (data) setAssetFolders(data as AssetFolder[]);
        });
    }
  }, [showUpload, showCreateNote, supabase]);

  function handleAttachEntity(entityType: AttachmentEntityType, entityId: string, label?: string) {
    actions.addAttachment({ entity_type: entityType, entity_id: entityId, label });
  }

  function handleAttachUrl(url: string, label?: string) {
    actions.addAttachment({ entity_type: "url", url, label: label || url });
  }

  async function handleUploadSaved() {
    // The AssetUpload component created the asset. We need to find the most recently created asset
    // and attach it. We'll query for the latest asset by created_at.
    const { data: latest } = await supabase
      .from("assets")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (latest) {
      await actions.attachNewAsset(latest.id);
    }
    setShowUpload(false);
  }

  async function handleCreateNoteSaved() {
    const { data: latest } = await supabase
      .from("assets")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (latest) {
      await actions.attachNewAsset(latest.id);
    }
    setShowCreateNote(false);
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Attachments
            {attachments.length > 0 && (
              <span className="ml-1 text-muted-foreground/60">{attachments.length}</span>
            )}
          </span>
        </div>
        <AttachmentPicker
          attachments={attachments}
          onAttachEntity={handleAttachEntity}
          onAttachUrl={handleAttachUrl}
          onUploadFile={() => setShowUpload(true)}
          onCreateNote={() => setShowCreateNote(true)}
          searchEntities={actions.searchEntities}
        />
      </div>

      {/* Attachment list */}
      {!loading && attachments.length > 0 && (
        <div className="space-y-0.5">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="group flex items-center gap-2 rounded px-2 py-1 hover:bg-accent/40 transition-colors"
            >
              <AttachmentIcon attachment={att} />
              <div className="flex-1 min-w-0">
                <AttachmentName attachment={att} />
              </div>
              {att.entity_type === "asset" && att.resolved_asset_type && (
                <span className="text-[10px] text-muted-foreground/50 shrink-0">
                  {att.resolved_asset_type}
                </span>
              )}
              <button
                onClick={() => actions.removeAttachment(att.id)}
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-accent"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload dialog */}
      {showUpload && (
        <AssetUpload
          folders={assetFolders}
          onSave={handleUploadSaved}
          onCancel={() => setShowUpload(false)}
        />
      )}

      {/* Create note dialog */}
      {showCreateNote && (
        <AssetForm
          editingAsset={null}
          onSave={handleCreateNoteSaved}
          onCancel={() => setShowCreateNote(false)}
        />
      )}
    </div>
  );
}
