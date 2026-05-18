"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { StaggeredEntrance } from "./staggered-entrance";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[''']s\b/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export interface StepWelcomeProps {
  initialName?: string;
  subtitle?: string;
  onSubmit: (data: {
    ownerName: string;
    preferredName: string;
    workspaceName: string;
    workspaceSlug: string;
  }) => void;
  pending: boolean;
}

export function StepWelcome({ initialName, onSubmit, pending }: StepWelcomeProps) {
  const [name, setName] = useState(initialName ?? "");
  const [workspaceName, setWorkspaceName] = useState("");
  const [editingWorkspace, setEditingWorkspace] = useState(false);
  const workspaceInputRef = useRef<HTMLInputElement>(null);

  const firstName = name.trim().split(" ")[0] || "";
  const autoWorkspace = firstName ? `${firstName}'s HQ` : "";
  const displayedWorkspace = workspaceName || autoWorkspace;

  const valid = name.trim().length > 0;

  useEffect(() => {
    if (editingWorkspace && workspaceInputRef.current) {
      workspaceInputRef.current.focus();
      workspaceInputRef.current.select();
    }
  }, [editingWorkspace]);

  const submit = () => {
    if (!valid || pending) return;
    onSubmit({
      ownerName: name.trim(),
      preferredName: firstName,
      workspaceName: displayedWorkspace,
      workspaceSlug: slugify(displayedWorkspace),
    });
  };

  return (
    <div className="space-y-6">
      <StaggeredEntrance index={0}>
        <div className="space-y-2">
          <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
            What&apos;s your name?
          </h1>
          <p className="text-[14px] text-muted-foreground">
            We&apos;ll use this to set up your workspace.
          </p>
        </div>
      </StaggeredEntrance>

      <StaggeredEntrance index={1}>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!editingWorkspace) setWorkspaceName("");
          }}
          placeholder="Your full name"
          autoFocus
          className="flex h-11 w-full rounded-lg border border-border/60 bg-background px-3.5 text-[15px] outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
      </StaggeredEntrance>

      {firstName && (
        <StaggeredEntrance index={2}>
          <div className="space-y-1.5">
            <span className="text-[12px] font-medium text-muted-foreground/70">
              Workspace
            </span>
            {editingWorkspace ? (
              <input
                ref={workspaceInputRef}
                type="text"
                value={workspaceName || autoWorkspace}
                onChange={(e) => setWorkspaceName(e.target.value)}
                onBlur={() => {
                  if (!workspaceName.trim()) setWorkspaceName("");
                  setEditingWorkspace(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setEditingWorkspace(false);
                    submit();
                  }
                  if (e.key === "Escape") {
                    setWorkspaceName("");
                    setEditingWorkspace(false);
                  }
                }}
                className="flex h-9 w-full max-w-[240px] rounded-md border border-border/60 bg-background px-2.5 text-[14px] font-medium outline-none transition-colors focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingWorkspace(true)}
                className="group flex items-center gap-1.5 text-[14px] font-medium text-foreground transition-colors"
              >
                <span>{displayedWorkspace}</span>
                <span className="text-[11px] text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors">
                  edit
                </span>
              </button>
            )}
          </div>
        </StaggeredEntrance>
      )}

      <StaggeredEntrance index={3}>
        <div className="pt-1">
          <button
            type="button"
            onClick={submit}
            disabled={!valid || pending}
            className={cn(
              "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2",
              !valid || pending
                ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                : "bg-foreground text-background hover:bg-foreground/90 active:scale-[0.97]",
            )}
          >
            {pending ? "Setting up…" : "Continue"}
            {!pending && (
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            )}
          </button>
        </div>
      </StaggeredEntrance>
    </div>
  );
}
