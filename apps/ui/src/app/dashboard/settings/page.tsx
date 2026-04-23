"use client";

import Link from "next/link";
import {
  Sliders,
  Layers,
  LayoutGrid,
  Server,
  FolderKanban,
  ChevronRight,
  Globe,
  Settings as SettingsIcon,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";

const SECTIONS = [
  {
    href: "/dashboard/settings/general",
    icon: Sliders,
    title: "General",
    description: "Workspace name and basic preferences.",
  },
  {
    href: "/dashboard/settings/projects",
    icon: FolderKanban,
    title: "Projects",
    description: "Connect, edit, and switch between Supabase projects.",
  },
  {
    href: "/dashboard/settings/pipeline",
    icon: Layers,
    title: "Pipeline stages",
    description: "Configure stages for contacts and organizations.",
  },
  {
    href: "/dashboard/settings/fields",
    icon: LayoutGrid,
    title: "Custom fields",
    description: "Define fields that appear on records.",
  },
  {
    href: "/dashboard/settings/networking",
    icon: Globe,
    title: "Networking",
    description: "Tailscale + how you reach HQ from other devices.",
  },
  {
    href: "/dashboard/settings/system",
    icon: Server,
    title: "System",
    description: "Gateway controls and command history.",
  },
];

export default function SettingsPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<SettingsIcon className="h-4 w-4" />}
        title="Settings"
        description="Configure your workspace."
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-2xl p-5">
          <div className="space-y-1.5">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  className="group flex items-center gap-3 rounded-md border border-border/60 bg-card px-4 py-3.5 transition-colors hover:border-border-strong hover:bg-accent/60"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-foreground">
                      {s.title}
                    </div>
                    <div className="truncate text-[12px] text-muted-foreground">
                      {s.description}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
