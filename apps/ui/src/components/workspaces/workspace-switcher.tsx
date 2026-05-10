"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Check, ChevronsUpDown, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AddWorkspaceDialog } from "./add-workspace-dialog";
import { cn } from "@/lib/utils";


export interface SwitcherWorkspace {
  id: string;
  label: string;
  emoji: string;
}

interface Props {
  activeWorkspaceId: string | null;
  workspaces: SwitcherWorkspace[];
  showLabels?: boolean;
  isHosted?: boolean;
}

async function switchWorkspace(workspaceId: string) {
  const res = await fetch("/api/workspaces/switch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspaceId }),
  });
  if (!res.ok) {
    console.error("Workspace switch failed", await res.text());
    return;
  }
  window.location.reload();
}

export function WorkspaceSwitcher({
  activeWorkspaceId,
  workspaces,
  showLabels = true,
  isHosted = false,
}: Props) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const active =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null;

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

  if (workspaces.length <= 1) {
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
              aria-label={`Switch workspace — currently ${active.label}`}
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
              Workspaces
            </DropdownMenuLabel>
            {workspaces.map((w) => {
              const isActive = w.id === activeWorkspaceId;
              return (
                <DropdownMenuItem
                  key={w.id}
                  onSelect={() => {
                    if (!isActive) switchWorkspace(w.id);
                  }}
                  className="gap-2"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[14px]">
                    {w.emoji}
                  </span>
                  <span className="flex-1 truncate">{w.label}</span>
                  {isActive && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                if (isHosted) {
                  router.push("/new-workspace");
                } else {
                  setAddOpen(true);
                }
              }}
              className="gap-2"
            >
              <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              Add workspace
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings/database" className="gap-2">
                <Settings className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                Manage workspaces
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <AddWorkspaceDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => {
          window.location.reload();
        }}
      />
    </>
  );
}
