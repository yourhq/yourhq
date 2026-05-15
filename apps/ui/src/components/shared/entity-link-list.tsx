"use client";

import { useEntityLinks } from "@/hooks/use-entity-links";
import type {
  EntityLink,
  EntityLinkSearchResult,
  OwnerType,
  TargetType,
} from "@/lib/entity-links/types";
import { EntityLinkPicker } from "./entity-link-picker";
import {
  FileText,
  Package,
  ExternalLink,
  X,
  Paperclip,
  User,
  Building2,
  ListTodo,
} from "lucide-react";
import Link from "next/link";

const LINK_ROUTES: Record<string, string> = {
  knowledge_item: "/dashboard/knowledge",
  collection_record: "/dashboard/collections",
  contact: "/dashboard/contacts",
  organization: "/dashboard/organizations",
  task: "/dashboard/tasks",
};

function LinkIcon({ link }: { link: EntityLink }) {
  switch (link.target_type) {
    case "knowledge_item":
      if (link.resolved_icon) {
        return <span className="text-sm leading-none">{link.resolved_icon}</span>;
      }
      return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
    case "collection_record":
      return <Package className="h-3.5 w-3.5 text-muted-foreground" />;
    case "contact":
      return <User className="h-3.5 w-3.5 text-muted-foreground" />;
    case "organization":
      return <Building2 className="h-3.5 w-3.5 text-muted-foreground" />;
    case "task":
      return <ListTodo className="h-3.5 w-3.5 text-muted-foreground" />;
    default:
      return <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function LinkName({ link }: { link: EntityLink }) {
  const name = link.resolved_name ?? link.label ?? link.url ?? "Deleted item";
  const isDeleted = !link.resolved_name && link.target_id && link.target_type !== "url";

  if (link.target_type === "url" && link.url) {
    return (
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm hover:underline truncate"
        onClick={(e) => e.stopPropagation()}
      >
        {link.label || link.url}
      </a>
    );
  }

  const route = LINK_ROUTES[link.target_type];
  if (route && link.target_id && !isDeleted) {
    return (
      <Link
        href={`${route}/${link.target_id}`}
        className="text-sm hover:underline truncate"
        onClick={(e) => e.stopPropagation()}
      >
        {name}
      </Link>
    );
  }

  return (
    <span className={`text-sm truncate ${isDeleted ? "text-muted-foreground/50 italic" : ""}`}>
      {isDeleted ? "Deleted item" : name}
    </span>
  );
}

/* ── DB-backed mode (existing behavior) ──────────────────────────── */

interface EntityLinkListDbProps {
  ownerType: OwnerType;
  ownerId: string;
  onUploadFile?: () => void;
  onCreatePage?: () => void;
  links?: undefined;
  onAddLink?: undefined;
  onRemoveLink?: undefined;
  searchTargets?: undefined;
}

/* ── Controlled / buffered mode ──────────────────────────────────── */

interface EntityLinkListControlledProps {
  links: EntityLink[];
  onAddLink: (input: { target_type: TargetType; target_id?: string; url?: string; label?: string }) => void;
  onRemoveLink: (id: string) => void;
  searchTargets: (query: string, targetTypes?: TargetType[]) => Promise<EntityLinkSearchResult[]>;
  onUploadFile?: () => void;
  onCreatePage?: () => void;
  ownerType?: undefined;
  ownerId?: undefined;
}

type EntityLinkListProps = EntityLinkListDbProps | EntityLinkListControlledProps;

export function EntityLinkList(props: EntityLinkListProps) {
  if (props.links !== undefined) {
    return <EntityLinkListInner {...props} />;
  }
  return <EntityLinkListDb {...props} />;
}

function EntityLinkListDb({
  ownerType,
  ownerId,
  onUploadFile,
  onCreatePage,
}: EntityLinkListDbProps) {
  const { links: allLinks, loading, actions } = useEntityLinks(ownerType, ownerId);
  const links = allLinks.filter((l) => !l.is_deliverable);

  return (
    <EntityLinkListInner
      links={links}
      onAddLink={actions.addLink}
      onRemoveLink={actions.removeLink}
      searchTargets={actions.searchTargets}
      onUploadFile={onUploadFile}
      onCreatePage={onCreatePage}
    />
  );
}

function EntityLinkListInner({
  links,
  onAddLink,
  onRemoveLink,
  searchTargets,
  onUploadFile,
  onCreatePage,
}: {
  links: EntityLink[];
  onAddLink: (input: { target_type: TargetType; target_id?: string; url?: string; label?: string }) => void;
  onRemoveLink: (id: string) => void;
  searchTargets: (query: string, targetTypes?: TargetType[]) => Promise<EntityLinkSearchResult[]>;
  onUploadFile?: () => void;
  onCreatePage?: () => void;
}) {
  function handleLinkEntity(targetType: TargetType, targetId: string, label?: string) {
    onAddLink({ target_type: targetType, target_id: targetId, label });
  }

  function handleLinkUrl(url: string, label?: string) {
    onAddLink({ target_type: "url", url, label: label || url });
  }

  if (links.length === 0) {
    return (
      <EntityLinkPicker
        links={links}
        onLinkEntity={handleLinkEntity}
        onLinkUrl={handleLinkUrl}
        onUploadFile={onUploadFile}
        onCreatePage={onCreatePage}
        searchTargets={searchTargets}
        triggerVariant="subtle"
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Links
            <span className="ml-1 text-muted-foreground/60">
              {links.length}
            </span>
          </span>
        </div>
        <EntityLinkPicker
          links={links}
          onLinkEntity={handleLinkEntity}
          onLinkUrl={handleLinkUrl}
          onUploadFile={onUploadFile}
          onCreatePage={onCreatePage}
          searchTargets={searchTargets}
        />
      </div>

      <div className="space-y-0.5">
        {links.map((link) => (
          <div
            key={link.id}
            className="group flex items-center gap-2 rounded px-2 py-1 hover:bg-accent/40 transition-colors"
          >
            <LinkIcon link={link} />
            <div className="flex-1 min-w-0">
              <LinkName link={link} />
            </div>
            {link.target_type === "knowledge_item" &&
              typeof link.resolved_extra?.kind === "string" && (
                <span className="text-[10px] text-muted-foreground/50 shrink-0">
                  {link.resolved_extra.kind}
                </span>
              )}
            <button
              onClick={() => onRemoveLink(link.id)}
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-accent"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
