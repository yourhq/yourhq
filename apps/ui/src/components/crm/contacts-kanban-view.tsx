"use client";

import { useMemo, useState, useCallback } from "react";
import { Contact } from "@/lib/crm/types";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import { DEFAULT_STAGE_COLOR } from "@/lib/fields/types";
import { useIsMobile } from "@/hooks/use-mobile";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { KanbanSkeleton } from "./contacts-loading";
import { ContactsEmpty } from "./contacts-empty";

interface ContactsKanbanViewProps {
  contacts: Contact[];
  loading: boolean;
  hasFilters: boolean;
  onSelect: (contact: Contact) => void;
  onStatusChange: (id: string, status: string) => void;
  onArchive: (id: string) => void;
  onClearFilters: () => void;
  onAddContact: () => void;
}

const PRIORITY_DOT: Record<NonNullable<Contact["priority"]>, string> = {
  urgent: "var(--priority-urgent)",
  high: "var(--priority-high)",
  medium: "var(--priority-medium)",
  low: "var(--priority-low)",
};

export function ContactsKanbanView({
  contacts,
  loading,
  hasFilters,
  onSelect,
  onStatusChange,
  onClearFilters,
  onAddContact,
}: ContactsKanbanViewProps) {
  const mobile = useIsMobile();
  const { nonTerminalStages } = usePipelineStages("contact");
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const groups: Record<string, Contact[]> = {};
    for (const stage of nonTerminalStages) {
      groups[stage.stage_key] = [];
    }
    for (const contact of contacts) {
      if (groups[contact.status]) {
        groups[contact.status].push(contact);
      }
    }
    return groups;
  }, [contacts, nonTerminalStages]);

  const handleDragStart = useCallback((e: React.DragEvent, contactId: string) => {
    e.dataTransfer.setData("text/plain", contactId);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, stageKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(stageKey);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, stageKey: string) => {
      e.preventDefault();
      setDragOverColumn(null);
      const contactId = e.dataTransfer.getData("text/plain");
      if (contactId) {
        const contact = contacts.find((c) => c.id === contactId);
        if (contact && contact.status !== stageKey) {
          onStatusChange(contactId, stageKey);
        }
      }
    },
    [contacts, onStatusChange]
  );

  if (loading) return <KanbanSkeleton />;

  if (contacts.length === 0) {
    return (
      <ContactsEmpty
        hasFilters={hasFilters}
        onClearFilters={onClearFilters}
        onAddContact={onAddContact}
      />
    );
  }

  if (nonTerminalStages.length === 0) {
    return (
      <p className="p-6 text-center text-body text-muted-foreground">
        No pipeline stages configured. Configure stages in Settings → Pipeline.
      </p>
    );
  }

  if (mobile) {
    return (
      <div className="space-y-3">
        {nonTerminalStages.map((stage) => {
          const items = grouped[stage.stage_key] || [];
          const color = stage.color ?? DEFAULT_STAGE_COLOR;

          return (
            <Collapsible key={stage.stage_key} defaultOpen>
              <CollapsibleTrigger className="flex w-full items-center gap-2 py-1.5 text-left">
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-90" />
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-sm font-medium">{stage.label}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {items.length}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1.5 pt-1">
                {items.map((contact) => (
                  <KanbanCard
                    key={contact.id}
                    contact={contact}
                    onSelect={onSelect}
                    onDragStart={() => {}}
                  />
                ))}
                {items.length === 0 && (
                  <div className="py-3 text-center text-[11px] text-muted-foreground/60">
                    Empty
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    );
  }

  return (
    <ScrollArea className="w-full">
      <div
        className="flex gap-4 pb-4"
        style={{ minWidth: `${nonTerminalStages.length * 316}px` }}
      >
        {nonTerminalStages.map((stage) => {
          const items = grouped[stage.stage_key] || [];
          const isOver = dragOverColumn === stage.stage_key;
          const color = stage.color ?? DEFAULT_STAGE_COLOR;

          return (
            <div
              key={stage.stage_key}
              className="flex w-[300px] shrink-0 flex-col"
              onDragOver={(e) => handleDragOver(e, stage.stage_key)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage.stage_key)}
            >
              {/* Column header */}
              <div className="mb-2 flex h-8 items-center gap-2 px-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[13px] font-medium text-foreground">
                  {stage.label}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {items.length}
                </span>
              </div>

              {/* Column body */}
              <div
                className={cn(
                  "min-h-[320px] flex-1 space-y-2 rounded-md border border-border/60 bg-card/40 p-2 transition-colors",
                  isOver && "border-foreground/40 bg-accent"
                )}
              >
                {items.map((contact) => (
                  <KanbanCard
                    key={contact.id}
                    contact={contact}
                    onSelect={onSelect}
                    onDragStart={handleDragStart}
                  />
                ))}
                {items.length === 0 && !isOver && (
                  <div className="flex h-16 items-center justify-center text-[11px] text-muted-foreground/60">
                    Empty
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}

function KanbanCard({
  contact,
  onSelect,
  onDragStart,
}: {
  contact: Contact;
  onSelect: (contact: Contact) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
}) {
  const secondary = [contact.title, contact.company].filter(Boolean).join(" · ");
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, contact.id)}
      onClick={() => onSelect(contact)}
      className="group cursor-pointer rounded-md border border-border/60 bg-card p-2.5 transition-all hover:border-border-strong hover:shadow-sm active:scale-[0.98]"
    >
      <div className="truncate text-[13px] font-medium text-foreground">
        {contact.name}
      </div>
      {secondary && (
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {secondary}
        </div>
      )}
      {(contact.priority || contact.tags.length > 0) && (
        <div className="mt-2 flex items-center gap-2">
          {contact.priority && (
            <span className="inline-flex items-center gap-1 text-[10px] capitalize text-muted-foreground">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: PRIORITY_DOT[contact.priority] }}
              />
              {contact.priority}
            </span>
          )}
          {contact.tags.length > 0 && (
            <span className="truncate text-[10px] text-muted-foreground">
              {contact.tags.slice(0, 2).join(", ")}
              {contact.tags.length > 2 && ` +${contact.tags.length - 2}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
