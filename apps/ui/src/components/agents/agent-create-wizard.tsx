"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Plus, Search, Clipboard, Check, ArrowLeft, X, Info, Loader2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { createAgentWithBranch, enqueueAgentCommand } from "@/app/dashboard/agents/actions";
import type { AgentTemplate } from "@/lib/agents/types";
import { useAgentCommands } from "@/hooks/use-agent-commands";

type Step = "template" | "identity" | "telegram" | "provisioning" | "pairing" | "ready";

interface AgentCreateWizardProps {
  onClose: () => void;
  onCreated: () => void;
}

const STEP_LABELS: Record<Step, string> = {
  template: "Template",
  identity: "Identity",
  telegram: "Telegram",
  provisioning: "Provisioning",
  pairing: "Pairing",
  ready: "Ready",
};

const STEP_ORDER: Step[] = ["template", "identity", "telegram", "provisioning", "pairing", "ready"];

const EMOJI_GRID = [
  "🤖","✨","🌟","⚡","🔥","💡","🧠","🪄","🛠️","📎",
  "📚","📝","📬","📨","💬","🗂️","📊","📈","🧭","🧪",
  "🧩","🎯","🎨","🎧","🎬","📸","🌙","🌊","🌱","🍀",
  "🦊","🦉","🐙","🐝","🐳","🦄","🐢","🐈","🐕","🪶",
  "🚀","🛰️","⚙️","🔧","🔮","🧿","💎","🏷️","🗝️","📌",
];

const BOTFATHER_TOKEN_RE = /^\d+:[A-Za-z0-9_-]{30,}$/;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function maskToken(token: string): string {
  if (token.length < 10) return "•".repeat(token.length);
  return `${"•".repeat(8)}${token.slice(-6)}`;
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

  // Step 3
  const [token, setToken] = useState("");
  const [tokenFocused, setTokenFocused] = useState(false);

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Post-create (provisioning / pairing / ready)
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [createdBranch, setCreatedBranch] = useState<string | null>(null);
  const [retryingProvision, setRetryingProvision] = useState(false);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingSince, setPairingSince] = useState<number | null>(null);
  const [submittingPair, setSubmittingPair] = useState(false);
  const [confirmCloseInPairing, setConfirmCloseInPairing] = useState(false);

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
  const hasToken = token.trim().length > 0;

  const canAdvanceFromTemplate = selectedTemplate !== null || isCustom;
  const canAdvanceFromIdentity = name.trim().length > 0 && slug.trim().length > 0;
  const tokenLooksValid = BOTFATHER_TOKEN_RE.test(token.trim());

  const goBack = useCallback(() => {
    setError(null);
    if (step === "identity") setStep("template");
    else if (step === "telegram") setStep("identity");
  }, [step]);

  const goNext = useCallback(() => {
    setError(null);
    if (step === "template" && canAdvanceFromTemplate) setStep("identity");
    else if (step === "identity" && canAdvanceFromIdentity) setStep("telegram");
  }, [step, canAdvanceFromTemplate, canAdvanceFromIdentity]);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const result = await createAgentWithBranch({
        name: name.trim(),
        slug: slug.trim(),
        emoji,
        description: description.trim(),
        templateBranch: selectedTemplate?.branch ?? null,
        telegramToken: token.trim() || undefined,
      });
      setCreatedAgentId(result.agentId);
      setCreatedBranch(result.branch);

      // Auto-enqueue provisioning on the gateway. add-agent.sh on the
      // gateway side handles branch creation off the source template,
      // agent.json/USER.md patching, and openclaw.json wiring — the UI
      // just passes the wizard inputs through.
      try {
        await enqueueAgentCommand({
          agentId: result.agentId,
          agentSlug: result.slug,
          action: "provision",
          payload: {
            ...(token.trim() ? { telegram_token: token.trim() } : {}),
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
        // Non-fatal — retry button in provisioning step lets the user re-enqueue
        console.warn("[wizard] Could not enqueue provision command");
      }

      // Agent list should update to show the new agent immediately
      onCreated();
      setStep("provisioning");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create agent";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [submitting, name, slug, emoji, description, selectedTemplate, token, onCreated]);

  // ── Post-create: command subscription + auto-advance ─────────

  const { commands, refetch } = useAgentCommands(
    createdAgentId ? { agentId: createdAgentId } : {}
  );

  const latestProvision = useMemo(
    () => commands.find((c) => c.action === "provision"),
    [commands]
  );

  // Pairing: only react to approve_pairing commands created after we entered
  // the pairing step (snapshot in pairingSince).
  const latestPairing = useMemo(() => {
    if (pairingSince === null) return undefined;
    return commands.find(
      (c) =>
        c.action === "approve_pairing" &&
        new Date(c.created_at).getTime() >= pairingSince
    );
  }, [commands, pairingSince]);

  // Polling fallback: while in provisioning or pairing, refetch every 3s in
  // case realtime silently drops. Cleared on step change / unmount.
  useEffect(() => {
    if (step !== "provisioning" && step !== "pairing") return;
    const t = setInterval(() => refetch(), 3000);
    return () => clearInterval(t);
  }, [step, refetch]);

  // Auto-advance from provisioning → pairing (or ready, if no token)
  useEffect(() => {
    if (step !== "provisioning") return;
    if (latestProvision?.status !== "done") return;
    if (hasToken) {
      setPairingSince(Date.now());
      setStep("pairing");
    } else {
      setStep("ready");
    }
  }, [step, latestProvision?.status, hasToken]);

  // Auto-advance from pairing → ready
  useEffect(() => {
    if (step !== "pairing") return;
    if (latestPairing?.status === "done") {
      setStep("ready");
    }
  }, [step, latestPairing?.status]);

  const retryProvision = useCallback(async () => {
    if (!createdAgentId || retryingProvision) return;
    setRetryingProvision(true);
    try {
      await enqueueAgentCommand({
        agentId: createdAgentId,
        agentSlug: slug.trim(),
        action: "provision",
        payload: token.trim() ? { telegram_token: token.trim() } : {},
      });
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't retry provisioning");
    } finally {
      setRetryingProvision(false);
    }
  }, [createdAgentId, retryingProvision, slug, token, refetch]);

  const submitPairingCode = useCallback(async () => {
    if (!createdAgentId || submittingPair) return;
    const code = pairingCode.trim();
    if (!code) return;
    setSubmittingPair(true);
    try {
      await enqueueAgentCommand({
        agentId: createdAgentId,
        agentSlug: slug.trim(),
        action: "approve_pairing",
        payload: { pairing_code: code },
      });
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't submit pairing code");
    } finally {
      setSubmittingPair(false);
    }
  }, [createdAgentId, submittingPair, pairingCode, slug, refetch]);

  const handleOpenAgent = useCallback(() => {
    if (!createdAgentId) return;
    onClose();
    router.push(`/dashboard/agents/${createdAgentId}`);
  }, [createdAgentId, onClose, router]);

  // Keyboard: Enter advances / submits / pairs
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      if (step === "template" || step === "identity") {
        e.preventDefault();
        goNext();
      } else if (step === "telegram") {
        e.preventDefault();
        handleSubmit();
      } else if (step === "pairing") {
        e.preventDefault();
        submitPairingCode();
      }
    },
    [step, handleSubmit, goNext, submitPairingCode]
  );

  async function handlePasteToken() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setToken(text.trim());
    } catch {
      toast.error("Couldn't read clipboard");
    }
  }

  // Close guard: block close while submitting or during provisioning.
  // In pairing, require confirmation. In other steps and ready, allow close.
  const handleOpenChange = (open: boolean) => {
    if (open) return;
    if (submitting || step === "provisioning") return;
    if (step === "pairing") {
      setConfirmCloseInPairing(true);
      return;
    }
    onClose();
  };

  const showBackButton =
    step === "identity" || step === "telegram";

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden max-h-[85dvh] flex flex-col">
        <DialogTitle className="sr-only">Register a new agent</DialogTitle>
        <DialogDescription className="sr-only">
          Pick a template, set identity, wire up Telegram, then provision and pair.
        </DialogDescription>

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
            <div className="mb-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
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
                    className="w-64 p-2"
                    align="start"
                    portal={false}
                  >
                    <div className="grid grid-cols-10 gap-0.5">
                      {EMOJI_GRID.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => {
                            setEmoji(e);
                            setEmojiOpen(false);
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded text-base hover:bg-muted/60 transition-colors"
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

          {step === "telegram" && (
            <div className="grid grid-cols-5 gap-4">
              <div className="col-span-3 space-y-2">
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground/50">
                  Bot token
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={
                      tokenFocused || !token ? token : maskToken(token)
                    }
                    onChange={(e) => setToken(e.target.value)}
                    onFocus={() => setTokenFocused(true)}
                    onBlur={() => setTokenFocused(false)}
                    placeholder="123456:ABCdef…"
                    autoFocus
                    className="w-full h-9 rounded border border-border/50 bg-transparent pl-3 pr-16 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:ring-border placeholder:text-muted-foreground/40"
                  />
                  <button
                    type="button"
                    onClick={handlePasteToken}
                    className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted/40 transition-colors"
                  >
                    <Clipboard className="h-3 w-3" />
                    Paste
                  </button>
                </div>
                {token && (
                  <div
                    className={cn(
                      "flex items-center gap-1.5 text-[11px]",
                      tokenLooksValid
                        ? "text-green-400/80"
                        : "text-muted-foreground/50"
                    )}
                  >
                    {tokenLooksValid && <Check className="h-3 w-3" />}
                    {tokenLooksValid
                      ? "Looks like a valid token"
                      : "Doesn't match the BotFather format"}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground/50 pt-1">
                  We&rsquo;ll wire this to{" "}
                  <span className="font-mono text-muted-foreground/70">
                    TELEGRAM_TOKEN_{slug.toUpperCase().replace(/-/g, "_") || "SLUG"}
                  </span>{" "}
                  on your instance.
                </p>
              </div>

              <div className="col-span-2 rounded border border-border/40 bg-[oklch(0.155_0_0)] p-3">
                <div className="text-[11px] font-medium text-foreground mb-2">
                  Get a token from @BotFather
                </div>
                <ol className="space-y-1.5 text-[11px] text-muted-foreground">
                  <li>
                    1. Open Telegram, message{" "}
                    <a
                      href="https://t.me/BotFather"
                      target="_blank"
                      rel="noreferrer"
                      className="text-foreground underline decoration-border hover:decoration-foreground"
                    >
                      @BotFather
                    </a>
                  </li>
                  <li>
                    2. Send <span className="font-mono text-foreground">/newbot</span>
                  </li>
                  <li>3. Pick a display name</li>
                  <li>
                    4. Pick a username ending in{" "}
                    <span className="font-mono text-foreground">bot</span>
                  </li>
                  <li>5. Copy the token BotFather replies with</li>
                </ol>
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

          {step === "pairing" && (
            <PairingStep
              pairingCode={pairingCode}
              onChange={setPairingCode}
              onSubmit={submitPairingCode}
              submitting={submittingPair}
              latestStatus={latestPairing?.status}
              latestError={latestPairing?.error_message}
            />
          )}

          {step === "ready" && (
            <ReadyStep
              emoji={emoji}
              name={name}
              branch={createdBranch ?? (workspaceSlug ? `${workspaceSlug}/${slug}` : slug)}
              paired={hasToken}
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
            {submitting && step === "telegram" && (
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
            {(step === "template" || step === "identity") && (
              <>
                <p className="text-[11px] text-muted-foreground/50">
                  Press Enter to continue
                </p>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={goNext}
                  disabled={
                    (step === "template" && !canAdvanceFromTemplate) ||
                    (step === "identity" && !canAdvanceFromIdentity)
                  }
                >
                  Continue
                </Button>
              </>
            )}
            {step === "telegram" && (
              <>
                <p className="text-[11px] text-muted-foreground/50">
                  Press Enter to create
                </p>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? "Creating…" : "Create agent"}
                </Button>
              </>
            )}
            {step === "pairing" && (
              <>
                <p className="text-[11px] text-muted-foreground/50">
                  Press Enter to pair
                </p>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={submitPairingCode}
                  disabled={submittingPair || !pairingCode.trim() || latestPairing?.status === "pending" || latestPairing?.status === "leased" || latestPairing?.status === "running"}
                >
                  {submittingPair ? "Submitting…" : "Pair"}
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

        {/* Pairing close confirmation */}
        {confirmCloseInPairing && (
          <Dialog
            open
            onOpenChange={(open) => !open && setConfirmCloseInPairing(false)}
          >
            <DialogContent className="sm:max-w-sm">
              <DialogTitle className="text-sm font-medium">
                Close without pairing?
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Your agent is provisioned. You can pair it later from the agent page.
              </DialogDescription>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setConfirmCloseInPairing(false)}
                >
                  Keep pairing
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setConfirmCloseInPairing(false);
                    onClose();
                  }}
                >
                  Close anyway
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
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
                <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
              )}
              {row.state === "running" && (
                <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
              )}
              {row.state === "failed" && (
                <AlertCircle className="h-3.5 w-3.5 text-red-400" />
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
                row.state === "failed" && "text-red-400",
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
        <div className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2.5">
          <div className="text-[11px] font-medium text-red-400 mb-1">
            Provisioning failed
          </div>
          {provisionError && (
            <div className="text-[11px] text-red-300/80 font-mono whitespace-pre-wrap break-all mb-2 max-h-24 overflow-y-auto">
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

function PairingStep({
  pairingCode,
  onChange,
  onSubmit,
  submitting,
  latestStatus,
  latestError,
}: {
  pairingCode: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  latestStatus: string | undefined;
  latestError: string | null | undefined;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const pairing =
    latestStatus === "pending" ||
    latestStatus === "leased" ||
    latestStatus === "running";
  const failed = latestStatus === "failed";

  return (
    <div className="grid grid-cols-5 gap-4">
      <div className="col-span-3 space-y-3">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground/50">
            Pairing code
          </label>
          <input
            ref={inputRef}
            type="text"
            value={pairingCode}
            onChange={(e) => onChange(e.target.value)}
            placeholder="••••••"
            autoComplete="off"
            spellCheck={false}
            className="mt-1.5 w-full h-12 rounded border border-border/50 bg-transparent px-3 text-center font-mono text-lg tracking-[0.5em] outline-none focus-visible:ring-1 focus-visible:ring-border placeholder:text-muted-foreground/30 placeholder:tracking-[0.5em]"
          />
          <div className="mt-1.5 text-[11px] text-muted-foreground/50">
            {pairingCode.trim()
              ? "Press Enter to pair"
              : "Enter the code your bot replied with"}
          </div>
        </div>

        {/* Live status for pair attempt */}
        {pairing && (
          <div className="flex items-center gap-2 rounded border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-[11px] text-blue-400">
            <Loader2 className="h-3 w-3 animate-spin shrink-0" />
            <span>Pairing in progress…</span>
          </div>
        )}
        {failed && (
          <div className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2">
            <div className="flex items-start gap-2 text-[11px] text-red-400">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                Pairing failed{latestError ? `: ${latestError}` : ""}. Double-check the code and try again.
              </span>
            </div>
          </div>
        )}

        {/* Submit button available inline too */}
        <Button
          size="sm"
          className="h-8 text-xs w-full"
          onClick={onSubmit}
          disabled={submitting || !pairingCode.trim() || pairing}
        >
          {submitting ? "Submitting…" : pairing ? "Pairing…" : "Submit pairing code"}
        </Button>
      </div>

      <div className="col-span-2 rounded border border-border/40 bg-[oklch(0.155_0_0)] p-3">
        <div className="text-[11px] font-medium text-foreground mb-2">
          Get your pairing code
        </div>
        <ol className="space-y-1.5 text-[11px] text-muted-foreground">
          <li>1. Open Telegram and find the bot you just created</li>
          <li>
            2. Send <span className="font-mono text-foreground">/start</span>
          </li>
          <li>3. Copy the code it replies with</li>
          <li>4. Paste it on the left and press Enter</li>
        </ol>
        <a
          href="https://t.me/"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-[11px] text-foreground underline decoration-border hover:decoration-foreground"
        >
          Open Telegram
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

function ReadyStep({
  emoji,
  name,
  branch,
  paired,
}: {
  emoji: string | undefined;
  name: string;
  branch: string;
  paired: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10 mb-4">
        <CheckCircle2 className="h-7 w-7 text-green-400" />
      </div>
      <div className="text-base font-medium text-foreground">
        {emoji ? `${emoji} ` : ""}
        {name || "Agent"} is ready
      </div>
      <div className="mt-1.5 text-xs text-muted-foreground">
        {paired ? "Connected to Telegram" : "Pair later from the agent page"} · <span className="font-mono">{branch}</span>
      </div>
      {!paired && (
        <p className="mt-4 max-w-sm text-[11px] text-muted-foreground/60 leading-relaxed">
          You didn&rsquo;t add a Telegram token — the agent is provisioned but not yet reachable over Telegram. Add a token and pair from the agent page when you&rsquo;re ready.
        </p>
      )}
    </div>
  );
}
