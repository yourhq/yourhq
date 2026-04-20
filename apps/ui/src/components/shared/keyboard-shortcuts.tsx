"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

interface ShortcutsContextType {
  showHelp: () => void;
}

const ShortcutsContext = createContext<ShortcutsContextType>({ showHelp: () => {} });

export function useShortcuts() {
  return useContext(ShortcutsContext);
}

const SHORTCUT_GROUPS = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["G", "D"], description: "Go to Dashboard" },
      { keys: ["G", "C"], description: "Go to CRM" },
      { keys: ["G", "O"], description: "Go to Organizations" },
      { keys: ["G", "T"], description: "Go to Tasks" },
      { keys: ["G", "A"], description: "Go to Assets" },
      { keys: ["G", "L"], description: "Go to Activity" },
      { keys: ["G", "G"], description: "Go to Agents" },
      { keys: ["G", "N"], description: "Go to Notifications" },
      { keys: ["G", "S"], description: "Go to Settings" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { keys: ["⌘", "K"], description: "Command palette" },
      { keys: ["⌘", "B"], description: "Toggle sidebar" },
      { keys: ["?"], description: "Keyboard shortcuts" },
    ],
  },
];

const NAV_MAP: Record<string, string> = {
  d: "/dashboard",
  c: "/dashboard/crm",
  o: "/dashboard/organizations",
  t: "/dashboard/tasks",
  a: "/dashboard/assets",
  l: "/dashboard/activity",
  g: "/dashboard/agents",
  n: "/dashboard/notifications",
  s: "/dashboard/settings",
};

export function KeyboardShortcutsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [gPressed, setGPressed] = useState(false);
  const router = useRouter();

  const showHelp = useCallback(() => setHelpOpen(true), []);

  useEffect(() => {
    let gTimer: ReturnType<typeof setTimeout> | null = null;

    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement).isContentEditable) return;

      // ? for help
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setHelpOpen((prev) => !prev);
        return;
      }

      // G + key navigation
      if (e.key === "g" && !e.metaKey && !e.ctrlKey && !gPressed) {
        setGPressed(true);
        gTimer = setTimeout(() => setGPressed(false), 800);
        return;
      }

      if (gPressed) {
        setGPressed(false);
        if (gTimer) clearTimeout(gTimer);
        const dest = NAV_MAP[e.key];
        if (dest) {
          e.preventDefault();
          router.push(dest);
        }
      }
    };

    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      if (gTimer) clearTimeout(gTimer);
    };
  }, [gPressed, router]);

  return (
    <ShortcutsContext.Provider value={{ showHelp }}>
      {children}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {SHORTCUT_GROUPS.map((group) => (
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
