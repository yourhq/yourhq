"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  BookOpen,
  Activity,
  Bot,
  Zap,
  Bell,
  Settings,
  Plus,
  UserPlus,
  Upload,
  Database,
} from "lucide-react";
import { useModules } from "@/components/shared/modules-context";
import { useSidebarCollections } from "@/hooks/use-sidebar-collections";

interface PaletteItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  crmOnly?: boolean;
}

const NAV_ITEMS: PaletteItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Contacts", href: "/dashboard/crm", icon: Users, crmOnly: true },
  { label: "Organizations", href: "/dashboard/organizations", icon: Building2, crmOnly: true },
  { label: "Tasks", href: "/dashboard/tasks", icon: CheckSquare },
  { label: "Agents", href: "/dashboard/agents", icon: Bot },
  { label: "Knowledge", href: "/dashboard/knowledge", icon: BookOpen },
  { label: "Collections", href: "/dashboard/collections", icon: Database },
  { label: "Routines", href: "/dashboard/routines", icon: Zap },
  { label: "Activity", href: "/dashboard/activity", icon: Activity },
  { label: "Notifications", href: "/dashboard/notifications", icon: Bell },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

const QUICK_ACTIONS: PaletteItem[] = [
  { label: "Create Task", href: "/dashboard/tasks?action=create", icon: Plus },
  { label: "Add Contact", href: "/dashboard/crm?action=create", icon: UserPlus, crmOnly: true },
  { label: "Create Organization", href: "/dashboard/organizations?action=create", icon: Building2, crmOnly: true },
  { label: "Create Knowledge", href: "/dashboard/knowledge", icon: Upload },
  { label: "Register Agent", href: "/dashboard/agents?action=create", icon: Bot },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const modules = useModules();
  const crmEnabled = modules.crm !== false;
  const { collections } = useSidebarCollections();

  const navItems = useMemo(
    () => NAV_ITEMS.filter((i) => !i.crmOnly || crmEnabled),
    [crmEnabled],
  );
  const quickActions = useMemo(
    () => QUICK_ACTIONS.filter((i) => !i.crmOnly || crmEnabled),
    [crmEnabled],
  );

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
          {navItems.map((item) => (
            <CommandItem
              key={item.href}
              onSelect={() => navigate(item.href)}
            >
              <item.icon className="mr-2 h-4 w-4" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {collections.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Collections">
              {collections.map((col) => (
                <CommandItem
                  key={col.slug}
                  onSelect={() => navigate(`/dashboard/collections/${col.slug}`)}
                >
                  <span className="mr-2 flex h-4 w-4 items-center justify-center text-[11px]">
                    {col.icon ?? <Database className="h-4 w-4" />}
                  </span>
                  <span>{col.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />

        <CommandGroup heading="Quick Actions">
          {quickActions.map((item) => (
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
