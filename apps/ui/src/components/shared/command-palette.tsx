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
  Bell,
  Settings,
  Plus,
  UserPlus,
  Upload,
  Database,
  FileText,
  Clock,
  Repeat,
  Search,
} from "lucide-react";
import { useModules } from "@/components/shared/modules-context";
import { useSidebarCollections } from "@/hooks/use-sidebar-collections";
import {
  useUniversalSearch,
  type SearchResult,
  type SearchResultType,
} from "@/hooks/use-universal-search";
import {
  getRecentItems,
  addRecentItem,
  type RecentItem,
} from "@/lib/search/recent-items";

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
  { label: "Routines", href: "/dashboard/routines", icon: Repeat },
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

const TYPE_ICONS: Record<SearchResultType, React.ComponentType<{ className?: string }>> = {
  knowledge: BookOpen,
  knowledge_chunk: FileText,
  task: CheckSquare,
  contact: Users,
  collection_record: Database,
  agent: Bot,
  routine: Repeat,
};

const TYPE_COLORS: Record<SearchResultType, string> = {
  knowledge: "text-accent-blue",
  knowledge_chunk: "text-accent-blue",
  task: "text-accent-amber",
  contact: "text-accent-emerald",
  collection_record: "text-accent-violet",
  agent: "text-accent-orange",
  routine: "text-accent-cyan",
};

const RECENT_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  knowledge: BookOpen,
  task: CheckSquare,
  contact: Users,
  collection: Database,
  collection_record: Database,
  agent: Bot,
  routine: Repeat,
};

function ResultIcon({ type, icon, color }: { type: SearchResultType; icon?: string; color?: string }) {
  if (icon) {
    return (
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs"
        style={color ? { color } : undefined}
      >
        {icon}
      </span>
    );
  }
  const Icon = TYPE_ICONS[type];
  return <Icon className={`h-4 w-4 shrink-0 ${TYPE_COLORS[type]}`} />;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const modules = useModules();
  const crmEnabled = modules.crm !== false;
  const { collections } = useSidebarCollections();
  const { groups, totalResults, searching } = useUniversalSearch(query, open);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);

  const hasQuery = query.trim().length > 0;

  const navItems = useMemo(
    () => NAV_ITEMS.filter((i) => !i.crmOnly || crmEnabled),
    [crmEnabled],
  );
  const quickActions = useMemo(
    () => QUICK_ACTIONS.filter((i) => !i.crmOnly || crmEnabled),
    [crmEnabled],
  );

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (next) {
      setRecentItems(getRecentItems());
    } else {
      setQuery("");
    }
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [handleOpenChange, open]);

  const navigate = useCallback(
    (href: string, item?: { id: string; type: string; title: string; subtitle?: string; icon?: string; color?: string }) => {
      if (item) {
        addRecentItem({
          id: item.id,
          type: item.type as RecentItem["type"],
          title: item.title,
          subtitle: item.subtitle,
          href,
          icon: item.icon,
          color: item.color,
        });
      }
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const selectResult = useCallback(
    (result: SearchResult) => {
      navigate(result.href, {
        id: result.id,
        type: result.type,
        title: result.title,
        subtitle: result.subtitle,
        icon: result.icon,
        color: result.color,
      });
    },
    [navigate],
  );

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange} showCloseButton={false}>
      <CommandInput
        placeholder="Search everything..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[420px]">
        {hasQuery ? (
          <>
            {/* Search results */}
            {groups.map((group) => (
              <CommandGroup key={group.type} heading={group.label}>
                {group.loading ? (
                  <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                    <Search className="h-4 w-4 animate-pulse" />
                    <span>Searching...</span>
                  </div>
                ) : (
                  group.results.map((result) => (
                    <CommandItem
                      key={`${result.type}-${result.id}`}
                      value={`${result.type}:${result.id}:${result.title}`}
                      onSelect={() => selectResult(result)}
                    >
                      <ResultIcon type={result.type} icon={result.icon} color={result.color} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{result.title}</span>
                        {result.snippet && (
                          <span className="truncate text-xs text-muted-foreground">
                            {result.snippet}
                          </span>
                        )}
                      </div>
                      {result.subtitle && (
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {result.subtitle}
                        </span>
                      )}
                    </CommandItem>
                  ))
                )}
              </CommandGroup>
            ))}

            {/* Filtered navigation as fallback */}
            <CommandSeparator />
            <CommandGroup heading="Pages">
              {navItems.map((item) => (
                <CommandItem
                  key={item.href}
                  value={`nav:${item.label}`}
                  onSelect={() => navigate(item.href)}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            {!searching && totalResults === 0 && (
              <CommandEmpty>No results found.</CommandEmpty>
            )}
          </>
        ) : (
          <>
            {/* Recent items when no query */}
            {recentItems.length > 0 && (
              <CommandGroup heading="Recent">
                {recentItems.map((item) => {
                  const Icon = RECENT_TYPE_ICONS[item.type] ?? FileText;
                  return (
                    <CommandItem
                      key={item.id}
                      value={`recent:${item.id}:${item.title}`}
                      onSelect={() => navigate(item.href, item)}
                    >
                      {item.icon ? (
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center text-xs"
                          style={item.color ? { color: item.color } : undefined}
                        >
                          {item.icon}
                        </span>
                      ) : (
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="truncate">{item.title}</span>
                      {item.subtitle && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          {item.subtitle}
                        </span>
                      )}
                      <Clock className="ml-1 h-3 w-3 text-muted-foreground/50" />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {recentItems.length > 0 && <CommandSeparator />}

            {/* Navigation */}
            <CommandGroup heading="Navigation">
              {navItems.map((item) => (
                <CommandItem
                  key={item.href}
                  onSelect={() => navigate(item.href)}
                >
                  <item.icon className="h-4 w-4" />
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
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
