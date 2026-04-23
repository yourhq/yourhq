"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import {
  LayoutDashboard,
  Users,
  Building2,
  CheckSquare,
  FolderOpen,
  FileText,
  Activity,
  Bot,
  Zap,
  Bell,
  Settings,
  Sparkles,
  Search,
  Keyboard,
} from "lucide-react";
import { useUnreadNotificationCount } from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { HeaderBar } from "@/components/shared/header-bar";
import { CommandPalette } from "@/components/shared/command-palette";
import { KeyboardShortcutsProvider, useShortcuts } from "@/components/shared/keyboard-shortcuts";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { ProjectSwitcher } from "@/components/projects/project-switcher";
import * as React from "react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "CRM",
    items: [
      { href: "/dashboard/crm", label: "Contacts", icon: Users },
      { href: "/dashboard/organizations", label: "Organizations", icon: Building2 },
    ],
  },
  {
    label: "Work",
    items: [
      { href: "/dashboard/tasks", label: "Tasks", icon: CheckSquare },
      { href: "/dashboard/agents", label: "Agents", icon: Bot },
      { href: "/dashboard/automations", label: "Automations", icon: Zap },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { href: "/dashboard/documents", label: "Documents", icon: FileText },
      { href: "/dashboard/assets", label: "Assets", icon: FolderOpen },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/dashboard/activity", label: "Activity", icon: Activity },
      { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
];

const SidebarContext = React.createContext<{
  collapsed: boolean;
  toggle: () => void;
}>({ collapsed: false, toggle: () => {} });

export function useSidebarState() {
  return React.useContext(SidebarContext);
}

function SidebarInner({
  showLabels,
  pathname,
  onLinkClick,
  activeProjectId,
  projects,
}: {
  showLabels: boolean;
  pathname: string;
  onLinkClick?: () => void;
  activeProjectId: string | null;
  projects: SwitcherProject[];
}) {
  const { count: unreadCount } = useUnreadNotificationCount();
  const { showHelp } = useShortcuts();

  const isItemActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  const openCommandPalette = () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true })
    );
  };

  return (
    <>
      {/* Project switcher (renders as a plain label when ≤1 project) */}
      <ProjectSwitcher
        activeProjectId={activeProjectId}
        projects={projects}
        showLabels={showLabels}
      />

      {/* Search hint — top of sidebar, Linear-style */}
      {showLabels && (
        <button
          type="button"
          onClick={openCommandPalette}
          className="mx-2 mb-2 flex h-8 items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 text-[12px] text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Search</span>
          <Kbd className="text-[10px]">⌘K</Kbd>
        </button>
      )}

      {/* Nav */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-1">
        {navGroups.map((group, groupIdx) => (
          <div key={group.label} className={cn(groupIdx === 0 && "mt-1")}>
            {showLabels && (
              <div className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                {group.label}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = isItemActive(item.href);
                const showBadge =
                  item.href === "/dashboard/notifications" && unreadCount > 0;

                const linkContent = (
                  <Link
                    href={item.href}
                    onClick={onLinkClick}
                    className={cn(
                      "group relative flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors",
                      isActive
                        ? "bg-accent text-foreground font-medium"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                    )}
                  >
                    {/* Active accent bar */}
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-foreground" />
                    )}
                    <div className="relative shrink-0">
                      <item.icon
                        className={cn(
                          "h-4 w-4",
                          isActive
                            ? "text-foreground"
                            : "text-muted-foreground group-hover:text-foreground"
                        )}
                      />
                      {showBadge && !showLabels && (
                        <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-primary" />
                      )}
                    </div>
                    {showLabels && <span className="flex-1">{item.label}</span>}
                    {showBadge && showLabels && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </Link>
                );

                if (!showLabels) {
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                      <TooltipContent side="right" className="text-xs">
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                return <div key={item.href}>{linkContent}</div>;
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Sidebar footer — keyboard shortcuts hint */}
      <div className="shrink-0 border-t border-border/60 px-2 py-2">
        {showLabels ? (
          <button
            type="button"
            onClick={showHelp}
            className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
          >
            <Keyboard className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">Shortcuts</span>
            <Kbd className="text-[10px]">?</Kbd>
          </button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={showHelp}
                className="flex h-8 w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              >
                <Keyboard className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              Keyboard shortcuts
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </>
  );
}

interface SwitcherProject {
  id: string;
  label: string;
  emoji: string;
}

export function DashboardShell({
  user,
  children,
  activeProjectId,
  projects,
}: {
  user: User;
  children: React.ReactNode;
  activeProjectId: string | null;
  projects: SwitcherProject[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const isMobile = useIsMobile();

  const toggle = React.useCallback(() => {
    if (isMobile) {
      setMobileOpen((o) => !o);
    } else {
      setCollapsed((c) => !c);
    }
  }, [isMobile]);

  // Close mobile drawer on navigation
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Keyboard shortcut: Cmd+B to toggle sidebar
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "b" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toggle]);

  const handleSignOut = React.useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }, [router]);

  const handleMobileClose = React.useCallback(() => {
    setMobileOpen(false);
  }, []);

  return (
    <SidebarContext.Provider value={{ collapsed, toggle }}>
      <KeyboardShortcutsProvider>
        <TooltipProvider delayDuration={200}>
          <div className="flex h-screen overflow-hidden bg-background">
            {/* Mobile sidebar drawer */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetContent
                side="left"
                className="w-[260px] p-0 md:hidden"
                showCloseButton={false}
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>Navigation</SheetTitle>
                  <SheetDescription>Main navigation menu</SheetDescription>
                </SheetHeader>
                <div className="flex h-full flex-col">
                  <SidebarInner
                    showLabels
                    pathname={pathname}
                    onLinkClick={handleMobileClose}
                    activeProjectId={activeProjectId}
                    projects={projects}
                  />
                </div>
              </SheetContent>
            </Sheet>

            {/* Desktop sidebar */}
            <aside
              className={cn(
                "hidden h-full shrink-0 flex-col border-r border-border/60 bg-background transition-[width] duration-200 md:flex",
                collapsed ? "w-12" : "w-[220px]"
              )}
            >
              <SidebarInner
                showLabels={!collapsed}
                pathname={pathname}
                activeProjectId={activeProjectId}
                projects={projects}
              />
            </aside>

            {/* Main content */}
            <div className="flex flex-1 flex-col overflow-hidden">
              <HeaderBar
                onToggleSidebar={toggle}
                user={user}
                onSignOut={handleSignOut}
              />
              <main className="flex-1 overflow-auto">{children}</main>
            </div>
          </div>

          <CommandPalette />
        </TooltipProvider>
      </KeyboardShortcutsProvider>
    </SidebarContext.Provider>
  );
}
