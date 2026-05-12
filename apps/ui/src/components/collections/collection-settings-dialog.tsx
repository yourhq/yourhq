"use client";

import { useState } from "react";
import type { CollectionDefinition } from "@/lib/collections/types";
import { DEFAULT_COLLECTION_COLOR } from "@/lib/collections/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";

interface CollectionSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  collection: CollectionDefinition;
  onSave: (
    id: string,
    updates: Partial<Pick<CollectionDefinition, "name" | "description" | "icon" | "color">>,
  ) => void;
}

const PRESET_COLORS = [
  "#6b7280", "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e",
];

export function CollectionSettingsDialog({
  open,
  onClose,
  collection,
  onSave,
}: CollectionSettingsDialogProps) {
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description ?? "");
  const [icon, setIcon] = useState(collection.icon ?? "");
  const [color, setColor] = useState(collection.color ?? DEFAULT_COLLECTION_COLOR);

  const handleSave = () => {
    if (!name.trim()) return;
    const updates: Partial<Pick<CollectionDefinition, "name" | "description" | "icon" | "color">> = {};
    if (name.trim() !== collection.name) updates.name = name.trim();
    if ((description.trim() || null) !== (collection.description ?? null))
      updates.description = description.trim() || null;
    if ((icon.trim() || null) !== (collection.icon ?? null))
      updates.icon = icon.trim() || null;
    if (color !== (collection.color ?? DEFAULT_COLLECTION_COLOR))
      updates.color = color;
    if (Object.keys(updates).length > 0) {
      onSave(collection.id, updates);
    }
    onClose();
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Collection Settings</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this collection for?"
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Icon</Label>
            <Input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="Paste an emoji (e.g. 📋)"
              className="w-24 text-center text-lg"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: c === color ? "currentColor" : "transparent",
                  }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-6 w-6 rounded border-0 p-0 cursor-pointer"
              />
            </div>
          </div>
        </div>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            Save
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
