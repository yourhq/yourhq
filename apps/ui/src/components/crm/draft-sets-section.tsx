"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DraftSet, DraftVariant, DraftStatus } from "@/lib/crm/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Mail,
  MessageSquare,
  Check,
  ChevronDown,
  FileText,
  Send,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit/log";

// ── Helpers ────────────────────────────────────────────────────────

const VARIANT_LABELS = ["A", "B", "C"] as const;

function channelIcon(channel: string) {
  switch (channel.toLowerCase()) {
    case "email":
      return <Mail className="h-3.5 w-3.5" />;
    default:
      return <Send className="h-3.5 w-3.5" />;
  }
}

function formatLabel(value: string): string {
  return value
    .split(/[_\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

type GroupedDrafts = Map<string, Map<string, DraftSet[]>>;

function groupDraftSets(drafts: DraftSet[]): GroupedDrafts {
  const grouped: GroupedDrafts = new Map();
  for (const d of drafts) {
    if (!grouped.has(d.channel)) grouped.set(d.channel, new Map());
    const channelMap = grouped.get(d.channel)!;
    if (!channelMap.has(d.stage)) channelMap.set(d.stage, []);
    channelMap.get(d.stage)!.push(d);
  }
  // Sort each stage's versions desc (latest first)
  for (const channelMap of grouped.values()) {
    for (const [stage, sets] of channelMap) {
      channelMap.set(
        stage,
        sets.sort((a, b) => b.version - a.version)
      );
    }
  }
  return grouped;
}

// ── Main Section ───────────────────────────────────────────────────

export function DraftSetsSection({
  contactId,
  contactName,
}: {
  contactId: string;
  contactName: string;
}) {
  const [drafts, setDrafts] = useState<DraftSet[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("draft_sets")
      .select("*")
      .eq("contact_id", contactId)
      .order("version", { ascending: false });
    if (data) setDrafts(data as DraftSet[]);
    setLoading(false);
  }, [supabase, contactId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching on mount, setState in async callback is intentional
    fetchDrafts();
  }, [fetchDrafts]);

  const grouped = useMemo(() => groupDraftSets(drafts), [drafts]);
  const channels = useMemo(() => Array.from(grouped.keys()), [grouped]);

  // Count non-superseded drafts
  const activeCount = drafts.filter((d) => d.status !== "superseded").length;

  async function updateDraftSet(
    id: string,
    updates: Partial<Pick<DraftSet, "selected_variant_index" | "status" | "feedback_notes">>,
    summary: string
  ) {
    const { error } = await supabase
      .from("draft_sets")
      .update(updates)
      .eq("id", id);
    if (error) {
      toast.error("Failed to update draft");
      return false;
    }
    logAudit(supabase, {
      module: "crm",
      entity_type: "draft_set",
      entity_id: id,
      action: "updated",
      summary,
    });
    return true;
  }

  async function handleSelectVariant(
    draftSet: DraftSet,
    variantIndex: 1 | 2 | 3
  ) {
    // Optimistic update
    setDrafts((prev) =>
      prev.map((d) =>
        d.id === draftSet.id ? { ...d, selected_variant_index: variantIndex } : d
      )
    );
    const ok = await updateDraftSet(
      draftSet.id,
      { selected_variant_index: variantIndex },
      `Selected variant ${VARIANT_LABELS[variantIndex - 1]} for ${contactName}`
    );
    if (!ok) fetchDrafts();
    else toast.success(`Variant ${VARIANT_LABELS[variantIndex - 1]} selected`);
  }

  async function handleApprove(draftSet: DraftSet) {
    setDrafts((prev) =>
      prev.map((d) =>
        d.id === draftSet.id ? { ...d, status: "approved" as DraftStatus } : d
      )
    );
    const ok = await updateDraftSet(
      draftSet.id,
      { status: "approved" },
      `Approved draft (variant ${VARIANT_LABELS[(draftSet.selected_variant_index ?? 1) - 1]}) for ${contactName}`
    );
    if (!ok) fetchDrafts();
    else toast.success("Draft approved");
  }

  async function handleRequestChanges(draftSet: DraftSet, feedback: string) {
    setDrafts((prev) =>
      prev.map((d) =>
        d.id === draftSet.id
          ? { ...d, status: "refining" as DraftStatus, feedback_notes: feedback }
          : d
      )
    );
    const ok = await updateDraftSet(
      draftSet.id,
      { status: "refining", feedback_notes: feedback },
      `Requested changes on draft for ${contactName}`
    );
    if (!ok) fetchDrafts();
    else toast.success("Sent for refinement");
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Draft Messages</h2>
        <div className="text-sm text-muted-foreground">Loading drafts...</div>
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Draft Messages</h2>
        <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          No draft messages yet. Drafts will appear here when an agent generates outreach for this contact.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Draft Messages</h2>
        <span className="text-xs text-muted-foreground">{activeCount} draft{activeCount !== 1 ? "s" : ""}</span>
      </div>

      <Tabs defaultValue={channels[0]}>
        <TabsList variant="line">
          {channels.map((ch) => (
            <TabsTrigger key={ch} value={ch} className="gap-1.5">
              {channelIcon(ch)}
              {formatLabel(ch)}
            </TabsTrigger>
          ))}
        </TabsList>

        {channels.map((ch) => {
          const stageMap = grouped.get(ch)!;
          const stages = Array.from(stageMap.keys());
          return (
            <TabsContent key={ch} value={ch} className="space-y-8 pt-4">
              {stages.map((stage) => {
                const versions = stageMap.get(stage)!;
                const latest = versions[0];
                const olderVersions = versions.slice(1);

                return (
                  <StageGroup
                    key={stage}
                    draftSet={latest}
                    olderVersions={olderVersions}
                    onSelectVariant={(idx) => handleSelectVariant(latest, idx)}
                    onApprove={() => handleApprove(latest)}
                    onRequestChanges={(fb) => handleRequestChanges(latest, fb)}
                  />
                );
              })}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

// ── Stage Group ────────────────────────────────────────────────────

function StageGroup({
  draftSet,
  olderVersions,
  onSelectVariant,
  onApprove,
  onRequestChanges,
}: {
  draftSet: DraftSet;
  olderVersions: DraftSet[];
  onSelectVariant: (idx: 1 | 2 | 3) => void;
  onApprove: () => void;
  onRequestChanges: (feedback: string) => void;
}) {
  const isApproved = draftSet.status === "approved";
  const isRefining = draftSet.status === "refining";

  return (
    <div className="space-y-3">
      {/* Stage header */}
      <div className="flex items-center gap-2.5">
        <span className="text-sm font-medium">
          {formatLabel(draftSet.stage)}
        </span>
        <StatusDot status={draftSet.status} />
        {draftSet.version > 1 && (
          <span className="text-xs text-muted-foreground">v{draftSet.version}</span>
        )}
      </div>

      {/* Variant cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {draftSet.variants.map((variant, i) => {
          const variantIndex = (i + 1) as 1 | 2 | 3;
          const isSelected = draftSet.selected_variant_index === variantIndex;
          const isFaded = isApproved && !isSelected;

          return (
            <VariantCard
              key={i}
              variant={variant}
              label={VARIANT_LABELS[i]}
              isSelected={isSelected}
              isFaded={isFaded}
              isApproved={isApproved}
              onClick={() => {
                if (!isApproved) onSelectVariant(variantIndex);
              }}
            />
          );
        })}
      </div>

      {/* Actions */}
      <DraftActions
        draftSet={draftSet}
        isApproved={isApproved}
        isRefining={isRefining}
        onApprove={onApprove}
        onRequestChanges={onRequestChanges}
      />

      {/* Version history */}
      {olderVersions.length > 0 && (
        <VersionHistory versions={olderVersions} />
      )}
    </div>
  );
}

// ── Variant Card ───────────────────────────────────────────────────

function VariantCard({
  variant,
  label,
  isSelected,
  isFaded,
  isApproved,
  onClick,
}: {
  variant: DraftVariant;
  label: string;
  isSelected: boolean;
  isFaded: boolean;
  isApproved: boolean;
  onClick: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Truncate body to ~8 lines
  const lines = variant.body.split("\n");
  const isTruncatable = lines.length > 8;
  const displayBody = expanded ? variant.body : lines.slice(0, 8).join("\n");

  return (
    <div
      role={isApproved ? undefined : "button"}
      tabIndex={isApproved ? undefined : 0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!isApproved && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group/card relative rounded-lg border p-5 transition-colors",
        isApproved
          ? "cursor-default"
          : "cursor-pointer hover:border-border",
        isSelected
          ? "border-primary/60 bg-primary/[0.03]"
          : "border-border/50",
        isFaded && "opacity-40"
      )}
    >
      {/* Selection indicator */}
      {isSelected && (
        <div
          className={cn(
            "absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full",
            isApproved
              ? "bg-green-500/20 text-green-400"
              : "bg-primary/20 text-primary"
          )}
        >
          <Check className="h-3 w-3" />
        </div>
      )}

      {/* Copy button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          const text = variant.subject
            ? `${variant.subject}\n\n${variant.body}`
            : variant.body;
          navigator.clipboard.writeText(text);
          toast.success(`Variant ${label} copied`);
        }}
        className={cn(
          "absolute top-3 transition-opacity rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground",
          isSelected ? "right-10" : "right-3",
          "opacity-0 group-hover/card:opacity-100"
        )}
        title="Copy to clipboard"
      >
        <Copy className="h-3 w-3" />
      </button>

      {/* Header: label + angle */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="font-mono font-medium">{label}</span>
        <span>·</span>
        <span className="truncate">{variant.angle.replace(/_/g, " ")}</span>
      </div>

      {/* Subject (email only) */}
      {variant.subject && (
        <div className="mt-3 text-sm font-medium leading-snug">
          {variant.subject}
        </div>
      )}

      {/* Body */}
      <div className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
        {displayBody}
        {isTruncatable && !expanded && "…"}
      </div>
      {isTruncatable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="mt-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}

      {/* Agent notes */}
      {variant.notes && (
        <div className="mt-3 pt-3 border-t border-border/30 text-xs text-muted-foreground/50 italic leading-relaxed">
          {variant.notes}
        </div>
      )}
    </div>
  );
}

// ── Draft Actions ──────────────────────────────────────────────────

function DraftActions({
  draftSet,
  isApproved,
  isRefining,
  onApprove,
  onRequestChanges,
}: {
  draftSet: DraftSet;
  isApproved: boolean;
  isRefining: boolean;
  onApprove: () => void;
  onRequestChanges: (feedback: string) => void;
}) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState(draftSet.feedback_notes ?? "");

  if (isApproved) {
    const selectedLabel =
      draftSet.selected_variant_index
        ? VARIANT_LABELS[draftSet.selected_variant_index - 1]
        : "—";
    return (
      <div className="flex items-center gap-2 text-xs text-green-400">
        <Check className="h-3.5 w-3.5" />
        <span>Approved · Variant {selectedLabel}</span>
      </div>
    );
  }

  if (isRefining) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-blue-400">
          <MessageSquare className="h-3.5 w-3.5" />
          <span>Refining — awaiting new version from agent</span>
        </div>
        {draftSet.feedback_notes && (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {draftSet.feedback_notes}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setShowFeedback(!showFeedback)}
        >
          <MessageSquare className="mr-1.5 h-3 w-3" />
          Request Changes
        </Button>
        <Button
          variant="default"
          size="sm"
          className="h-7 text-xs"
          disabled={!draftSet.selected_variant_index}
          onClick={onApprove}
        >
          Approve
        </Button>
      </div>

      {showFeedback && (
        <div className="space-y-2">
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="What should the agent change?"
            className="min-h-[72px] text-sm resize-none"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setShowFeedback(false);
                setFeedback(draftSet.feedback_notes ?? "");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs"
              disabled={!feedback.trim()}
              onClick={() => {
                onRequestChanges(feedback.trim());
                setShowFeedback(false);
              }}
            >
              Submit
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Status Dot ─────────────────────────────────────────────────────

function StatusDot({ status }: { status: DraftStatus }) {
  const colorMap: Record<DraftStatus, string> = {
    draft: "bg-yellow-400",
    refining: "bg-blue-400",
    approved: "bg-green-400",
    superseded: "bg-zinc-500",
  };

  const labelMap: Record<DraftStatus, string> = {
    draft: "Draft",
    refining: "Refining",
    approved: "Approved",
    superseded: "Superseded",
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("h-1.5 w-1.5 rounded-full", colorMap[status])} />
      <span className="text-xs text-muted-foreground">{labelMap[status]}</span>
    </div>
  );
}

// ── Version History ────────────────────────────────────────────────

function VersionHistory({ versions }: { versions: DraftSet[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform",
            open && "rotate-180"
          )}
        />
        {versions.length} previous version{versions.length !== 1 ? "s" : ""}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-4">
        {versions.map((v) => (
          <div key={v.id} className="space-y-2 opacity-60">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="h-3 w-3" />
              <span>v{v.version}</span>
              <StatusDot status={v.status} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {v.variants.map((variant, i) => {
                const isSelected = v.selected_variant_index === i + 1;
                return (
                  <div
                    key={i}
                    className={cn(
                      "rounded-md border border-border/30 p-3 text-xs",
                      isSelected && "border-primary/40"
                    )}
                  >
                    <div className="flex items-center gap-1 text-muted-foreground mb-1.5">
                      <span className="font-mono font-medium">
                        {VARIANT_LABELS[i]}
                      </span>
                      {isSelected && (
                        <Check className="h-2.5 w-2.5 text-primary" />
                      )}
                    </div>
                    {variant.subject && (
                      <div className="font-medium text-foreground/70 mb-1">
                        {variant.subject}
                      </div>
                    )}
                    <div className="text-muted-foreground line-clamp-4 whitespace-pre-wrap">
                      {variant.body}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
