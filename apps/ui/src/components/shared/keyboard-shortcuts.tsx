"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { useModules } from "@/components/shared/modules-context";

interface ShortcutsContextType {
  showHelp: () => void;
}

const ShortcutsContext = createContext<ShortcutsContextType>({ showHelp: () => {} });

export function useShortcuts() {
  return useContext(ShortcutsContext);
}

interface ShortcutEntry {
  keys: string[];
  description: string;
  crmOnly?: boolean;
}

const NAV_SHORTCUTS: ShortcutEntry[] = [
  { keys: ["G", "D"], description: "Go to Dashboard" },
  { keys: ["G", "C"], description: "Go to Contacts", crmOnly: true },
  { keys: ["G", "O"], description: "Go to Organizations", crmOnly: true },
  { keys: ["G", "T"], description: "Go to Tasks" },
  { keys: ["G", "A"], description: "Go to Agents" },
  { keys: ["G", "K"], description: "Go to Knowledge" },
  { keys: ["G", "E"], description: "Go to Collections" },
  { keys: ["G", "R"], description: "Go to Routines" },
  { keys: ["G", "L"], description: "Go to Activity" },
  { keys: ["G", "N"], description: "Go to Notifications" },
  { keys: ["G", "S"], description: "Go to Settings" },
];

const ACTION_SHORTCUTS: ShortcutEntry[] = [
  { keys: ["⌘", "K"], description: "Command palette" },
  { keys: ["⌘", "B"], description: "Toggle sidebar" },
  { keys: ["?"], description: "Keyboard shortcuts" },
];

const FULL_NAV_MAP: Record<string, { href: string; crmOnly?: boolean }> = {
  d: { href: "/dashboard" },
  c: { href: "/dashboard/crm", crmOnly: true },
  o: { href: "/dashboard/organizations", crmOnly: true },
  t: { href: "/dashboard/tasks" },
  a: { href: "/dashboard/agents" },
  k: { href: "/dashboard/knowledge" },
  e: { href: "/dashboard/collections" },
  r: { href: "/dashboard/routines" },
  l: { href: "/dashboard/activity" },
  n: { href: "/dashboard/notifications" },
  s: { href: "/dashboard/settings" },
};

export function KeyboardShortcutsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [gPressed, setGPressed] = useState(false);
  const router = useRouter();
  const modules = useModules();
  const crmEnabled = modules.crm !== false;

  const showHelp = useCallback(() => setHelpOpen(true), []);

  const shortcutGroups = useMemo(() => [
    {
      title: "Navigation",
      shortcuts: NAV_SHORTCUTS.filter((s) => !s.crmOnly || crmEnabled),
    },
    {
      title: "Actions",
      shortcuts: ACTION_SHORTCUTS,
    },
  ], [crmEnabled]);

  useEffect(() => {
    let gTimer: ReturnType<typeof setTimeout> | null = null;

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement).isContentEditable) return;

      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setHelpOpen((prev) => !prev);
        return;
      }

      if (e.key === "g" && !e.metaKey && !e.ctrlKey && !gPressed) {
        setGPressed(true);
        gTimer = setTimeout(() => setGPressed(false), 800);
        return;
      }

      if (gPressed) {
        setGPressed(false);
        if (gTimer) clearTimeout(gTimer);
        const entry = FULL_NAV_MAP[e.key];
        if (entry && (!entry.crmOnly || crmEnabled)) {
          e.preventDefault();
          router.push(entry.href);
        }
      }
    };

    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      if (gTimer) clearTimeout(gTimer);
    };
  }, [gPressed, router, crmEnabled]);

  return (
    <ShortcutsContext.Provider value={{ showHelp }}>
      {children}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {shortcutGroups.map((group) => (
              <div key={group.title}>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {group.title}
                </h3>
                <div className="space-y-2">
                  {group.shortcuts.map((shortcut) => (
                    <div
                      key={shortcut.description}
                      className="flex items-center justify-between text-sm"
                    >
                      <span>{shortcut.description}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key) => (
                          <Kbd key={key}>{key}</Kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </ShortcutsContext.Provider>
  );
}
