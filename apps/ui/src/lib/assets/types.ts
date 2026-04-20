// Asset Types — mirrors Supabase schema

export type AssetType =
  | "document"
  | "sop"
  | "research"
  | "image"
  | "video"
  | "audio"
  | "template"
  | "script"
  | "spreadsheet"
  | "link"
  | "other";

export interface AssetFolder {
  id: string;
  created_at: string;
  parent_id: string | null;
  name: string;
  color: string | null;
  sort_order: number;
  // Computed
  children?: AssetFolder[];
  asset_count?: number;
}

export interface Asset {
  id: string;
  created_at: string;
  updated_at: string;
  folder_id: string | null;
  name: string;
  description: string | null;
  type: AssetType;
  mime_type: string | null;
  file_url: string | null;
  file_size: number | null;
  content: string | null;
  archived_at: string | null;
  tags: string[];
  meta: Record<string, unknown>;
  // Joined
  folder?: AssetFolder | null;
}

// Constants

export const ASSET_TYPES: { value: AssetType; label: string; icon: string }[] = [
  { value: "document", label: "Document", icon: "file-text" },
  { value: "sop", label: "SOP", icon: "clipboard-list" },
  { value: "research", label: "Research", icon: "search" },
  { value: "image", label: "Image", icon: "image" },
  { value: "video", label: "Video", icon: "video" },
  { value: "audio", label: "Audio", icon: "headphones" },
  { value: "template", label: "Template", icon: "file-code" },
  { value: "script", label: "Script", icon: "terminal" },
  { value: "spreadsheet", label: "Spreadsheet", icon: "table" },
  { value: "link", label: "Link", icon: "external-link" },
  { value: "other", label: "Other", icon: "file" },
];

export const ASSET_TYPE_COLORS: Record<AssetType, string> = {
  document: "bg-blue-500/20 text-blue-400",
  sop: "bg-purple-500/20 text-purple-400",
  research: "bg-cyan-500/20 text-cyan-400",
  image: "bg-pink-500/20 text-pink-400",
  video: "bg-red-500/20 text-red-400",
  audio: "bg-orange-500/20 text-orange-400",
  template: "bg-indigo-500/20 text-indigo-400",
  script: "bg-green-500/20 text-green-400",
  spreadsheet: "bg-emerald-500/20 text-emerald-400",
  link: "bg-yellow-500/20 text-yellow-400",
  other: "bg-gray-500/20 text-gray-400",
};
