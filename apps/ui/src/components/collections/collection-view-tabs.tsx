"use client";

import { useState } from "react";
import type { CollectionView, CollectionViewType, CollectionField, ViewConfig } from "@/lib/collections/types";
import { VIEW_TYPE_LABELS } from "@/lib/collections/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Plus, MoreHorizontal, Table, Columns, Calendar, Star, Trash2, Pencil } from "lucide-react";

const VIEW_ICONS: Record<CollectionViewType, typeof Table> = {
  table: Table,
  kanban: Columns,
  calendar: Calendar,
};

interface CollectionViewTabsProps {
  views: CollectionView[];
  activeView: CollectionView | null;
  fields: CollectionField[];
  onSelectView: (viewId: string) => void;
  onCreateView: (input: { name: string; view_type: CollectionViewType; config?: ViewConfig }) => void;
  onUpdateView: (viewId: string, updates: Partial<Pick<CollectionView, "name" | "is_default">>) => void;
  onDeleteView: (viewId: string) => void;
}

export function CollectionViewTabs({
  views,
  activeView,
  fields,
  onSelectView,
  onCreateView,
  onUpdateView,
  onDeleteView,
}: CollectionViewTabsProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [renameViewId, setRenameViewId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<CollectionViewType>("table");
  const [groupByField, setGroupByField] = useState("");

  const selectFields = fields.filter((f) => f.field_type === "select" && f.is_active);
  const dateFields = fields.filter(
    (f) => (f.field_type === "date" || f.field_type === "datetime") && f.is_active,
  );

  const handleCreate = () => {
    if (!newName.trim()) return;
    const config: ViewConfig = {};
    if (newType === "kanban" && groupByField) config.group_by_field = groupByField;
    if (newType === "calendar" && groupByField) config.date_field = groupByField;
    onCreateView({ name: newName.trim(), view_type: newType, config });
    setNewName("");
    setNewType("table");
    setGroupByField("");
    setShowCreate(false);
  };

  return (
    <>
      <div className="flex items-center gap-1 border-b border-border/50 px-2">
        {views.map((v) => {
          const Icon = VIEW_ICONS[v.view_type];
          const isActive = v.id === activeView?.id;
          return (
            <div key={v.id} className="flex items-center">
              <button
                type="button"
                onClick={() => onSelectView(v.id)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] transition-colors border-b-2",
                  isActive
                    ? "border-foreground text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {v.name}
                {v.is_default && <Star className="h-2.5 w-2.5 fill-current" />}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-5 w-5",
                      !isActive && "opacity-0 hover:opacity-100",
                    )}
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onClick={() => {
                      setRenameViewId(v.id);
                      setRenameDraft(v.name);
                    }}
                  >
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Rename
                  </DropdownMenuItem>
                  {!v.is_default && (
                    <DropdownMenuItem onClick={() => onUpdateView(v.id, { is_default: true })}>
                      <Star className="mr-2 h-3.5 w-3.5" />
                      Set as default
                    </DropdownMenuItem>
                  )}
                  {!v.is_default && views.length > 1 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDeleteView(v.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Delete view
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Rename view dialog */}
      <ResponsiveDialog
        open={!!renameViewId}
        onOpenChange={(o) => !o && setRenameViewId(null)}
      >
        <ResponsiveDialogContent className="sm:max-w-xs">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Rename View</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && renameDraft.trim() && renameViewId) {
                  onUpdateView(renameViewId, { name: renameDraft.trim() });
                  setRenameViewId(null);
                }
              }}
            />
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setRenameViewId(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (renameDraft.trim() && renameViewId) {
                  onUpdateView(renameViewId, { name: renameDraft.trim() });
                  setRenameViewId(null);
                }
              }}
              disabled={!renameDraft.trim()}
            >
              Save
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* New view dialog */}
      <ResponsiveDialog open={showCreate} onOpenChange={setShowCreate}>
        <ResponsiveDialogContent className="sm:max-w-sm">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>New View</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. My Board"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={newType} onValueChange={(v) => setNewType(v as CollectionViewType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(VIEW_TYPE_LABELS) as CollectionViewType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {VIEW_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newType === "kanban" && (
              <div className="space-y-1.5">
                <Label>Group by</Label>
                {selectFields.length === 0 ? (
                  <p className="text-body text-muted-foreground">
                    Add a select field to use board view.
                  </p>
                ) : (
                  <Select value={groupByField} onValueChange={setGroupByField}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a field" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectFields.map((f) => (
                        <SelectItem key={f.field_key} value={f.field_key}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
            {newType === "calendar" && (
              <div className="space-y-1.5">
                <Label>Date field</Label>
                {dateFields.length === 0 ? (
                  <p className="text-body text-muted-foreground">
                    Add a date field to use calendar view.
                  </p>
                ) : (
                  <Select value={groupByField} onValueChange={setGroupByField}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a field" />
                    </SelectTrigger>
                    <SelectContent>
                      {dateFields.map((f) => (
                        <SelectItem key={f.field_key} value={f.field_key}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>
              Create
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
