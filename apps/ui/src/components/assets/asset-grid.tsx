"use client";

import { useDraggable } from "@dnd-kit/core";
import type { Asset } from "@/lib/assets/types";
import { AssetCard } from "./asset-card";
import { LoadingSkeleton } from "@/components/shared/loading-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { FolderOpen } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface AssetGridProps {
  assets: Asset[];
  loading: boolean;
  onSelect: (asset: Asset) => void;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDelete?: (id: string) => void;
  showArchived?: boolean;
}

export function AssetGrid({ assets, loading, onSelect, onArchive, onRestore, onDelete, showArchived }: AssetGridProps) {
  if (loading) {
    return <LoadingSkeleton variant="cards" count={8} />;
  }

  if (assets.length === 0) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="No assets found"
        description="Create or upload an asset to get started."
      />
    );
  }

  return (
    <div className="grid gap-2 grid-cols-2 lg:grid-cols-3">
      {assets.map((asset) => (
        <DraggableAssetCard
          key={asset.id}
          asset={asset}
          onSelect={onSelect}
          onArchive={onArchive}
          onRestore={onRestore}
          onDelete={onDelete}
          showArchived={showArchived}
        />
      ))}
    </div>
  );
}

interface DraggableAssetCardProps {
  asset: Asset;
  onSelect: (asset: Asset) => void;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDelete?: (id: string) => void;
  showArchived?: boolean;
}

function DraggableAssetCard({
  asset,
  onSelect,
  onArchive,
  onRestore,
  onDelete,
  showArchived,
}: DraggableAssetCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `assets-drag-asset-${asset.id}`,
    data: { type: "asset", assetId: asset.id },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(isDragging && "opacity-50")}
    >
      <Link href={`/dashboard/assets/${asset.id}`}>
        <AssetCard
          asset={asset}
          onClick={() => onSelect(asset)}
          onArchive={onArchive}
          onRestore={onRestore}
          onDelete={onDelete}
          showArchived={showArchived}
        />
      </Link>
    </div>
  );
}
