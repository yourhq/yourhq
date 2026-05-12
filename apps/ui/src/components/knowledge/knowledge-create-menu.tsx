"use client";

import Link from "next/link";
import { FileText, BookOpen, Upload, Plus, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { SourceConnection } from "@/lib/sources/types";

interface KnowledgeCreateMenuProps {
  onCreatePage: () => void;
  onCreateSkill: () => void;
  onUploadFiles: () => void;
  connectedSources?: SourceConnection[];
  onPickFromSource?: (connectionId: string) => void;
}

export function KnowledgeCreateMenu({
  onCreatePage,
  onCreateSkill,
  onUploadFiles,
  connectedSources,
  onPickFromSource,
}: KnowledgeCreateMenuProps) {
  const activeSources = connectedSources?.filter((c) => c.status === "active") ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          New
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={onCreatePage} className="gap-2">
          <FileText className="h-4 w-4 text-blue-400" />
          <div>
            <div className="text-sm">Page</div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCreateSkill} className="gap-2">
          <BookOpen className="h-4 w-4 text-purple-400" />
          <div>
            <div className="text-sm">Skill</div>
            <div className="text-[10px] text-muted-foreground">
              Procedures, methods, SOPs
            </div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onUploadFiles} className="gap-2">
          <Upload className="h-4 w-4 text-amber-400" />
          <div className="text-sm">Upload files</div>
        </DropdownMenuItem>

        {activeSources.length > 0 && onPickFromSource && (
          <>
            <DropdownMenuSeparator />
            {activeSources.map((conn) => (
              <DropdownMenuItem
                key={conn.id}
                onClick={() => onPickFromSource(conn.id)}
                className="gap-2"
              >
                <Globe className="h-4 w-4 text-teal-400" />
                <div className="text-sm">
                  From {conn.account_label}
                </div>
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="gap-2">
          <Link href="/dashboard/settings/sources">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm">Connect new source</div>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
