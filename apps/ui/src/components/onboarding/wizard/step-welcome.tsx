"use client";

import { useState } from "react";
import { ArrowRight, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { HqLogo } from "@/components/shared/hq-logo";
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
  const [editing, setEditing] = useState(false);

  const firstName = name.trim().split(" ")[0] || "";
  const autoWorkspace = firstName ? `${firstName}'s HQ` : "";
  const displayedWorkspace = workspaceName || autoWorkspace;

  const handleNameChange = (value: string) => {
    setName(value);
    if (!editing) setWorkspaceName("");
  };

  const valid = name.trim().length > 0;

  return (
    <div className="space-y-8">
      <StaggeredEntrance index={0}>
        <HqLogo size={40} className="text-foreground mb-2" />
      </StaggeredEntrance>

      <StaggeredEntrance index={1}>
        <div className="space-y-3">
          <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight">
            Welcome to HQ
          </h1>
          <p className="max-w-[44ch] text-[14px] leading-relaxed text-muted-foreground">
            Set up your workspace in a few steps. Takes about 10 minutes.
          </p>
        </div>
      </StaggeredEntrance>

      <StaggeredEntrance index={2}>
        <div className="space-y-2">
          <label
            htmlFor="owner-name"
            className="text-[13px] font-medium text-foreground"
          >
            What should we call you?
          </label>
          <input
            id="owner-name"
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Your name"
            autoFocus
            className="flex h-10 w-full rounded-lg border border-border/60 bg-background px-3 text-[14px] outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid && !pending) {
                onSubmit({
                  ownerName: name.trim(),
                  preferredName: firstName,
                  workspaceName: displayedWorkspace,
                  workspaceSlug: slugify(displayedWorkspace),
                });
              }
            }}
          />
        </div>
      </StaggeredEntrance>

      {firstName && (
        <StaggeredEntrance index={3}>
          <div className="space-y-1.5">
            <span className="text-[12px] text-muted-foreground">
              Your workspace
            </span>
            <div className="flex items-center gap-2">
              {editing ? (
                <input
                  type="text"
                  value={workspaceName || autoWorkspace}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  onBlur={() => {
                    if (!workspaceName.trim()) setWorkspaceName("");
                    setEditing(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setEditing(false);
                    if (e.key === "Escape") {
                      setWorkspaceName("");
                      setEditing(false);
                    }
                  }}
                  autoFocus
                  className="h-9 w-full max-w-xs rounded-lg border border-border/60 bg-background px-3 text-[14px] font-medium outline-none transition-colors focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
                />
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={displayedWorkspace}
                    readOnly
                    tabIndex={-1}
                    className="h-9 max-w-xs rounded-lg border border-border/40 bg-muted/30 px-3 text-[14px] font-medium text-foreground outline-none cursor-default"
                  />
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/40 text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
                    aria-label="Edit workspace name"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </StaggeredEntrance>
      )}

      <StaggeredEntrance index={4}>
        <div className="pt-2">
          <button
            type="button"
            onClick={() =>
              onSubmit({
                ownerName: name.trim(),
                preferredName: firstName,
                workspaceName: displayedWorkspace,
                workspaceSlug: slugify(displayedWorkspace),
              })
            }
            disabled={!valid || pending}
            className={cn(
              "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all",
              !valid || pending
                ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                : "bg-foreground text-background hover:bg-foreground/90",
            )}
          >
            {pending ? "Saving…" : "Continue"}
            {!pending && (
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            )}
          </button>
        </div>
      </StaggeredEntrance>
    </div>
  );
}
