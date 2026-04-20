"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MentionAutocomplete } from "./mention-autocomplete";
import type { CommentAttachmentRef } from "@/lib/tasks/types";
import { Send, Paperclip, X, FileText, Package, ExternalLink } from "lucide-react";

interface CommentFormProps {
  onSubmit: (body: string, attachments?: CommentAttachmentRef[]) => void;
  placeholder?: string;
  compact?: boolean;
  /** Pre-populate for edit mode */
  initialBody?: string;
  /** Initial attachments for edit mode */
  initialAttachments?: CommentAttachmentRef[];
  /** Show cancel button */
  onCancel?: () => void;
  /** Change submit button label */
  submitLabel?: string;
  /** Enable attachment support */
  enableAttachments?: boolean;
  /** Pass false when inside a Dialog */
  portal?: boolean;
}

/** Extract mention trigger info from cursor position */
function getMentionContext(text: string, cursorPos: number) {
  // Scan backwards from cursor to find @
  let i = cursorPos - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === "@") {
      // Check that @ is at start or preceded by whitespace
      if (i === 0 || /\s/.test(text[i - 1])) {
        const filter = text.slice(i + 1, cursorPos);
        // Only trigger if filter has no spaces
        if (!/\s/.test(filter)) {
          return { active: true, start: i, filter };
        }
      }
      break;
    }
    if (/\s/.test(ch)) break;
    i--;
  }
  return { active: false, start: -1, filter: "" };
}

const ATTACHMENT_ICONS: Record<string, typeof FileText> = {
  document: FileText,
  asset: Package,
  url: ExternalLink,
};

export function CommentForm({
  onSubmit,
  placeholder = "Add a comment... Use @ to mention agents",
  compact,
  initialBody = "",
  initialAttachments,
  onCancel,
  submitLabel,
  enableAttachments,
  portal = true,
}: CommentFormProps) {
  const [body, setBody] = useState(initialBody);
  const [submitting, setSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<CommentAttachmentRef[]>(initialAttachments ?? []);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionStart, setMentionStart] = useState(-1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      const cursor = e.target.selectionStart ?? val.length;
      setBody(val);

      const ctx = getMentionContext(val, cursor);
      if (ctx.active) {
        setMentionOpen(true);
        setMentionFilter(ctx.filter);
        setMentionStart(ctx.start);
      } else {
        setMentionOpen(false);
      }
    },
    []
  );

  const handleMentionSelect = useCallback(
    (slug: string) => {
      const before = body.slice(0, mentionStart);
      const after = body.slice(
        mentionStart + 1 + mentionFilter.length // +1 for the @
      );
      const newBody = `${before}@${slug} ${after}`;
      setBody(newBody);
      setMentionOpen(false);

      // Restore focus and cursor position
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const pos = before.length + slug.length + 2; // @slug + space
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(pos, pos);
        }
      });
    },
    [body, mentionStart, mentionFilter]
  );

  function handleSubmit() {
    if (!body.trim()) return;
    setSubmitting(true);
    onSubmit(body.trim(), attachments.length > 0 ? attachments : undefined);
    setBody("");
    setAttachments([]);
    setSubmitting(false);
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  const isEdit = !!onCancel;

  return (
    <div className="space-y-1.5">
      {/* Attachments pills */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {attachments.map((att, idx) => {
            const Icon = ATTACHMENT_ICONS[att.entity_type] ?? FileText;
            return (
              <span
                key={idx}
                className="inline-flex items-center gap-1 rounded bg-muted/50 px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                <Icon className="h-2.5 w-2.5" />
                <span className="max-w-[120px] truncate">{att.label}</span>
                <button
                  onClick={() => removeAttachment(idx)}
                  className="ml-0.5 rounded hover:bg-accent p-0.5"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Input row */}
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Textarea
            ref={textareaRef}
            value={body}
            onChange={handleChange}
            placeholder={placeholder}
            rows={compact ? 1 : 2}
            className="min-h-0 text-xs resize-none pr-2"
            onKeyDown={(e) => {
              if (mentionOpen) {
                // Let mention autocomplete handle arrow keys and enter
                if (e.key === "Escape") {
                  e.preventDefault();
                  setMentionOpen(false);
                  return;
                }
              }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <MentionAutocomplete
            open={mentionOpen}
            filter={mentionFilter}
            onSelect={handleMentionSelect}
            onClose={() => setMentionOpen(false)}
            anchorRef={textareaRef}
            portal={portal}
          />
        </div>

        <div className="flex flex-col gap-1 self-end">
          {enableAttachments && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                // Simple URL attachment for comments
                const url = window.prompt("Enter URL to attach:");
                if (url?.trim()) {
                  setAttachments((prev) => [
                    ...prev,
                    { entity_type: "url", url: url.trim(), label: url.trim() },
                  ]);
                }
              }}
            >
              <Paperclip className="h-3 w-3" />
            </Button>
          )}
          <Button
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={handleSubmit}
            disabled={submitting || !body.trim()}
          >
            <Send className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Edit mode actions */}
      {isEdit && (
        <div className="flex items-center justify-end gap-1.5">
          <span className="text-[10px] text-muted-foreground/50 mr-auto">
            {navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"}+Enter to {submitLabel ?? "save"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] px-2"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-6 text-[11px] px-2"
            onClick={handleSubmit}
            disabled={submitting || !body.trim()}
          >
            {submitLabel ?? "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}
