"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Plus, Search, ArrowLeft, X, Info, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { completeItem, loadProgress } from "@/lib/onboarding/progress";
import { createAgentWithBranch, enqueueAgentCommand } from "@/app/dashboard/agents/actions";
import type { AgentTemplate } from "@/lib/agents/types";
import { AGENT_EMOJIS } from "@/lib/agents/emoji-grid";
import { useAgentCommands } from "@/hooks/use-agent-commands";

type Step = "template" | "identity" | "provisioning" | "ready";

interface AgentCreateWizardProps {
  onClose: () => void;
  onCreated: () => void;
}

const STEP_LABELS: Record<Step, string> = {
  template: "Template",
  identity: "Identity",
  provisioning: "Provisioning",
  ready: "Ready",
};

const STEP_ORDER: Step[] = ["template", "identity", "provisioning", "ready"];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export function AgentCreateWizard({ onClose, onCreated }: AgentCreateWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("template");

  // Step 1
  const [templates, setTemplates] = useState<AgentTemplate[] | null>(null);
  const [templateQuery, setTemplateQuery] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
  const [isCustom, setIsCustom] = useState(false);
  const [profileMissing, setProfileMissing] = useState(false);
  const [profileBannerDismissed, setProfileBannerDismissed] = useState(false);
  const [workspaceSlug, setWorkspaceSlug] = useState<string | null>(null);

  // Step 2
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [emoji, setEmoji] = useState<string | undefined>();
  const [description, setDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [reportsToId, setReportsToId] = useState<string | null>(null);
  const [existingAgents, setExistingAgents] = useState<
    { id: string; name: string; slug: string; meta: Record<string, unknown> }[]
  >([]);

  // Gateway
  const [gateways, setGateways] = useState<{ id: string; slug: string; label: string | null }[]>([]);
  const [selectedGatewayId, setSelectedGatewayId] = useState<string | null>(null);

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Post-create (provisioning / pairing / ready)
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [createdBranch, setCreatedBranch] = useState<string | null>(null);
  const [retryingProvision, setRetryingProvision] = useState(false);

  const nameRef = useRef<HTMLTextAreaElement>(null);

  // Fetch templates + check workspace profile on open
  useEffect(() => {
    let cancelled = false;
    fetch("/api/agents/templates")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data)) setTemplates(data);
        else setTemplates([]);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      });

    const supabase = createClient();
    supabase
      .from("workspace")
      .select("owner_name, slug")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (!data || !data.owner_name) setProfileMissing(true);
        if (data?.slug) setWorkspaceSlug(data.slug as string);
      });
    supabase
      .from("agents")
      .select("id, name, slug, meta")
      .order("name", { ascending: true })
      .then(({ data }) => {
        if (cancelled || !data) return;
        setExistingAgents(
          data as {
            id: string;
            name: string;
            slug: string;
            meta: Record<string, unknown>;
          }[],
        );
      });
    supabase
      .from("gateways")
      .select("id, slug, label")
      .order("slug", { ascending: true })
      .then(({ data }) => {
        if (cancelled || !data) return;
        const rows = data as { id: string; slug: string; label: string | null }[];
        setGateways(rows);
        if (rows.length === 1) setSelectedGatewayId(rows[0].id);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-resize name textarea
  useEffect(() => {
    if (nameRef.current) {
      nameRef.current.style.height = "auto";
      nameRef.current.style.height = nameRef.current.scrollHeight + "px";
    }
  }, [name, step]);

  // When entering identity step, prefill description from template
  useEffect(() => {
    if (step === "identity" && selectedTemplate && !description) {
      setDescription(selectedTemplate.description ?? "");
      if (selectedTemplate.description) setShowDescription(true);
      if (selectedTemplate.emoji && !emoji) setEmoji(selectedTemplate.emoji);
    }
  }, [step, selectedTemplate, description, emoji]);

  // Filtered templates
  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    const q = templateQuery.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.branch.toLowerCase().includes(q) ||
        (t.team ?? "").toLowerCase().includes(q)
    );
  }, [templates, templateQuery]);

  // Group filtered templates by team
  const templateGroups = useMemo(() => {
    const groups: { team: string; templates: AgentTemplate[] }[] = [];
    const map = new Map<string, AgentTemplate[]>();
    for (const t of filteredTemplates) {
      const team = t.team || "Ungrouped";
      if (!map.has(team)) map.set(team, []);
      map.get(team)!.push(t);
    }
    for (const [team, items] of map) {
      groups.push({ team, templates: items });
    }
    return groups;
  }, [filteredTemplates]);

  const stepIndex = STEP_ORDER.indexOf(step);

  const canAdvanceFromTemplate = selectedTemplate !== null || isCustom;
  const canAdvanceFromIdentity = name.trim().length > 0 && slug.trim().length > 0;

  const goBack = useCallback(() => {
    setError(null);
    if (step === "identity") setStep("template");
  }, [step]);

  const goNext = useCallback(() => {
    setError(null);
    if (step === "template" && canAdvanceFromTemplate) setStep("identity");
  }, [step, canAdvanceFromTemplate]);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    if (gateways.length > 1 && !selectedGatewayId) return;
    setSubmitting(true);
    setError(null);

    try {
      const result = await createAgentWithBranch({
        name: name.trim(),
        slug: slug.trim(),
        emoji,
        description: description.trim(),
        templateBranch: selectedTemplate?.branch ?? null,
        reportsToId: reportsToId || undefined,
        gatewayId: selectedGatewayId || undefined,
        channel: "none",
      });
      setCreatedAgentId(result.agentId);
      setCreatedBranch(result.branch);

      try {
        await enqueueAgentCommand({
          agentId: result.agentId,
          agentSlug: result.slug,
          action: "provision",
          payload: {
            channel: "none",
            source_template: result.sourceBranch,
            name: name.trim(),
            description: description.trim() || undefined,
            emoji: emoji || undefined,
            owner_name: result.ownerName,
            owner_preferred_name: result.ownerPreferredName,
            owner_timezone: result.ownerTimezone,
          },
        });
      } catch {
        console.warn("[wizard] Could not enqueue provision command");
      }

      const progress = loadProgress();
      if (progress.tier1.agentCreated) {
        completeItem("secondAgentCreated");
      } else {
        completeItem("agentCreated");
      }
      onCreated();
      setStep("provisioning");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create agent";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [submitting, name, slug, emoji, description, selectedTemplate, reportsToId, selectedGatewayId, gateways.length, onCreated]);

  // ── Post-create: command subscription + auto-advance ─────────

  const { commands, refetch } = useAgentCommands(
    createdAgentId ? { agentId: createdAgentId } : {}
  );

  const latestProvision = useMemo(
    () => commands.find((c) => c.action === "provision"),
    [commands]
  );

  useEffect(() => {
    if (step !== "provisioning") return;
    const t = setInterval(() => refetch(), 3000);
    return () => clearInterval(t);
  }, [step, refetch]);

  useEffect(() => {
    if (step !== "provisioning") return;
    if (latestProvision?.status !== "done") return;
    setStep("ready");
  }, [step, latestProvision?.status]);

  const retryProvision = useCallback(async () => {
    if (!createdAgentId || retryingProvision) return;
    setRetryingProvision(true);
    try {
      await enqueueAgentCommand({
        agentId: createdAgentId,
        agentSlug: slug.trim(),
        action: "provision",
        payload: { channel: "none" },
      });
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't retry provisioning");
    } finally {
      setRetryingProvision(false);
    }
  }, [createdAgentId, retryingProvision, slug, refetch]);

  const handleOpenAgent = useCallback(() => {
    if (!createdAgentId) return;
    onClose();
    router.push(`/dashboard/agents/${slug}`);
  }, [createdAgentId, slug, onClose, router]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      if (step === "template") {
        e.preventDefault();
        goNext();
      } else if (step === "identity") {
        if (gateways.length > 1 && !selectedGatewayId) return;
        if (!canAdvanceFromIdentity) return;
        e.preventDefault();
        handleSubmit();
      }
    },
    [step, handleSubmit, goNext, canAdvanceFromIdentity, gateways.length, selectedGatewayId]
  );

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    if (submitting || step === "provisioning") return;
    onClose();
  };

  const showBackButton = step === "identity";

  return (
    <ResponsiveDialog open onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent variant="fullscreen" className="sm:max-w-xl p-0 gap-0 overflow-hidden max-h-[85dvh] flex flex-col">
        <ResponsiveDialogTitle className="sr-only">Register a new agent</ResponsiveDialogTitle>
        <ResponsiveDialogDescription className="sr-only">
          Pick a template, set the identity, then provision your agent.
        </ResponsiveDialogDescription>

        {/* Top-left step label */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-1 shrink-0">
          {showBackButton && (
            <button
              type="button"
              onClick={goBack}
              disabled={submitting}
              className="rounded p-1 text-muted-foreground/60 hover:text-foreground transition-colors focus-visible:ring-1 focus-visible:ring-border outline-none"
              aria-label="Back"
            >
              <ArrowLeft className="h-3 w-3" />
            </button>
          )}
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground/50">
            {STEP_LABELS[step]}
          </span>
        </div>

        {/* Body */}
        <div
          className="flex-1 overflow-y-auto min-h-0 px-4 pt-2 pb-4 transition-all duration-[120ms] ease-out"
          onKeyDown={handleKeyDown}
        >
          {error && (
            <div className="mb-3 rounded border border-status-error/30 bg-status-error/10 px-3 py-2 text-xs text-status-error">
              {error}
            </div>
          )}

          {profileMissing && !profileBannerDismissed && step === "template" && (
            <div className="mb-3 flex items-center gap-2 rounded border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <Info className="h-3 w-3 shrink-0" />
              <span className="flex-1">
                Set up your profile in{" "}
                <Link
                  href="/dashboard/settings/general"
                  className="text-foreground underline decoration-border hover:decoration-foreground"
                >
                  Settings
                </Link>{" "}
                so agents know who they&rsquo;re working for.
              </span>
              <button
                type="button"
                onClick={() => setProfileBannerDismissed(true)}
                className="shrink-0 rounded p-0.5 hover:bg-muted/60 transition-colors"
                aria-label="Dismiss"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {step === "template" && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
                <input
                  type="text"
                  value={templateQuery}
                  onChange={(e) => setTemplateQuery(e.target.value)}
                  placeholder="Search templates…"
                  className="w-full rounded border border-border/50 bg-transparent pl-8 pr-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-border placeholder:text-muted-foreground/40"
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                {templates === null ? (
                  <>
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-14 rounded border border-border/30 bg-muted/20 animate-pulse"
                      />
                    ))}
                  </>
                ) : (
                  <>
                    {templateGroups.map((group) => (
                      <div key={group.team}>
                        <div className="px-1 pt-3 pb-1.5 first:pt-0">
                          <span className="text-[11px] uppercase tracking-wider text-muted-foreground/50">
                            {group.team}
                          </span>
                        </div>
                        {group.templates.map((t) => {
                          const selected =
                            selectedTemplate?.branch === t.branch && !isCustom;
                          return (
                            <button
                              type="button"
                              key={t.branch}
                              onClick={() => {
                                setSelectedTemplate(t);
                                setIsCustom(false);
                              }}
                              onDoubleClick={() => {
                                setSelectedTemplate(t);
                                setIsCustom(false);
                                setStep("identity");
                              }}
                              className={cn(
                                "flex h-14 w-full items-center gap-3 rounded border px-3 text-left transition-colors outline-none focus-visible:ring-1 focus-visible:ring-border mb-1",
                                selected
                                  ? "border-foreground/30 bg-muted/40"
                                  : "border-border/30 hover:bg-muted/20"
                              )}
                            >
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted/40 text-base">
                                {t.emoji ?? "🤖"}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-foreground">
                                  {t.name}
                                </div>
                                <div className="truncate text-xs text-muted-foreground">
                                  {t.description || "No description"}
                                </div>
                              </div>
                              <div className="shrink-0 font-mono text-[10px] text-muted-foreground/40">
                                {t.branch}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ))}

                    {filteredTemplates.length === 0 && templateQuery && (
                      <div className="py-6 text-center text-xs text-muted-foreground/60">
                        No templates match &ldquo;{templateQuery}&rdquo;
                      </div>
                    )}

                    {/* Custom row */}
                    <div className="pt-2">
                      <div className="mb-2 h-px bg-border/30" />
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustom(true);
                          setSelectedTemplate(null);
                        }}
                        onDoubleClick={() => {
                          setIsCustom(true);
                          setSelectedTemplate(null);
                          setStep("identity");
                        }}
                        className={cn(
                          "flex h-14 w-full items-center gap-3 rounded border px-3 text-left transition-colors outline-none focus-visible:ring-1 focus-visible:ring-border",
                          isCustom
                            ? "border-foreground/30 bg-muted/40"
                            : "border-border/30 hover:bg-muted/20"
                        )}
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted/40">
                          <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-foreground">
                            Custom
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Start from the default branch with a blank slate
                          </div>
                        </div>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {step === "identity" && (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border/40 bg-muted/20 text-base hover:bg-muted/40 focus-visible:ring-1 focus-visible:ring-border outline-none transition-colors"
                      aria-label="Pick emoji"
                    >
                      {emoji ?? <span className="text-muted-foreground/50">?</span>}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[304px] p-2"
                    align="start"
                    portal={false}
                  >
                    <div className="grid grid-cols-8 gap-0.5">
                      {AGENT_EMOJIS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => {
                            setEmoji(e);
                            setEmojiOpen(false);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-[16px] hover:bg-muted/60 transition-colors"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                <div className="flex-1 min-w-0">
                  <textarea
                    ref={nameRef}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (!slugTouched) setSlug(slugify(e.target.value));
                    }}
                    placeholder="What should we call them?"
                    autoFocus
                    rows={1}
                    className="w-full resize-none overflow-hidden border-0 bg-transparent text-base font-medium text-foreground outline-none placeholder:text-muted-foreground/50"
                  />
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-muted-foreground/50">slug:</span>
                    <input
                      value={slug}
                      onChange={(e) => {
                        setSlug(slugify(e.target.value));
                        setSlugTouched(true);
                      }}
                      onBlur={() => {
                        if (!slug.trim()) {
                          setSlug(slugify(name));
                          setSlugTouched(false);
                        }
                      }}
                      placeholder="auto-generated"
                      className="flex-1 border-0 bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/40 font-mono"
                    />
                  </div>
                </div>
              </div>

              {showDescription ? (
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this agent do..."
                  rows={2}
                  className="border-0 bg-transparent px-0 text-sm text-muted-foreground shadow-none resize-none focus-visible:ring-0 placeholder:text-muted-foreground/40"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDescription(true)}
                  className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                  Add description...
                </button>
              )}

              {existingAgents.length > 0 && (
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-muted-foreground/50">Reports to:</span>
                  <select
                    value={reportsToId ?? ""}
                    onChange={(e) => setReportsToId(e.target.value || null)}
                    className="h-6 rounded border border-border/40 bg-transparent px-2 text-[11px] text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-border"
                  >
                    <option value="">Operator (you)</option>
                    {existingAgents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.meta?.emoji ? `${a.meta.emoji} ` : ""}
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {gateways.length > 1 && (
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-muted-foreground/50">Gateway:</span>
                  <select
                    value={selectedGatewayId ?? ""}
                    onChange={(e) => setSelectedGatewayId(e.target.value)}
                    className="h-6 rounded border border-border/40 bg-transparent px-2 text-[11px] text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-border"
                  >
                    <option value="" disabled>Select a gateway…</option>
                    {gateways.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label || g.slug}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-2 text-[11px] text-muted-foreground/50">
                Branch: <span className="font-mono">{slug ? (workspaceSlug ? `${workspaceSlug}/${slug}` : slug) : "—"}</span>
                {selectedTemplate && (
                  <>
                    {" "}from <span className="font-mono">{selectedTemplate.branch}</span>
                  </>
                )}
              </div>
            </div>
          )}

          {step === "provisioning" && (
            <ProvisioningStep
              emoji={emoji}
              name={name}
              branch={createdBranch ?? (workspaceSlug ? `${workspaceSlug}/${slug}` : slug)}
              provisionStatus={latestProvision?.status}
              provisionError={latestProvision?.error_message}
              onRetry={retryProvision}
              retrying={retryingProvision}
              onCloseInBackground={onClose}
            />
          )}

          {step === "ready" && (
            <ReadyStep
              emoji={emoji}
              name={name}
              branch={createdBranch ?? (workspaceSlug ? `${workspaceSlug}/${slug}` : slug)}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/50 px-4 py-2 shrink-0">
          <div className="flex items-center gap-1.5">
            {STEP_ORDER.filter((s) => s !== "ready").map((s, i) => (
              <span
                key={s}
                className={cn(
                  "h-1 w-1 rounded-full transition-colors",
                  i <= stepIndex ? "bg-foreground/70" : "bg-border"
                )}
              />
            ))}
            {submitting && step === "identity" && (
              <span className="ml-2 text-[11px] text-muted-foreground/60">
                Creating branch…
              </span>
            )}
            {step === "provisioning" && (
              <button
                type="button"
                onClick={onClose}
                className="ml-2 text-[11px] text-muted-foreground/50 underline decoration-border hover:text-muted-foreground hover:decoration-foreground transition-colors"
              >
                Continue in background
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === "template" && (
              <>
                <p className="text-[11px] text-muted-foreground/50">
                  Press Enter to continue
                </p>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={goNext}
                  disabled={!canAdvanceFromTemplate}
                >
                  Continue
                </Button>
              </>
            )}
            {step === "identity" && (
              <>
                <p className="text-[11px] text-muted-foreground/50">
                  Press Enter to create
                </p>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleSubmit}
                  disabled={submitting || !canAdvanceFromIdentity || (gateways.length > 1 && !selectedGatewayId)}
                >
                  {submitting ? "Creating…" : "Create agent"}
                </Button>
              </>
            )}
            {step === "ready" && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={onClose}
                >
                  Done
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleOpenAgent}
                >
                  Open agent
                </Button>
              </>
            )}
          </div>
        </div>

      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

// ── Sub-step components ──────────────────────────────────────

function ProvisioningStep({
  emoji,
  name,
  branch,
  provisionStatus,
  provisionError,
  onRetry,
  retrying,
  onCloseInBackground,
}: {
  emoji: string | undefined;
  name: string;
  branch: string;
  provisionStatus: string | undefined;
  provisionError: string | null | undefined;
  onRetry: () => void;
  retrying: boolean;
  onCloseInBackground: () => void;
}) {
  // Branch + registration are synchronous — done by the time we arrive here.
  const branchDone = true;
  const registerDone = true;

  const provisioning =
    provisionStatus === "pending" ||
    provisionStatus === "leased" ||
    provisionStatus === "running";
  const provisionDone = provisionStatus === "done";
  const provisionFailed = provisionStatus === "failed";

  const rows: { label: string; state: "done" | "running" | "failed" | "pending" }[] = [
    { label: "Creating git branch", state: branchDone ? "done" : "pending" },
    { label: "Registering agent", state: registerDone ? "done" : "pending" },
    {
      label: "Provisioning on EC2",
      state: provisionDone
        ? "done"
        : provisionFailed
        ? "failed"
        : provisioning
        ? "running"
        : "pending",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Identity card */}
      <div className="flex items-center gap-3 rounded border border-border/40 bg-muted/10 px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted/40 text-lg">
          {emoji ?? "🤖"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">
            {name || "Agent"}
          </div>
          <div className="truncate font-mono text-[11px] text-muted-foreground/60">
            {branch}
          </div>
        </div>
      </div>

      {/* Checklist */}
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3 px-1">
            <div className="flex h-4 w-4 shrink-0 items-center justify-center">
              {row.state === "done" && (
                <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />
              )}
              {row.state === "running" && (
                <Loader2 className="h-3 w-3 animate-spin text-status-info" />
              )}
              {row.state === "failed" && (
                <AlertCircle className="h-3.5 w-3.5 text-status-error" />
              )}
              {row.state === "pending" && (
                <span className="h-1.5 w-1.5 rounded-full bg-border" />
              )}
            </div>
            <span
              className={cn(
                "text-xs transition-colors",
                row.state === "done" && "text-foreground",
                row.state === "running" && "text-foreground",
                row.state === "failed" && "text-status-error",
                row.state === "pending" && "text-muted-foreground/60"
              )}
            >
              {row.label}
              {row.label === "Provisioning on EC2" && row.state === "pending" && (
                <span className="ml-1.5 text-muted-foreground/50">· waiting for daemon…</span>
              )}
              {row.label === "Provisioning on EC2" && row.state === "running" && provisionStatus && (
                <span className="ml-1.5 text-muted-foreground/50">
                  · {provisionStatus === "leased" ? "claimed" : provisionStatus}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      {/* Failure panel */}
      {provisionFailed && (
        <div className="rounded border border-status-error/20 bg-status-error/5 px-3 py-2.5">
          <div className="text-[11px] font-medium text-status-error mb-1">
            Provisioning failed
          </div>
          {provisionError && (
            <div className="text-[11px] text-status-error/80 font-mono whitespace-pre-wrap break-all mb-2 max-h-24 overflow-y-auto">
              {provisionError}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px] gap-1.5"
              onClick={onRetry}
              disabled={retrying}
            >
              {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Retry provision
            </Button>
            <button
              type="button"
              onClick={onCloseInBackground}
              className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              Close and fix later
            </button>
          </div>
        </div>
      )}

      {/* Helper text */}
      {!provisionFailed && (
        <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
          This usually takes under a minute. You can safely close this window — provisioning will continue on the instance and you&rsquo;ll see it update on the agent page.
        </p>
      )}
    </div>
  );
}

function ReadyStep({
  emoji,
  name,
  branch,
}: {
  emoji: string | undefined;
  name: string;
  branch: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-status-success/10 mb-4">
        <CheckCircle2 className="h-7 w-7 text-status-success" />
      </div>
      <div className="text-base font-medium text-foreground">
        {emoji ? `${emoji} ` : ""}
        {name || "Agent"} is ready
      </div>
      <div className="mt-1.5 text-xs text-muted-foreground">
        <span className="font-mono">{branch}</span>
      </div>
      <p className="mt-4 max-w-sm text-[11px] text-muted-foreground/60 leading-relaxed">
        Connect a messaging channel from the agent page to start talking to your agent.
      </p>
    </div>
  );
}
