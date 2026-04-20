"use client";

import { useEffect, useMemo, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import {
  buildFolderTree,
  type TreeFolder,
} from "@/lib/shared/folder-tree";
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
  Plus,
  Folder,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Trash2,
  Smile,
  FolderPlus,
} from "lucide-react";

export interface SharedFolderTreeProps<T extends TreeFolder> {
  folders: T[];
  loading: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  onCreateFolder: (name: string, parentId?: string) => void;
  onRenameFolder?: (id: string, name: string) => void;
  onDeleteFolder?: (id: string) => void;
  onUpdateIcon?: (id: string, icon: string | null) => void;
  /** Recursive item counts keyed by folder id. */
  counts?: Record<string, number>;
  /** Icon accessor — returns emoji/string or null. */
  getIcon?: (folder: T) => string | null | undefined;
  /** Color accessor — returns CSS color or null. */
  getColor?: (folder: T) => string | null | undefined;
  allLabel: string;
  allIcon: React.ReactNode;
  expandedStorageKey: string;
  /** Namespace for dnd ids so multiple trees can coexist. */
  dndNamespace: string;
}

export function SharedFolderTree<T extends TreeFolder>({
  folders,
  loading,
  selectedId,
  onSelect,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onUpdateIcon,
  counts,
  getIcon,
  getColor,
  allLabel,
  allIcon,
  expandedStorageKey,
  dndNamespace,
}: SharedFolderTreeProps<T>) {
  const [showRootInput, setShowRootInput] = useState(false);
  const [newName, setNewName] = useState("");
  const [subInputParentId, setSubInputParentId] = useState<string | null>(null);
  const [subName, setSubName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [iconEditId, setIconEditId] = useState<string | null>(null);
  const [iconValue, setIconValue] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(expandedStorageKey);
      if (raw) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setExpanded(new Set(JSON.parse(raw)));
      }
    } catch {}
  }, [expandedStorageKey]);

  const persistExpanded = (next: Set<string>) => {
    setExpanded(next);
    try {
      window.localStorage.setItem(expandedStorageKey, JSON.stringify([...next]));
    } catch {}
  };

  const toggleExpanded = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    persistExpanded(next);
  };

  const expandId = (id: string) => {
    if (expanded.has(id)) return;
    const next = new Set(expanded);
    next.add(id);
    persistExpanded(next);
  };

  const tree = useMemo(() => buildFolderTree(folders), [folders]);

  function handleRootCreate() {
    if (newName.trim()) {
      onCreateFolder(newName.trim());
      setNewName("");
      setShowRootInput(false);
    }
  }

  function handleSubCreate() {
    if (subName.trim() && subInputParentId) {
      onCreateFolder(subName.trim(), subInputParentId);
      setSubName("");
      setSubInputParentId(null);
    }
  }

  function commitRename() {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (trimmed && onRenameFolder) onRenameFolder(renamingId, trimmed);
    setRenamingId(null);
  }

  function commitIcon() {
    if (!iconEditId || !onUpdateIcon) return;
    const trimmed = iconValue.trim();
    onUpdateIcon(iconEditId, trimmed || null);
    setIconEditId(null);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Folders
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setShowRootInput(true)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <nav className="space-y-0.5 flex-1 overflow-y-auto">
        <AllRow
          selected={selectedId === "all"}
          onSelect={() => onSelect("all")}
          label={allLabel}
          icon={allIcon}
          dndId={`${dndNamespace}-folder-root`}
        />

        {loading ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading...</div>
        ) : (
          tree.map((folder) => (
            <FolderNode
              key={folder.id}
              folder={folder}
              depth={0}
              selectedId={selectedId}
              onSelect={onSelect}
              expanded={expanded}
              onToggleExpanded={toggleExpanded}
              onRequestSubfolder={(parentId) => {
                setSubInputParentId(parentId);
                setSubName("");
                expandId(parentId);
              }}
              onRequestRename={(id, currentName) => {
                setRenamingId(id);
                setRenameValue(currentName);
              }}
              onRequestIcon={(id, currentIcon) => {
                setIconEditId(id);
                setIconValue(currentIcon ?? "");
              }}
              onDelete={onDeleteFolder}
              subInputParentId={subInputParentId}
              subName={subName}
              setSubName={setSubName}
              onSubCreate={handleSubCreate}
              onSubCancel={() => setSubInputParentId(null)}
              renamingId={renamingId}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              onCommitRename={commitRename}
              onCancelRename={() => setRenamingId(null)}
              iconEditId={iconEditId}
              iconValue={iconValue}
              setIconValue={setIconValue}
              onCommitIcon={commitIcon}
              onCancelIcon={() => setIconEditId(null)}
              counts={counts}
              getIcon={getIcon}
              getColor={getColor}
              dndNamespace={dndNamespace}
              canRename={!!onRenameFolder}
              canDelete={!!onDeleteFolder}
              canSetIcon={!!onUpdateIcon}
            />
          ))
        )}
      </nav>

      {showRootInput && (
        <div className="mt-2 flex gap-1">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Folder name..."
            className="h-7 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRootCreate();
              if (e.key === "Escape") setShowRootInput(false);
            }}
            autoFocus
          />
          <Button size="sm" className="h-7 px-2 text-xs" onClick={handleRootCreate}>
            Add
          </Button>
        </div>
      )}
    </div>
  );
}

function AllRow({
  selected,
  onSelect,
  label,
  icon,
  dndId,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  icon: React.ReactNode;
  dndId: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: dndId,
    data: { type: "folder", folderId: null },
  });
  return (
    <button
      ref={setNodeRef}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-2 w-full rounded px-2 py-1.5 text-xs font-medium transition-colors",
        selected
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50",
        isOver && "ring-1 ring-inset ring-foreground/40"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

interface FolderNodeProps<T extends TreeFolder> {
  folder: T;
  depth: number;
  selectedId: string;
  onSelect: (id: string) => void;
  expanded: Set<string>;
  onToggleExpanded: (id: string) => void;
  onRequestSubfolder: (parentId: string) => void;
  onRequestRename: (id: string, currentName: string) => void;
  onRequestIcon: (id: string, currentIcon: string | null | undefined) => void;
  onDelete?: (id: string) => void;
  subInputParentId: string | null;
  subName: string;
  setSubName: (v: string) => void;
  onSubCreate: () => void;
  onSubCancel: () => void;
  renamingId: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  iconEditId: string | null;
  iconValue: string;
  setIconValue: (v: string) => void;
  onCommitIcon: () => void;
  onCancelIcon: () => void;
  counts?: Record<string, number>;
  getIcon?: (folder: T) => string | null | undefined;
  getColor?: (folder: T) => string | null | undefined;
  dndNamespace: string;
  canRename: boolean;
  canDelete: boolean;
  canSetIcon: boolean;
}

function FolderNode<T extends TreeFolder>(props: FolderNodeProps<T>) {
  const {
    folder,
    depth,
    selectedId,
    onSelect,
    expanded,
    onToggleExpanded,
    onRequestSubfolder,
    onRequestRename,
    onRequestIcon,
    onDelete,
    subInputParentId,
    subName,
    setSubName,
    onSubCreate,
    onSubCancel,
    renamingId,
    renameValue,
    setRenameValue,
    onCommitRename,
    onCancelRename,
    iconEditId,
    iconValue,
    setIconValue,
    onCommitIcon,
    onCancelIcon,
    counts,
    getIcon,
    getColor,
    dndNamespace,
    canRename,
    canDelete,
    canSetIcon,
  } = props;

  const hasChildren = !!folder.children && folder.children.length > 0;
  const isExpanded = expanded.has(folder.id);
  const isSelected = selectedId === folder.id;
  const isRenaming = renamingId === folder.id;
  const isEditingIcon = iconEditId === folder.id;
  const icon = getIcon?.(folder);
  const color = getColor?.(folder);
  const count = counts?.[folder.id];

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `${dndNamespace}-drop-folder-${folder.id}`,
    data: { type: "folder", folderId: folder.id },
  });
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `${dndNamespace}-drag-folder-${folder.id}`,
    data: { type: "folder", folderId: folder.id },
  });

  const setRefs = (node: HTMLDivElement | null) => {
    setDropRef(node);
    setDragRef(node);
  };

  return (
    <div>
      <div
        ref={setRefs}
        {...attributes}
        {...listeners}
        className={cn(
          "group/row flex items-center w-full rounded pr-1 text-xs font-medium transition-colors cursor-pointer",
          isSelected
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-accent/50",
          isOver && "ring-1 ring-inset ring-foreground/40",
          isDragging && "opacity-50"
        )}
        style={{ paddingLeft: depth * 12 }}
        onClick={() => !isRenaming && onSelect(folder.id)}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggleExpanded(folder.id);
          }}
          className={cn(
            "flex h-6 w-4 items-center justify-center shrink-0",
            !hasChildren && "invisible"
          )}
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>
        <div className="flex flex-1 items-center gap-2 py-1.5 min-w-0">
          {icon ? (
            <span className="text-sm shrink-0">{icon}</span>
          ) : (
            <Folder
              className="h-3.5 w-3.5 shrink-0"
              style={color ? { color } : undefined}
            />
          )}
          {isRenaming ? (
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") onCommitRename();
                if (e.key === "Escape") onCancelRename();
              }}
              onBlur={onCommitRename}
              autoFocus
              className="h-5 text-[11px] py-0 px-1"
            />
          ) : (
            <span className="truncate">{folder.name}</span>
          )}
          {typeof count === "number" && count > 0 && !isRenaming && (
            <span className="ml-auto mr-1 text-[10px] tabular-nums text-muted-foreground/70 shrink-0">
              {count}
            </span>
          )}
        </div>
        {(canRename || canDelete || canSetIcon) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-accent opacity-0 group-hover/row:flex text-muted-foreground"
                title="Folder actions"
              >
                <MoreHorizontal className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestSubfolder(folder.id);
                }}
              >
                <FolderPlus className="h-3.5 w-3.5" />
                New subfolder
              </DropdownMenuItem>
              {canRename && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestRename(folder.id, folder.name);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Rename
                </DropdownMenuItem>
              )}
              {canSetIcon && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestIcon(folder.id, icon);
                  }}
                >
                  <Smile className="h-3.5 w-3.5" />
                  Change icon
                </DropdownMenuItem>
              )}
              {canDelete && onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(folder.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {isEditingIcon && (
        <div
          className="flex gap-1 py-1"
          style={{ paddingLeft: (depth + 1) * 12 + 16 }}
        >
          <Input
            value={iconValue}
            onChange={(e) => setIconValue(e.target.value)}
            placeholder="Emoji (blank to clear)"
            className="h-6 text-[11px]"
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommitIcon();
              if (e.key === "Escape") onCancelIcon();
            }}
            autoFocus
          />
          <Button size="sm" className="h-6 px-2 text-[11px]" onClick={onCommitIcon}>
            Set
          </Button>
        </div>
      )}

      {subInputParentId === folder.id && (
        <div
          className="flex gap-1 py-1"
          style={{ paddingLeft: (depth + 1) * 12 + 16 }}
        >
          <Input
            value={subName}
            onChange={(e) => setSubName(e.target.value)}
            placeholder="Subfolder name..."
            className="h-6 text-[11px]"
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubCreate();
              if (e.key === "Escape") onSubCancel();
            }}
            autoFocus
          />
          <Button size="sm" className="h-6 px-2 text-[11px]" onClick={onSubCreate}>
            Add
          </Button>
        </div>
      )}

      {hasChildren && isExpanded && (
        <div>
          {(folder.children as T[]).map((child) => (
            <FolderNode
              key={child.id}
              {...props}
              folder={child}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
