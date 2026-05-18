"use client";

import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";

interface MentionBadgeProps {
  mention: string;
  className?: string;
}

export function MentionBadge({ mention, className }: MentionBadgeProps) {
  const isMe = mention === "@me";
  const label = isMe ? "You" : mention.replace("@", "");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1 py-px text-[10px] font-medium",
        isMe
          ? "bg-accent-blue/15 text-accent-blue"
          : "bg-accent-purple/15 text-accent-purple",
        className
      )}
    >
      {isMe ? <User className="h-2 w-2" /> : <Bot className="h-2 w-2" />}
      {label}
    </span>
  );
}

/** Render body text with @mentions replaced by MentionBadge components */
export function renderMentions(text: string) {
  const parts = text.split(/(@[\w-]+)/g);
  return parts.map((part, i) => {
    if (part.match(/^@[\w-]+$/)) {
      return <MentionBadge key={i} mention={part} />;
    }
    return <span key={i}>{part}</span>;
  });
}
