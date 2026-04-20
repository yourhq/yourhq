"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Stream } from "@/lib/tasks/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Inbox } from "lucide-react";

interface StreamListProps {
  streams: Stream[];
  loading: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  onCreateStream: (name: string) => void;
}

export function StreamList({
  streams,
  loading,
  selectedId,
  onSelect,
  onCreateStream,
}: StreamListProps) {
  const [showInput, setShowInput] = useState(false);
  const [newName, setNewName] = useState("");

  function handleCreate() {
    if (newName.trim()) {
      onCreateStream(newName.trim());
      setNewName("");
      setShowInput(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-label">Streams</span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setShowInput(true)}
          aria-label="New stream"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      <nav className="flex-1 space-y-0.5">
        <StreamItem
          isActive={selectedId === "all"}
          onClick={() => onSelect("all")}
        >
          <Inbox className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left">All tasks</span>
        </StreamItem>

        {loading ? (
          <div className="space-y-1 px-2 py-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-2 w-2 rounded-full" />
                <Skeleton className="h-3 flex-1" />
              </div>
            ))}
          </div>
        ) : (
          streams.map((stream) => (
            <StreamItem
              key={stream.id}
              isActive={selectedId === stream.id}
              onClick={() => onSelect(stream.id)}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: stream.color }}
              />
              <span className="flex-1 truncate text-left">{stream.name}</span>
            </StreamItem>
          ))
        )}
      </nav>

      {showInput && (
        <div className="mt-2 flex gap-1 px-1">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Stream name…"
            className="h-8 text-[12px]"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") {
                setNewName("");
                setShowInput(false);
              }
            }}
            autoFocus
          />
          <Button size="sm" onClick={handleCreate}>
            Add
          </Button>
        </div>
      )}
    </div>
  );
}

function StreamItem({
  isActive,
  onClick,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] transition-colors",
        isActive
          ? "bg-accent text-foreground font-medium"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-foreground" />
      )}
      {children}
    </button>
  );
}
