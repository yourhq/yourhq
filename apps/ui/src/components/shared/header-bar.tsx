"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, LogOut, PanelLeft, Search } from "lucide-react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUnreadNotificationCount } from "@/hooks/use-notifications";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/theme-toggle";

const MODULE_LABELS: Record<string, string> = {
  crm: "CRM",
  organizations: "Organizations",
  tasks: "Tasks",
  assets: "Assets",
  activity: "Activity",
  agents: "Agents",
  contacts: "Contacts",
  notifications: "Notifications",
  settings: "Settings",
  pipeline: "Pipeline stages",
  fields: "Custom fields",
  general: "General",
  documents: "Documents",
  automations: "Automations",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Map the URL segment before a UUID to a Supabase table + name column
const ENTITY_TABLE_MAP: Record<string, { table: string; column: string }> = {
  contacts: { table: "contacts", column: "name" },
  organizations: { table: "organizations", column: "name" },
  agents: { table: "agents", column: "name" },
  documents: { table: "documents", column: "title" },
  assets: { table: "assets", column: "name" },
};

/**
 * Resolve UUID breadcrumb segments to human-readable entity names.
 * Returns a map of UUID → display name.
 */
function useEntityNames(segments: string[]): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  const supabase = useMemo(() => createClient(), []);

  // Stable key derived from segments so the effect doesn't re-run on every render
  const segmentsKey = segments.join("/");

  useEffect(() => {
    // Find all (parentSegment, uuid) pairs
    const segs = segmentsKey.split("/");
    const lookups: { parent: string; id: string }[] = [];
    for (let i = 1; i < segs.length; i++) {
      if (UUID_RE.test(segs[i])) {
        lookups.push({ parent: segs[i - 1], id: segs[i] });
      }
    }

    if (lookups.length === 0) {
      // Defer so we don't cascade-render synchronously inside the effect.
      const t = setTimeout(() => setNames({}), 0);
      return () => clearTimeout(t);
    }

    let cancelled = false;

    async function resolve() {
      const resolved: Record<string, string> = {};
      await Promise.all(
        lookups.map(async ({ parent, id }) => {
          const mapping = ENTITY_TABLE_MAP[parent];
          if (!mapping) return;
          const { data } = await supabase
            .from(mapping.table)
            .select(mapping.column)
            .eq("id", id)
            .single();
          if (data && !cancelled) {
            resolved[id] = (data as unknown as Record<string, string>)[mapping.column];
          }
        })
      );
      if (!cancelled) setNames(resolved);
    }

    resolve();
    return () => { cancelled = true; };
  }, [segmentsKey, supabase]);

  return names;
}

interface HeaderBarProps {
  onToggleSidebar?: () => void;
  actions?: React.ReactNode;
  user?: User;
  onSignOut?: () => void;
  onOpenCommandPalette?: () => void;
}

export function HeaderBar({
  onToggleSidebar,
  actions,
  user,
  onSignOut,
  onOpenCommandPalette,
}: HeaderBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { count: unreadCount } = useUnreadNotificationCount();

  const segments = pathname.split("/").filter(Boolean);
  const entityNames = useEntityNames(segments);

  const crumbs = segments.slice(1).map((seg, i) => ({
    label: MODULE_LABELS[seg] ?? entityNames[seg] ?? (UUID_RE.test(seg) ? "…" : decodeURIComponent(seg)),
    href: "/" + segments.slice(0, i + 2).join("/"),
  }));

  const handleCommandPalette = () => {
    if (onOpenCommandPalette) {
      onOpenCommandPalette();
      return;
    }
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true })
    );
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-3">
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground"
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
      >
        <PanelLeft className="h-4 w-4" />
      </Button>

      {crumbs.length > 0 && (
        <Breadcrumb>
          <BreadcrumbList className="text-body">
            {crumbs.map((crumb, i) => {
              const isLast = i === crumbs.length - 1;
              return (
                <Fragment key={crumb.href}>
                  {i > 0 && <BreadcrumbSeparator className="text-border" />}
                  <BreadcrumbItem>
                    {isLast ? (
                      <BreadcrumbPage className="text-foreground">
                        {crumb.label}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link
                          href={crumb.href}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {crumb.label}
                        </Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {actions}

        <button
          type="button"
          onClick={handleCommandPalette}
          className="hidden h-8 items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 text-body text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:inline-flex"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search</span>
          <Kbd className="text-[10px]">⌘K</Kbd>
        </button>

        <Link href="/dashboard/notifications" aria-label="Notifications">
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative text-muted-foreground hover:text-foreground"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-1.5 w-1.5 items-center justify-center rounded-full bg-primary" />
            )}
          </Button>
        </Link>

        <ThemeToggle />

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Account menu"
              >
                {user.email?.charAt(0).toUpperCase()}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                {user.email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push("/dashboard/settings")}>
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleCommandPalette}>
                Command palette
                <Kbd className="ml-auto text-[10px]">⌘K</Kbd>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {onSignOut && (
                <DropdownMenuItem
                  onSelect={onSignOut}
                  className="text-muted-foreground"
                >
                  <LogOut className="mr-2 h-3.5 w-3.5" />
                  Sign out
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
