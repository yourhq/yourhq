"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Check, ChevronsUpDown, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
    console.error("Project switch failed", await res.text());
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

  // Empty registry: plain "HQ" lockup (user is mid-onboarding if anywhere).
  if (!active) {
    return (
      <div className="flex h-12 shrink-0 items-center gap-2 px-3">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-foreground/95 to-foreground/80 text-background text-[12px]">
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

  // Single-project: static label. The emoji stands in for the HQ gradient
  // logo so users with one workspace still get a recognizable identity.
  if (projects.length <= 1) {
    return (
      <div className="flex h-12 shrink-0 items-center gap-2 px-3">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[13px]">
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

  // Multi-project: dropdown switcher.
  return (
    <>
      <div className="h-12 shrink-0 px-2 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left",
                "hover:bg-accent transition-colors outline-none focus-visible:ring-1 focus-visible:ring-border",
              )}
              aria-label={`Switch project — currently ${active.label}`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[13px]">
                {active.emoji}
              </span>
              {showLabels && (
                <>
                  <span className="flex-1 truncate text-[13px] font-semibold tracking-tight text-foreground">
                    {active.label}
                  </span>
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-60"
            align="start"
            sideOffset={6}
          >
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
              Projects
            </DropdownMenuLabel>
            {projects.map((p) => {
              const isActive = p.id === activeProjectId;
              return (
                <DropdownMenuItem
                  key={p.id}
                  onSelect={() => {
                    if (!isActive) switchProject(p.id);
                  }}
                  className="gap-2"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[14px]">
                    {p.emoji}
                  </span>
                  <span className="flex-1 truncate">{p.label}</span>
                  {isActive && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setAddOpen(true)} className="gap-2">
              <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              Add project
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings/projects" className="gap-2">
                <Settings className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                Manage projects
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <AddProjectDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => {
          // Dashboard layout caches the project list as a prop, so a plain
          // router.refresh() doesn't show the new project in the switcher
          // until navigation. A hard reload is the simplest reliable fix.
          window.location.reload();
        }}
      />
    </>
  );
}
