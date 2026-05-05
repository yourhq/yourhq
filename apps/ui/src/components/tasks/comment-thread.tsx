"use client";

import type { Comment, CommentAttachmentRef } from "@/lib/tasks/types";
import { renderMentions } from "./mention-badge";
import { CommentForm } from "./comment-form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Bot,
  User,
  MoreHorizontal,
  Pencil,
  Trash2,
  FileText,
  Package,
  ExternalLink,
  MessageSquare,
} from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

interface CommentThreadProps {
  comments: Comment[];
  loading: boolean;
  onAddComment: (body: string, parentId?: string) => void;
  onEditComment?: (id: string, body: string) => void;
  onDeleteComment?: (id: string) => void;
  /** Pass false when rendered inside a Dialog */
  portal?: boolean;
}

function isEdited(comment: Comment) {
  if (!comment.updated_at || !comment.created_at) return false;
  const diff =
    new Date(comment.updated_at).getTime() -
    new Date(comment.created_at).getTime();
  return diff > 1000;
}

const ATTACHMENT_ICONS: Record<string, typeof FileText> = {
  document: FileText,
  asset: Package,
  url: ExternalLink,
};

function CommentAttachments({
  attachments,
}: {
  attachments: CommentAttachmentRef[];
}) {
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
          return (
            <a
              key={idx}
              href={att.url!}
              target="_blank"
              rel="noopener noreferrer"
            >
              {content}
            </a>
          );
        }
        return <span key={idx}>{content}</span>;
      })}
    </div>
  );
}

function ActorAvatar({ comment }: { comment: Comment }) {
  const isAgent = comment.actor_type === "agent";

  if (isAgent && comment.actor_agent?.avatar_url) {
    return (
      <Avatar size="sm">
        <AvatarImage src={comment.actor_agent.avatar_url} alt={comment.actor_agent.name} />
        <AvatarFallback>
          <Bot className="h-3 w-3" />
        </AvatarFallback>
      </Avatar>
    );
  }

  return (
    <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
      {isAgent ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
    </div>
  );
}

function CommentItem({
  comment,
  onReply,
  onEdit,
  onDelete,
  portal,
}: {
  comment: Comment;
  onReply: (body: string, parentId: string) => void;
  onEdit?: (id: string, body: string) => void;
  onDelete?: (id: string) => void;
  portal?: boolean;
}) {
  const [showReply, setShowReply] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isAgent = comment.actor_type === "agent";
  const isSystem = comment.actor_type === "system";
  const isHuman = comment.actor_type === "human";
  const actorName =
    isAgent && comment.actor_agent
      ? comment.actor_agent.name
      : isSystem
        ? "System"
        : "You";

  const metaAttachments = (comment.meta?.attachments ?? []) as CommentAttachmentRef[];

  return (
    <div className="group/comment space-y-1">
      <div className="flex gap-2">
        <div className="shrink-0 mt-0.5">
          <ActorAvatar comment={comment} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs">
            <span className={`font-medium ${isAgent ? "text-purple-400" : ""}`}>
              {actorName}
            </span>
            <span className="text-muted-foreground">
              {format(new Date(comment.created_at), "MMM d, h:mm a")}
            </span>
            {isEdited(comment) && (
              <span className="text-[10px] text-muted-foreground/50">(edited)</span>
            )}

            {/* Action menu — human comments only */}
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
                      <DropdownMenuItem
                        onClick={() => setEditing(true)}
                        className="gap-2 text-xs"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <DropdownMenuItem
                        onClick={() => setConfirmDelete(true)}
                        className="gap-2 text-xs text-red-400 focus:text-red-400"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
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
                onSubmit={(newBody) => {
                  onEdit?.(comment.id, newBody);
                  setEditing(false);
                }}
                onCancel={() => setEditing(false)}
                submitLabel="Save"
                portal={portal}
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
              className="text-[11px] text-muted-foreground hover:text-foreground mt-0.5"
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
            onSubmit={(body) => {
              onReply(body, comment.id);
              setShowReply(false);
            }}
            portal={portal}
          />
        </div>
      )}

      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-8 space-y-1.5 border-l border-border/50 pl-3">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              portal={portal}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this comment?"
        description="This removes the comment from the thread. Any replies will remain."
        confirmLabel="Delete"
        onConfirm={async () => {
          onDelete?.(comment.id);
          setConfirmDelete(false);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

export function CommentThread({
  comments,
  loading,
  onAddComment,
  onEditComment,
  onDeleteComment,
  portal,
}: CommentThreadProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Comments</span>
        </div>
        <div className="text-xs text-muted-foreground animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          Comments
          {comments.length > 0 && (
            <span className="ml-1 text-muted-foreground/50">({comments.length})</span>
          )}
        </span>
      </div>

      {comments.length > 0 && (
        <div className="space-y-2.5">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onReply={onAddComment}
              onEdit={onEditComment}
              onDelete={onDeleteComment}
              portal={portal}
            />
          ))}
        </div>
      )}

      <CommentForm
        onSubmit={(body) => onAddComment(body)}
        placeholder={comments.length === 0 ? "Add a comment to start a conversation..." : "Add a comment..."}
        enableAttachments
        portal={portal}
      />
    </div>
  );
}
