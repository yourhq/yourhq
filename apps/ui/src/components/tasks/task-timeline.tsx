"use client";

import { useMemo, useState } from "react";
import { useComments } from "@/hooks/use-comments";
import { useEntityAuditLog } from "@/hooks/use-audit-log";
import type { Comment, CommentAttachmentRef } from "@/lib/tasks/types";
import type { AuditLogEntry } from "@/lib/audit/types";
import { renderMentions } from "./mention-badge";
import { CommentForm } from "./comment-form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  Bot,
  User,
  MoreHorizontal,
  Pencil,
  Trash2,
  FileText,
  Package,
  ExternalLink,
  ArrowRight,
  UserPlus,
  Plus,
  Eye,
  EyeOff,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

type TimelineItem =
  | { kind: "comment"; data: Comment; timestamp: number }
  | { kind: "activity"; data: AuditLogEntry; timestamp: number };

const ACTION_ICONS: Record<string, typeof ArrowRight> = {
  status_changed: ArrowRight,
  assigned: UserPlus,
  updated: Pencil,
  created: Plus,
};

const ATTACHMENT_ICONS: Record<string, typeof FileText> = {
  document: FileText,
  asset: Package,
  url: ExternalLink,
};

function ActorAvatar({ comment }: { comment: Comment }) {
  const isAgent = comment.actor_type === "agent";
  const emoji = isAgent ? (comment.actor_agent?.meta?.emoji as string | undefined) : undefined;
  if (isAgent && comment.actor_agent?.avatar_url) {
    return (
      <Avatar size="sm">
        <AvatarImage src={comment.actor_agent.avatar_url} alt={comment.actor_agent.name} />
        <AvatarFallback>{emoji || <Bot className="h-3 w-3" />}</AvatarFallback>
      </Avatar>
    );
  }
  if (isAgent && emoji) {
    return (
      <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0 text-sm">
        {emoji}
      </div>
    );
  }
  return (
    <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
      {isAgent ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
    </div>
  );
}

function CommentAttachments({ attachments }: { attachments: CommentAttachmentRef[] }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {attachments.map((att, idx) => {
        const Icon = ATTACHMENT_ICONS[att.entity_type] ?? FileText;
        const isUrl = att.entity_type === "url" && att.url;
        const content = (
          <span className="inline-flex items-center gap-1 rounded bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted transition-colors">
            <Icon className="h-2.5 w-2.5" />
            <span className="max-w-[150px] truncate">{att.label}</span>
          </span>
        );
        if (isUrl) {
          return <a key={idx} href={att.url!} target="_blank" rel="noopener noreferrer">{content}</a>;
        }
        return <span key={idx}>{content}</span>;
      })}
    </div>
  );
}

function isEdited(comment: Comment) {
  if (!comment.updated_at || !comment.created_at) return false;
  return new Date(comment.updated_at).getTime() - new Date(comment.created_at).getTime() > 1000;
}

function TimelineComment({
  comment,
  onReply,
  onEdit,
  onDelete,
}: {
  comment: Comment;
  onReply: (body: string, parentId: string) => void;
  onEdit?: (id: string, body: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [showReply, setShowReply] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isAgent = comment.actor_type === "agent";
  const isSystem = comment.actor_type === "system";
  const isHuman = comment.actor_type === "human";
  const actorName = isAgent && comment.actor_agent
    ? comment.actor_agent.name
    : isSystem ? "System" : "You";
  const metaAttachments = (comment.meta?.attachments ?? []) as CommentAttachmentRef[];

  return (
    <div className="group/comment space-y-1">
      <div className="flex gap-2">
        <div className="shrink-0 mt-0.5">
          <ActorAvatar comment={comment} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs">
            <span className={cn("font-medium", isAgent && "text-accent-purple")}>
              {actorName}
            </span>
            <span className="text-muted-foreground">
              {format(new Date(comment.created_at), "MMM d, h:mm a")}
            </span>
            {isEdited(comment) && (
              <span className="text-[10px] text-muted-foreground/50">(edited)</span>
            )}
            {isHuman && (onEdit || onDelete) && (
              <div className="ml-auto opacity-0 group-hover/comment:opacity-100 transition-opacity">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground">
                      <MoreHorizontal className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-32">
                    {onEdit && (
                      <DropdownMenuItem onClick={() => setEditing(true)} className="gap-2 text-xs">
                        <Pencil className="h-3 w-3" /> Edit
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <DropdownMenuItem onClick={() => setConfirmDelete(true)} className="gap-2 text-xs text-destructive focus:text-destructive">
                        <Trash2 className="h-3 w-3" /> Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {editing ? (
            <div className="mt-1">
              <CommentForm
                compact
                initialBody={comment.body}
                onSubmit={(newBody) => { onEdit?.(comment.id, newBody); setEditing(false); }}
                onCancel={() => setEditing(false)}
                submitLabel="Save"
                portal={false}
              />
            </div>
          ) : (
            <>
              <div className="text-xs mt-0.5 whitespace-pre-wrap text-foreground/90">
                {renderMentions(comment.body)}
              </div>
              <CommentAttachments attachments={metaAttachments} />
            </>
          )}

          {!editing && (
            <button
              onClick={() => setShowReply(!showReply)}
              className="text-[11px] text-muted-foreground hover:text-foreground mt-0.5 opacity-0 group-hover/comment:opacity-100 transition-opacity"
            >
              Reply
            </button>
          )}
        </div>
      </div>

      {showReply && (
        <div className="ml-8">
          <CommentForm
            compact
            placeholder="Reply..."
            onSubmit={(body) => { onReply(body, comment.id); setShowReply(false); }}
            portal={false}
          />
        </div>
      )}

      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-8 space-y-1.5 border-l border-border/50 pl-3">
          {comment.replies.map((reply) => (
            <TimelineComment
              key={reply.id}
              comment={reply}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this comment?"
        description="This removes the comment from the thread. Any replies will remain."
        confirmLabel="Delete"
        onConfirm={async () => { onDelete?.(comment.id); setConfirmDelete(false); }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function ActivityEntry({ entry }: { entry: AuditLogEntry }) {
  const Icon = ACTION_ICONS[entry.action] || Pencil;
  const isAgent = entry.actor_type === "agent";
  const emoji = isAgent ? (entry.actor_agent?.meta?.emoji as string | undefined) : undefined;

  return (
    <div className="flex items-start gap-2 py-1 pl-1">
      <div className={cn(
        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px]",
        isAgent ? "bg-accent-emerald/10 text-accent-emerald" : "bg-muted text-muted-foreground"
      )}>
        {isAgent ? (emoji || <Bot className="h-2.5 w-2.5" />) : <Icon className="h-2.5 w-2.5" />}
      </div>
      <p className="flex-1 min-w-0 text-[11px] text-muted-foreground/70 leading-relaxed">
        {entry.summary || entry.action}
      </p>
      <span className="shrink-0 text-[10px] text-muted-foreground/40 tabular-nums">
        {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
      </span>
    </div>
  );
}

export function TaskTimeline({ taskId }: { taskId: string }) {
  const { comments, loading: commentsLoading, actions } = useComments(taskId);
  const { entries, loading: activityLoading } = useEntityAuditLog({ entity_type: "task", entity_id: taskId });
  const [showActivity, setShowActivity] = useState(true);

  const timeline = useMemo(() => {
    const items: TimelineItem[] = [];

    for (const comment of comments) {
      items.push({
        kind: "comment",
        data: comment,
        timestamp: new Date(comment.created_at).getTime(),
      });
    }

    if (showActivity) {
      for (const entry of entries) {
        items.push({
          kind: "activity",
          data: entry,
          timestamp: new Date(entry.created_at).getTime(),
        });
      }
    }

    items.sort((a, b) => a.timestamp - b.timestamp);
    return items;
  }, [comments, entries, showActivity]);

  const loading = commentsLoading || activityLoading;

  return (
    <div className="space-y-3">
      {/* Header with activity toggle */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Timeline
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[11px] text-muted-foreground/60 hover:text-muted-foreground gap-1 px-2"
          onClick={() => setShowActivity(!showActivity)}
        >
          {showActivity ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          <span className="hidden sm:inline">Activity</span>
        </Button>
      </div>

      {/* Timeline items */}
      {loading ? (
        <div className="py-3 text-center text-[11px] text-muted-foreground/50">
          Loading...
        </div>
      ) : timeline.length === 0 ? (
        <div className="py-3 text-center text-[11px] text-muted-foreground/50">
          No activity yet
        </div>
      ) : (
        <div className="space-y-2">
          {timeline.map((item) => {
            if (item.kind === "comment") {
              return (
                <TimelineComment
                  key={`c-${item.data.id}`}
                  comment={item.data}
                  onReply={actions.addComment}
                  onEdit={actions.editComment}
                  onDelete={actions.deleteComment}
                />
              );
            }
            return (
              <ActivityEntry key={`a-${item.data.id}`} entry={item.data} />
            );
          })}
        </div>
      )}

      {/* Comment input */}
      <div className="-mx-4 -mb-4 mt-3 border-t border-border/30 bg-muted/20 px-4 py-3 space-y-1.5">
        <CommentForm
          onSubmit={(body) => actions.addComment(body)}
          placeholder="Add a comment... use @ to notify an agent"
          enableAttachments
          portal={false}
          showMentionHint
        />
      </div>
    </div>
  );
}
