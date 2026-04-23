"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Users,
  Building2,
  CheckSquare,
  FolderOpen,
  Activity,
  Bot,
  Bell,
  Settings,
  Plus,
  Upload,
  UserPlus,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "CRM", href: "/dashboard/crm", icon: Users },
  { label: "Organizations", href: "/dashboard/organizations", icon: Building2 },
  { label: "Tasks", href: "/dashboard/tasks", icon: CheckSquare },
  { label: "Assets", href: "/dashboard/assets", icon: FolderOpen },
  { label: "Activity", href: "/dashboard/activity", icon: Activity },
  { label: "Agents", href: "/dashboard/agents", icon: Bot },
  { label: "Notifications", href: "/dashboard/notifications", icon: Bell },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

const QUICK_ACTIONS = [
  { label: "Create Task", href: "/dashboard/tasks?action=create", icon: Plus },
  { label: "Add Contact", href: "/dashboard/crm?action=create", icon: UserPlus },
  { label: "Create Organization", href: "/dashboard/organizations?action=create", icon: Building2 },
  { label: "Upload Asset", href: "/dashboard/assets?action=upload", icon: Upload },
  { label: "Register Agent", href: "/dashboard/agents?action=create", icon: Bot },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {NAV_ITEMS.map((item) => (
            <CommandItem
              key={item.href}
              onSelect={() => navigate(item.href)}
            >
              <item.icon className="mr-2 h-4 w-4" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Quick Actions">
          {QUICK_ACTIONS.map((item) => (
            <CommandItem
              key={item.href}
              onSelect={() => navigate(item.href)}
            >
              <item.icon className="mr-2 h-4 w-4" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
