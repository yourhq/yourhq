"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MentionAutocomplete, useMentionItems } from "./mention-autocomplete";
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
  /** Show @agent hint when user has typed content */
  showMentionHint?: boolean;
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
  compact: _compact,
  initialBody = "",
  initialAttachments,
  onCancel,
  submitLabel: _submitLabel,
  enableAttachments,
  portal = true,
  showMentionHint,
}: CommentFormProps) {
  const [body, setBody] = useState(initialBody);
  const [submitting, setSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<CommentAttachmentRef[]>(initialAttachments ?? []);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionStart, setMentionStart] = useState(-1);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionItems = useMentionItems(mentionFilter);

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
        setMentionIndex(0);
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
  const hasContent = body.trim().length > 0;

  return (
    <div className="space-y-1.5">
      {/* Unified input container */}
      <div className="rounded-lg bg-muted/30 transition-all focus-within:bg-muted/50">
        {/* Attachments pills */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 px-3 pt-2">
            {attachments.map((att, idx) => {
              const Icon = ATTACHMENT_ICONS[att.entity_type] ?? FileText;
              return (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-1.5 py-0.5 text-[11px] text-muted-foreground"
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

        {/* Textarea */}
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={body}
            onChange={handleChange}
            placeholder={placeholder}
            rows={1}
            className="min-h-0 border-0 bg-transparent dark:bg-transparent shadow-none text-xs resize-none focus-visible:ring-0 placeholder:text-muted-foreground/60"
            onKeyDown={(e) => {
              if (mentionOpen && mentionItems.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionIndex((i) => (i + 1) % mentionItems.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionIndex((i) => (i - 1 + mentionItems.length) % mentionItems.length);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  handleMentionSelect(mentionItems[mentionIndex].slug);
                  return;
                }
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
            activeIndex={mentionIndex}
          />
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between px-2 pb-1.5">
          <div className="flex items-center gap-0.5">
            {enableAttachments && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-muted-foreground/50 hover:text-foreground"
                onClick={() => {
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
            {!isEdit && hasContent && (
              <span className="text-[10px] text-muted-foreground/30 pl-1 select-none">
                {showMentionHint && <><kbd className="rounded bg-muted px-1 py-0.5 text-[9px] font-mono">@</kbd> to notify an agent · </>}
                {navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"}+Enter to send
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isEdit && (
              <>
                <span className="text-[10px] text-muted-foreground/40 mr-1">
                  {navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"}+Enter
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px] px-2"
                  onClick={onCancel}
                >
                  Cancel
                </Button>
              </>
            )}
            <Button
              variant={hasContent ? "default" : "ghost"}
              size="icon"
              className={hasContent
                ? "h-6 w-6 shrink-0"
                : "h-6 w-6 shrink-0 text-muted-foreground/40"
              }
              onClick={handleSubmit}
              disabled={submitting || !hasContent}
            >
              <Send className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
