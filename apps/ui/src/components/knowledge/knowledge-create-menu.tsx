"use client";

import { FileText, BookOpen, Upload, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface KnowledgeCreateMenuProps {
  onCreatePage: () => void;
  onCreatePlaybook: () => void;
  onUploadFiles: () => void;
}

export function KnowledgeCreateMenu({
  onCreatePage,
  onCreatePlaybook,
  onUploadFiles,
}: KnowledgeCreateMenuProps) {
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
        <DropdownMenuItem onClick={onCreatePlaybook} className="gap-2">
          <BookOpen className="h-4 w-4 text-purple-400" />
          <div>
            <div className="text-sm">Playbook</div>
            <div className="text-[10px] text-muted-foreground">
              Skills, SOPs, instructions
            </div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onUploadFiles} className="gap-2">
          <Upload className="h-4 w-4 text-amber-400" />
          <div className="text-sm">Upload files</div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
