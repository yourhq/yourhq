"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Blocks,
  Sliders,
  User,
  Puzzle,
  Palette,
  Layers,
  LayoutGrid,
  Plug,
  Lock,
  Server,
  Globe,
  Database,
  BookOpen,
  Zap,
  ScrollText,
  DollarSign,
  Settings,
  Tag,
  LayoutTemplate,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useModules } from "@/components/shared/modules-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  label: string;
  items: NavItem[];
  ossOnly?: boolean;
  crmOnly?: boolean;
}

const SETTINGS_NAV: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard/settings/general", label: "General", icon: Sliders },
      { href: "/dashboard/settings/profile", label: "Profile", icon: User },
      { href: "/dashboard/settings/modules", label: "Modules", icon: Puzzle },
      { href: "/dashboard/settings/appearance", label: "Appearance", icon: Palette },
    ],
  },
  {
    label: "Tasks",
    items: [
      { href: "/dashboard/settings/labels", label: "Labels", icon: Tag },
      { href: "/dashboard/settings/templates", label: "Templates", icon: LayoutTemplate },
    ],
  },
  {
    label: "CRM",
    crmOnly: true,
    items: [
      { href: "/dashboard/settings/pipeline", label: "Pipeline", icon: Layers },
      { href: "/dashboard/settings/fields", label: "Custom Fields", icon: LayoutGrid },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { href: "/dashboard/settings/sources", label: "Sources", icon: BookOpen },
    ],
  },
  {
    label: "Agents",
    items: [
      { href: "/dashboard/settings/connections", label: "Connections", icon: Plug },
      { href: "/dashboard/settings/secrets", label: "Secrets", icon: Lock },
      { href: "/dashboard/settings/budgets", label: "Budget Defaults", icon: DollarSign },
      { href: "/dashboard/settings/plugins", label: "Plugins", icon: Blocks },
    ],
  },
  {
    label: "Infrastructure",
    ossOnly: true,
    items: [
      { href: "/dashboard/settings/gateways", label: "Gateways", icon: Server },
      { href: "/dashboard/settings/networking", label: "Networking", icon: Globe },
      { href: "/dashboard/settings/database", label: "Database", icon: Database },
    ],
  },
  {
    label: "System",
    ossOnly: true,
    items: [
      { href: "/dashboard/settings/actions", label: "Actions", icon: Zap },
      { href: "/dashboard/settings/logs", label: "Logs", icon: ScrollText },
    ],
  },
];

export function SettingsShell({
  isHosted,
  children,
}: {
  isHosted: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const mobile = useIsMobile();
  const modules = useModules();
  const crmEnabled = modules.crm !== false;

  const visibleGroups = SETTINGS_NAV.filter((group) => {
    if (group.ossOnly && isHosted) return false;
    if (group.crmOnly && !crmEnabled) return false;
    return true;
  });

  const allItems = visibleGroups.flatMap((g) => g.items);
  const currentItem = allItems.find(
    (item) =>
      pathname === item.href ||
      (item.href !== "/dashboard/settings" && pathname.startsWith(item.href + "/")),
  );

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Mobile settings navigation */}
      {mobile && (
        <div className="border-b border-border/60 px-4 py-2">
          <Select
            value={currentItem?.href ?? pathname}
            onValueChange={(href) => router.push(href)}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Settings" />
            </SelectTrigger>
            <SelectContent>
              {visibleGroups.map((group) => (
                <div key={group.label}>
                  <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    {group.label}
                  </div>
                  {group.items.map((item) => (
                    <SelectItem key={item.href} value={item.href}>
                      {item.label}
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Desktop settings sidebar */}
      <nav className="hidden md:flex w-[220px] shrink-0 flex-col border-r border-border/60 overflow-y-auto py-3">
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-[13px] font-semibold text-foreground">Settings</h2>
          </div>
        </div>
        <div className="space-y-4 px-2">
          {visibleGroups.map((group) => (
            <div key={group.label}>
              <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard/settings" && pathname.startsWith(item.href + "/"));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                        isActive
                          ? "bg-accent text-foreground font-medium"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* Settings content */}
      <div className="flex-1 min-w-0 overflow-hidden">{children}</div>
    </div>
  );
}
