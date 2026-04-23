"use client";

import { useEffect, useState } from "react";
import { Plus, Check, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddProjectDialog } from "./add-project-dialog";
import { cn } from "@/lib/utils";

export interface SwitcherProject {
  id: string;
  label: string;
  emoji: string;
}

interface Props {
  activeProjectId: string | null;
  projects: SwitcherProject[];
  showLabels?: boolean;
}

async function switchProject(projectId: string) {
  const res = await fetch("/api/projects/switch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
  if (!res.ok) {
    alert(`Could not switch project: ${res.status}`);
    return;
  }
  // Hard reload — tears down any open Realtime subscriptions pointed
  // at the old project cleanly.
  window.location.reload();
}

export function ProjectSwitcher({
  activeProjectId,
  projects,
  showLabels = true,
}: Props) {
  const [addOpen, setAddOpen] = useState(false);

  const active =
    projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null;

  // When there are 0 or 1 projects, render as a plain label (no dropdown).
  // Users can still add a project from Settings → Projects; the switcher
  // itself only earns its keep when there's something to switch between.
  if (!active) {
    return (
      <div className="flex h-12 shrink-0 items-center gap-2 px-3">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-foreground/95 to-foreground/80 text-background text-xs">
          🏠
        </div>
        {showLabels && (
          <span className="truncate text-[13px] font-semibold tracking-tight text-foreground">
            HQ
          </span>
        )}
      </div>
    );
  }

  if (projects.length <= 1) {
    return (
      <div className="flex h-12 shrink-0 items-center gap-2 px-3">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs">
          {active.emoji}
        </div>
        {showLabels && (
          <span className="truncate text-[13px] font-semibold tracking-tight text-foreground">
            {active.label}
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="px-2 py-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left",
                "hover:bg-accent transition-colors",
              )}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[13px]">
                {active.emoji}
              </span>
              {showLabels && (
                <>
                  <span className="flex-1 truncate text-[13px] font-medium">
                    {active.label}
                  </span>
                  <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-56"
            align="start"
            sideOffset={4}
          >
            {projects.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onSelect={() => {
                  if (p.id !== activeProjectId) switchProject(p.id);
                }}
                className="gap-2"
              >
                <span className="flex h-5 w-5 items-center justify-center text-[14px]">
                  {p.emoji}
                </span>
                <span className="flex-1 truncate">{p.label}</span>
                {p.id === activeProjectId && (
                  <Check className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => setAddOpen(true)}
              className="gap-2"
            >
              <Plus className="h-3.5 w-3.5" />
              Add project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <AddProjectDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}
