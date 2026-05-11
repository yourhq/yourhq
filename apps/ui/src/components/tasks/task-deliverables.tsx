"use client";

import { useState } from "react";
import { useDeliverables } from "@/hooks/use-deliverables";
import type { EntityLink, ReviewStatus } from "@/lib/entity-links/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  File,
  ExternalLink,
  Database,
  Check,
  MessageSquare,
  XCircle,
  Bot,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_review: "bg-status-info/20 text-status-info",
  approved: "bg-status-success/20 text-status-success",
  revision_requested: "bg-status-warning/20 text-status-warning",
  rejected: "bg-status-error/20 text-status-error",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  in_review: "In Review",
  approved: "Approved",
  revision_requested: "Revision Requested",
  rejected: "Rejected",
};

function DeliverableIcon({ link }: { link: EntityLink }) {
  const kind = link.resolved_extra?.kind as string | undefined;
  switch (link.target_type) {
    case "knowledge_item":
      if (kind === "file") return <File className="h-4 w-4 text-muted-foreground" />;
      return <FileText className="h-4 w-4 text-muted-foreground" />;
    case "collection_record":
      return <Database className="h-4 w-4 text-muted-foreground" />;
    default:
      return <ExternalLink className="h-4 w-4 text-muted-foreground" />;
  }
}

interface TaskDeliverablesProps {
  taskId: string;
}

export function TaskDeliverables({ taskId }: TaskDeliverablesProps) {
  const { deliverables, loading, actions } = useDeliverables(taskId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="text-xs text-muted-foreground">Loading deliverables...</span>
      </div>
    );
  }

  if (deliverables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="h-8 w-8 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground/60">No deliverables yet</p>
        <p className="text-xs text-muted-foreground/40 mt-1">
          Agents submit work products here for review
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {deliverables.map((d) => (
        <DeliverableCard key={d.id} deliverable={d} actions={actions} />
      ))}
    </div>
  );
}

function DeliverableCard({
  deliverable,
  actions,
}: {
  deliverable: EntityLink;
  actions: ReturnType<typeof useDeliverables>["actions"];
}) {
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [actionType, setActionType] = useState<"revision" | "reject" | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const status = deliverable.review_status ?? "draft";
  const canReview = status === "draft" || status === "in_review";
  const title = deliverable.resolved_name ?? deliverable.label ?? "Deliverable";

  function openLink() {
    if (deliverable.target_type === "url" && deliverable.url) {
      window.open(deliverable.url, "_blank");
    }
  }

  async function handleApprove() {
    setReviewing(true);
    await actions.approve(deliverable.id);
    setReviewing(false);
  }

  async function handleSubmitNote() {
    if (!revisionNote.trim()) return;
    setReviewing(true);
    if (actionType === "revision") {
      await actions.requestRevision(deliverable.id, revisionNote.trim());
    } else if (actionType === "reject") {
      await actions.reject(deliverable.id, revisionNote.trim());
    }
    setReviewing(false);
    setRevisionNote("");
    setShowRevisionInput(false);
    setActionType(null);
  }

  return (
    <div className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-2">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <DeliverableIcon link={deliverable} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <button
              onClick={openLink}
              className={cn(
                "text-sm font-medium truncate text-left",
                deliverable.url && "hover:underline cursor-pointer"
              )}
            >
              {title}
            </button>
            <Badge
              variant="secondary"
              className={cn("text-[10px] px-1.5 py-0 h-4 shrink-0", STATUS_STYLES[status])}
            >
              {status === "approved" && <Check className="h-2.5 w-2.5 mr-0.5" />}
              {STATUS_LABELS[status]}
            </Badge>
          </div>
          {deliverable.submitted_by_agent && (
            <div className="flex items-center gap-1 mt-0.5">
              <Bot className="h-3 w-3 text-muted-foreground/50" />
              <span className="text-[11px] text-muted-foreground/60">
                {deliverable.submitted_by_agent.name}
              </span>
              {deliverable.created_at && (
                <span className="text-[11px] text-muted-foreground/40">
                  {" "}
                  &middot;{" "}
                  {formatDistanceToNow(new Date(deliverable.created_at), { addSuffix: true })}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {deliverable.review_note && (status === "revision_requested" || status === "rejected") && (
        <div className={cn(
          "rounded px-3 py-2 text-xs",
          status === "revision_requested" ? "bg-status-warning/10 text-status-warning" : "bg-status-error/10 text-status-error"
        )}>
          <span className="font-medium">Note: </span>
          {deliverable.review_note}
        </div>
      )}

      {canReview && !showRevisionInput && (
        <div className="flex items-center gap-1.5 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs text-status-success border-status-success/30 hover:bg-status-success/10"
            onClick={handleApprove}
            disabled={reviewing}
          >
            <Check className="h-3 w-3 mr-1" />
            {reviewing ? "Approving..." : "Approve"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs text-status-warning border-status-warning/30 hover:bg-status-warning/10"
            onClick={() => {
              setActionType("revision");
              setShowRevisionInput(true);
            }}
            disabled={reviewing}
          >
            <MessageSquare className="h-3 w-3 mr-1" />
            Request revision
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-status-error hover:bg-status-error/10"
            onClick={() => {
              setActionType("reject");
              setShowRevisionInput(true);
            }}
            disabled={reviewing}
          >
            <XCircle className="h-3 w-3 mr-1" />
            Reject
          </Button>
        </div>
      )}

      {showRevisionInput && (
        <div className="space-y-1.5 pt-1">
          <Textarea
            placeholder={actionType === "reject" ? "Reason for rejection..." : "What needs to be revised..."}
            value={revisionNote}
            onChange={(e) => setRevisionNote(e.target.value)}
            rows={2}
            className="text-xs min-h-[3rem]"
            autoFocus
          />
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => {
                setShowRevisionInput(false);
                setActionType(null);
                setRevisionNote("");
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-6 text-xs"
              onClick={handleSubmitNote}
              disabled={!revisionNote.trim() || reviewing}
            >
              {reviewing ? "Sending..." : actionType === "reject" ? "Reject" : "Send"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
