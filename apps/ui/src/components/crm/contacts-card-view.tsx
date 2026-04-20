"use client";

import { Contact, PRIORITY_COLORS } from "@/lib/crm/types";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import { DEFAULT_STAGE_COLOR } from "@/lib/fields/types";
import { StatusDot } from "@/components/ui/status-dot";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  MoreHorizontal,
  Pencil,
  ArrowRightLeft,
  Clock,
  Archive,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { CardsSkeleton } from "./contacts-loading";
import { ContactsEmpty } from "./contacts-empty";

interface ContactsCardViewProps {
  contacts: Contact[];
  loading: boolean;
  hasFilters: boolean;
  onSelect: (contact: Contact) => void;
  onEdit: (contact: Contact) => void;
  onStatusChange: (id: string, status: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  showArchived: boolean;
  onClearFilters: () => void;
  onAddContact: () => void;
}

export function ContactsCardView({
  contacts,
  loading,
  hasFilters,
  onSelect,
  onEdit,
  onStatusChange,
  onArchive,
  onRestore,
  onDelete,
  showArchived,
  onClearFilters,
  onAddContact,
}: ContactsCardViewProps) {
  const { stages, stagesByKey } = usePipelineStages("contact");
  const getStage = (key: string) => stagesByKey[key];

  if (loading) return <CardsSkeleton />;

  if (contacts.length === 0) {
    return (
      <ContactsEmpty
        hasFilters={hasFilters}
        onClearFilters={onClearFilters}
        onAddContact={onAddContact}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
      {contacts.map((contact) => {
        const stage = getStage(contact.status);
        const subtitleParts: string[] = [];
        if (contact.title) subtitleParts.push(contact.title);
        if (contact.company) subtitleParts.push(contact.company);
        const subtitle = subtitleParts.join(" · ") || contact.email || "";

        return (
          <div
            key={contact.id}
            className="border border-border/50 rounded-md p-2.5 cursor-pointer transition-colors hover:bg-accent/40"
            onClick={() => onSelect(contact)}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{contact.name}</div>
                {subtitle && (
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {subtitle}
                  </div>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  {showArchived ? (
                    <>
                      <DropdownMenuItem onClick={() => onRestore(contact.id)}>
                        <RotateCcw className="mr-2 h-3.5 w-3.5" />
                        Restore
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => onDelete(contact.id)}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Delete permanently
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <>
                      <DropdownMenuItem onClick={() => onEdit(contact)}>
                        <Pencil className="mr-2 h-3.5 w-3.5" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <ArrowRightLeft className="mr-2 h-3.5 w-3.5" />
                          Change Status
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {stages.map((s) => (
                            <DropdownMenuItem
                              key={s.stage_key}
                              onClick={() => onStatusChange(contact.id, s.stage_key)}
                              disabled={s.stage_key === contact.status}
                            >
                              {s.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onArchive(contact.id)}>
                        <Archive className="mr-2 h-3.5 w-3.5" />
                        Archive
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Status + Priority */}
            <div className="flex items-center gap-2 mt-2">
              <StatusDot
                color={stage?.color ?? DEFAULT_STAGE_COLOR}
                label={stage?.label ?? contact.status}
              />
              {contact.priority && (
                <span
                  className={cn(
                    "text-xs font-medium capitalize",
                    PRIORITY_COLORS[contact.priority]
                  )}
                >
                  {contact.priority}
                </span>
              )}
            </div>

            {/* Tags */}
            {contact.tags && contact.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {contact.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-1 py-0 rounded bg-secondary text-secondary-foreground"
                  >
                    {tag}
                  </span>
                ))}
                {contact.tags.length > 3 && (
                  <span className="text-[10px] px-1 py-0 rounded bg-secondary text-secondary-foreground">
                    +{contact.tags.length - 3}
                  </span>
                )}
              </div>
            )}

            {/* Last contact */}
            {contact.last_contact_date && (
              <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3 shrink-0" />
                Last contact{" "}
                {formatDistanceToNow(new Date(contact.last_contact_date), {
                  addSuffix: true,
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
