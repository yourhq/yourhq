"use client";

import { Contact, PRIORITY_COLORS } from "@/lib/crm/types";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import { DEFAULT_STAGE_COLOR } from "@/lib/fields/types";
import { StatusDot } from "@/components/ui/status-dot";
import { PipelineStagePicker } from "@/components/shared/pipeline-stage-picker";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Mail,
  Phone,
  Globe,
  Linkedin,
  Twitter,
  Building2,
  Briefcase,
  MapPin,
  ExternalLink,
  Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SocialLink {
  key: "linkedin_url" | "twitter_url" | "website_url";
  icon: React.ReactNode;
  label: string;
}

const SOCIAL_LINKS: SocialLink[] = [
  { key: "linkedin_url", icon: <Linkedin className="h-3.5 w-3.5" />, label: "LinkedIn" },
  { key: "twitter_url", icon: <Twitter className="h-3.5 w-3.5" />, label: "Twitter/X" },
  { key: "website_url", icon: <Globe className="h-3.5 w-3.5" />, label: "Website" },
];

interface ContactPreviewCardProps {
  contact: Contact;
  onStatusChange?: (id: string, status: string) => void;
  onArchive?: (id: string) => void;
}

export function ContactPreviewCard({
  contact,
  onStatusChange,
  onArchive,
}: ContactPreviewCardProps) {
  const { stagesByKey } = usePipelineStages("contact");
  const stage = stagesByKey[contact.status];
  const activeSocials = SOCIAL_LINKS.filter((s) => contact[s.key]);

  return (
    <div className="space-y-3 w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">{contact.name}</div>
          {(contact.title || contact.company) && (
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              {contact.title}
              {contact.title && contact.company && " · "}
              {contact.company}
            </div>
          )}
        </div>
        {contact.priority && (
          <span
            className={cn(
              "text-[10px] font-medium capitalize shrink-0",
              PRIORITY_COLORS[contact.priority]
            )}
          >
            {contact.priority}
          </span>
        )}
      </div>

      {/* Status selector */}
      {onStatusChange ? (
        <PipelineStagePicker
          entityType="contact"
          value={contact.status}
          onValueChange={(v) => v && onStatusChange(contact.id, v)}
          triggerClassName="w-full justify-between"
        />
      ) : (
        <StatusDot
          color={stage?.color ?? DEFAULT_STAGE_COLOR}
          label={stage?.label ?? contact.status}
        />
      )}

      {/* Contact info */}
      {(contact.email || contact.phone || contact.company || contact.title || contact.location) && (
        <>
          <Separator />
          <div className="space-y-1.5 text-xs">
            {contact.email && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Mail className="h-3 w-3 shrink-0" />
                <a
                  href={`mailto:${contact.email}`}
                  className="text-foreground hover:underline truncate"
                  onClick={(e) => e.stopPropagation()}
                >
                  {contact.email}
                </a>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Phone className="h-3 w-3 shrink-0" />
                <span className="text-foreground">{contact.phone}</span>
              </div>
            )}
            {contact.company && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="text-foreground truncate">{contact.company}</span>
              </div>
            )}
            {contact.title && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Briefcase className="h-3 w-3 shrink-0" />
                <span className="text-foreground truncate">{contact.title}</span>
              </div>
            )}
            {contact.location && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="text-foreground truncate">{contact.location}</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Social links */}
      {activeSocials.length > 0 && (
        <>
          <Separator />
          <div className="flex items-center gap-2 flex-wrap">
            {activeSocials.map((s) => (
              <a
                key={s.key}
                href={contact[s.key] as string}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-md border px-2 py-1"
                title={s.label}
              >
                {s.icon}
                <span>{s.label}</span>
              </a>
            ))}
          </div>
        </>
      )}

      {/* Tags */}
      {contact.tags && contact.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {contact.tags.slice(0, 6).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
              {tag}
            </Badge>
          ))}
          {contact.tags.length > 6 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              +{contact.tags.length - 6}
            </Badge>
          )}
        </div>
      )}

      {/* Notes preview */}
      {contact.notes && (
        <>
          <Separator />
          <div className="text-xs">
            <span className="text-muted-foreground">Notes: </span>
            <span className="line-clamp-3">{contact.notes}</span>
          </div>
        </>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-0.5">
        <div className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
          <ExternalLink className="h-2.5 w-2.5" />
          Click to view full details
        </div>
        {onArchive && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onArchive(contact.id);
            }}
          >
            <Archive className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
