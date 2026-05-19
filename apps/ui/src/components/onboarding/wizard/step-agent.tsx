"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  ArrowRight,
  Loader2,
  Check,
  Search,
  PenLine,
  BarChart3,
  CalendarCheck,
  Globe,
  Zap,
  Brain,
  ListChecks,
  ChevronDown,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AGENT_EMOJIS, AGENT_EMOJI_LABELS } from "@/lib/agents/emoji-grid";
import { StaggeredEntrance } from "./staggered-entrance";
import type { AgentTemplate } from "./onboarding-wizard";

/* ── Constants ─────────────────────────────────────────────────────── */

const CAP_ICONS: LucideIcon[] = [Search, PenLine, BarChart3, CalendarCheck];

const PLATFORM_CAPABILITIES: { icon: LucideIcon; label: string }[] = [
  { icon: Globe, label: "Browse the web autonomously" },
  { icon: Zap, label: "Learn and remember new skills" },
  { icon: Brain, label: "Access your knowledge base" },
  { icon: ListChecks, label: "Work on tasks independently" },
];

const PRIMARY_COUNT = 5;

/* ── Props ─────────────────────────────────────────────────────────── */

export interface StepAgentProps {
  roster: AgentTemplate[];
  recommendedKey: string;
  onCreateAgent?: (data: {
    name: string;
    emoji: string;
    templateBranch: string;
  }) => Promise<{ agentId: string; provisionCommandId?: string } | null>;
  onContinue?: (data: {
    name: string;
    emoji: string;
    templateBranch: string;
  }) => void;
  collectOnly?: boolean;
  provisionStatus?: "idle" | "provisioning" | "ready" | "error";
  provisionError?: string | null;
  pending: boolean;
}

/* ── Roster item ───────────────────────────────────────────────────── */

function RosterItem({
  agent,
  isSelected,
  isRecommended,
  customEmoji,
  customName,
  disabled,
  onClick,
}: {
  agent: AgentTemplate;
  isSelected: boolean;
  isRecommended: boolean;
  customEmoji?: string;
  customName?: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const emoji = customEmoji ?? agent.emoji;
  const name = customName ?? agent.name;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
        isSelected
          ? "bg-foreground/[0.07]"
          : "hover:bg-foreground/[0.03]",
        disabled && !isSelected && "opacity-30 pointer-events-none",
      )}
    >
      <span className="text-[20px] leading-none mt-0.5 shrink-0">{emoji}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-[14px] font-medium truncate transition-colors",
            isSelected ? "text-foreground" : "text-foreground/80 group-hover:text-foreground",
          )}>
            {name}
          </span>
          {isRecommended && (
            <span className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-1.5 py-px text-[10px] font-medium text-muted-foreground/60">
              <Sparkles className="h-2.5 w-2.5" />
              Suggested
            </span>
          )}
        </div>
        <span className={cn(
          "text-[12px] leading-snug transition-colors line-clamp-1",
          isSelected ? "text-muted-foreground/70" : "text-muted-foreground/50 group-hover:text-muted-foreground/65",
        )}>
          {agent.role}
        </span>
      </div>
    </button>
  );
}

/* ── Component ─────────────────────────────────────────────────────── */

export function StepAgent({
  roster,
  recommendedKey,
  onCreateAgent,
  onContinue,
  collectOnly,
  provisionStatus = "idle",
  provisionError,
  pending,
}: StepAgentProps) {
  const [selectedKey, setSelectedKey] = useState(recommendedKey);
  const [customNames, setCustomNames] = useState<Record<string, string>>({});
  const [customEmojis, setCustomEmojis] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const agent = roster.find((a) => a.key === selectedKey) ?? roster[0];
  const agentName = customNames[selectedKey] ?? agent.name;
  const agentEmoji = customEmojis[selectedKey] ?? agent.emoji;
  const displayName = agentName.trim() || agent.name;

  const primaryAgents = roster.slice(0, PRIMARY_COUNT);
  const moreAgents = roster.slice(PRIMARY_COUNT);

  useEffect(() => {
    if (created) return;
    const t = setTimeout(() => {
      const input = nameInputRef.current;
      if (!input) return;
      input.focus();
      const len = input.value.length;
      input.setSelectionRange(len, len);
    }, 350);
    return () => clearTimeout(t);
  }, [selectedKey, created]);

  useEffect(() => {
    if (!showEmojiPicker) return;
    function handleClick(e: MouseEvent) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showEmojiPicker]);

  const handleCreate = useCallback(async () => {
    const agentData = {
      name: agentName.trim() || agent.name,
      emoji: agentEmoji,
      templateBranch: agent.branch,
    };

    if (collectOnly) {
      onContinue?.(agentData);
      return;
    }

    setCreating(true);
    const result = await onCreateAgent?.(agentData);
    setCreating(false);
    if (result) setCreated(true);
  }, [agentName, agentEmoji, agent, onCreateAgent, onContinue, collectOnly]);

  const handleSelectAgent = (key: string) => {
    if (created || key === selectedKey) return;
    setShowEmojiPicker(false);
    setSelectedKey(key);
  };

  return (
    <div>
      {/* ── Header ── */}
      <StaggeredEntrance index={0}>
        <div className="space-y-2 mb-6 md:mb-8">
          <h1 className="text-[24px] md:text-[28px] font-semibold leading-[1.15] tracking-tight">
            Choose your first employee
          </h1>
          <p className="text-[14px] leading-relaxed text-muted-foreground">
            Every employee is an AI agent with real capabilities. Pick who to start
            with — you can hire more anytime.
          </p>
        </div>
      </StaggeredEntrance>

      {/* ── Two-column layout (stacks on mobile) ── */}
      <StaggeredEntrance index={1}>
        <div className="flex flex-col md:flex-row gap-5 items-start">
          {/* Left: roster */}
          <div className="w-full md:w-[240px] md:shrink-0">
            {/* Mobile: horizontal scroll roster */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 md:hidden">
              {primaryAgents.map((a) => {
                const isSelected = a.key === selectedKey;
                const em = customEmojis[a.key] ?? a.emoji;
                const nm = customNames[a.key] ?? a.name;
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => handleSelectAgent(a.key)}
                    disabled={created}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 shrink-0 transition-all",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                      isSelected
                        ? "bg-foreground/[0.07]"
                        : "hover:bg-foreground/[0.03]",
                      created && !isSelected && "opacity-30 pointer-events-none",
                    )}
                  >
                    <span className="text-[18px] leading-none">{em}</span>
                    <span className={cn(
                      "text-[13px] font-medium whitespace-nowrap",
                      isSelected ? "text-foreground" : "text-foreground/70",
                    )}>
                      {nm}
                    </span>
                    {a.key === recommendedKey && (
                      <Sparkles className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />
                    )}
                  </button>
                );
              })}
              {moreAgents.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowMore((p) => !p)}
                  disabled={created}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 shrink-0 text-[12px] font-medium text-muted-foreground/55 hover:text-muted-foreground/80"
                >
                  <ChevronDown className={cn("h-3 w-3 transition-transform", showMore && "rotate-180")} />
                  +{moreAgents.length}
                </button>
              )}
            </div>
            {showMore && (
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 md:hidden animate-in fade-in slide-in-from-top-1 duration-200">
                {moreAgents.map((a) => {
                  const isSelected = a.key === selectedKey;
                  const em = customEmojis[a.key] ?? a.emoji;
                  const nm = customNames[a.key] ?? a.name;
                  return (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => handleSelectAgent(a.key)}
                      disabled={created}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-3 py-2 shrink-0 transition-all",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                        isSelected
                          ? "bg-foreground/[0.07]"
                          : "hover:bg-foreground/[0.03]",
                        created && !isSelected && "opacity-30 pointer-events-none",
                      )}
                    >
                      <span className="text-[18px] leading-none">{em}</span>
                      <span className={cn(
                        "text-[13px] font-medium whitespace-nowrap",
                        isSelected ? "text-foreground" : "text-foreground/70",
                      )}>
                        {nm}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Desktop: vertical roster list */}
            <div className="hidden md:block">
              <div className="space-y-0.5">
                {primaryAgents.map((a) => (
                  <RosterItem
                    key={a.key}
                    agent={a}
                    isSelected={a.key === selectedKey}
                    isRecommended={a.key === recommendedKey}
                    customEmoji={customEmojis[a.key]}
                    customName={customNames[a.key]}
                    disabled={created}
                    onClick={() => handleSelectAgent(a.key)}
                  />
                ))}
              </div>

              {/* More agents */}
              {moreAgents.length > 0 && (
                <div className="mt-1">
                  <button
                    type="button"
                    onClick={() => setShowMore((p) => !p)}
                    disabled={created}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors",
                      "text-muted-foreground/55 hover:text-muted-foreground/80 hover:bg-foreground/[0.02]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                      created && "opacity-30 pointer-events-none",
                    )}
                  >
                    <ChevronDown className={cn("h-3 w-3 transition-transform", showMore && "rotate-180")} />
                    {showMore ? "Show fewer" : `${moreAgents.length} more employees`}
                  </button>

                  {showMore && (
                    <div className="space-y-0.5 mt-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
                      {moreAgents.map((a) => (
                        <RosterItem
                          key={a.key}
                          agent={a}
                          isSelected={a.key === selectedKey}
                          isRecommended={false}
                          customEmoji={customEmojis[a.key]}
                          customName={customNames[a.key]}
                          disabled={created}
                          onClick={() => handleSelectAgent(a.key)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: detail */}
          <div className="flex-1 min-w-0">
            <div className="relative rounded-2xl overflow-hidden">
              {/* Warm ambient glow behind the card */}
              <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[320px] h-[200px] rounded-full bg-primary/[0.06] blur-[80px] pointer-events-none" />

              <div className="relative">
                {/* Hero: emoji + identity */}
                <div className="relative px-5 pt-8 pb-2 text-center md:px-8 md:pt-10" ref={emojiPickerRef}>
                  <div className="relative inline-block mb-4 md:mb-5">
                    {/* Colored glow ring */}
                    <div className="absolute inset-0 rounded-full bg-primary/[0.08] blur-2xl scale-[2.5] pointer-events-none" />
                    <button
                      type="button"
                      onClick={() => !created && setShowEmojiPicker((p) => !p)}
                      disabled={created}
                      aria-label="Change avatar"
                      className={cn(
                        "relative flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-2xl text-[40px] md:text-[52px] leading-none transition-all",
                        !created && "hover:scale-[1.08] cursor-pointer active:scale-[0.98]",
                      )}
                    >
                      {agentEmoji}
                    </button>
                  </div>

                  {showEmojiPicker && (
                    <div className="absolute left-1/2 -translate-x-1/2 z-10 animate-in fade-in zoom-in-95 duration-150 rounded-xl border border-border/60 bg-card p-2.5 md:p-3 shadow-lg max-w-[calc(100vw-3rem)]">
                      <div
                        role="radiogroup"
                        aria-label="Choose an avatar"
                        className="grid grid-cols-6 md:grid-cols-8 gap-0.5 md:gap-1"
                      >
                        {AGENT_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            role="radio"
                            aria-checked={agentEmoji === emoji}
                            aria-label={AGENT_EMOJI_LABELS[emoji] ?? emoji}
                            onClick={() => {
                              setCustomEmojis((prev) => ({ ...prev, [selectedKey]: emoji }));
                              setShowEmojiPicker(false);
                            }}
                            className={cn(
                              "flex h-8 w-8 md:h-9 md:w-9 items-center justify-center rounded-lg text-[16px] md:text-[18px] transition-all",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                              agentEmoji === emoji
                                ? "bg-foreground/[0.1] ring-1 ring-foreground/40 scale-110"
                                : "hover:bg-accent/40",
                            )}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {!created ? (
                    <input
                      ref={nameInputRef}
                      type="text"
                      value={agentName}
                      onChange={(e) =>
                        setCustomNames((prev) => ({ ...prev, [selectedKey]: e.target.value }))
                      }
                      placeholder={agent.name}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !creating) handleCreate();
                      }}
                      className="block mx-auto text-center text-[22px] md:text-[26px] font-semibold tracking-tight bg-transparent outline-none w-48 md:w-56 mb-1.5 transition-colors placeholder:text-muted-foreground/25 border-b border-dashed border-primary/20 focus:border-primary/50 pb-0.5"
                    />
                  ) : (
                    <div className="text-[22px] md:text-[26px] font-semibold tracking-tight mb-1.5">{displayName}</div>
                  )}
                  <div className="text-[13px] md:text-[14px] font-medium text-primary/70 mb-3 md:mb-4">{agent.role}</div>
                  <p className="max-w-[38ch] mx-auto text-[13px] md:text-[14px] leading-[1.6] text-foreground/60">
                    {agent.description}
                  </p>
                </div>

                {/* Divider */}
                <div className="mx-5 my-4 md:mx-8 md:my-5 h-px bg-gradient-to-r from-transparent via-border/30 to-transparent" />

                {/* What they can do — label */}
                <div className="px-5 pb-1 md:px-8">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/45 mb-2.5 md:mb-3">
                    Specializations
                  </p>
                </div>

                {/* Capabilities — stacked list */}
                <div className="px-5 pb-5 md:px-8 md:pb-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 md:gap-y-3">
                    {agent.capabilities.map((cap, i) => {
                      const Icon = CAP_ICONS[i % CAP_ICONS.length];
                      return (
                        <div
                          key={`${selectedKey}-${i}`}
                          className="flex items-center gap-3"
                        >
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/[0.06]">
                            <Icon className="h-3.5 w-3.5 text-primary/60" />
                          </div>
                          <span className="text-[13px] font-medium text-foreground/80">{cap.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Platform capabilities */}
                <div className="mx-5 mb-5 md:mx-8 md:mb-6 rounded-xl bg-foreground/[0.025] px-4 py-3 md:px-5 md:py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/40 mb-2 md:mb-2.5">
                    Every employee can
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1.5 md:gap-y-2">
                    {PLATFORM_CAPABILITIES.map((cap) => (
                      <div key={cap.label} className="flex items-center gap-2">
                        <cap.icon className="h-3.5 w-3.5 text-foreground/30 shrink-0" />
                        <span className="text-[11px] md:text-[12px] text-foreground/55">{cap.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </StaggeredEntrance>

      {/* ── Provision status (OSS only) ── */}
      {created && !collectOnly && (
        <div className="flex items-center gap-2 text-[13px] mt-6 animate-in fade-in duration-300">
          {provisionStatus === "provisioning" && (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">Setting up {displayName}…</span>
            </>
          )}
          {provisionStatus === "ready" && (
            <>
              <Check className="h-4 w-4 text-status-success" />
              <span className="text-status-success">Ready</span>
            </>
          )}
          {provisionStatus === "error" && (
            <span className="text-destructive text-[12px]">
              {provisionError || "Setup failed — you can retry from the agent page."}
            </span>
          )}
        </div>
      )}

      {/* ── CTA ── */}
      {!created && (
        <StaggeredEntrance index={2} className="mt-6">
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || pending}
            className={cn(
              "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2",
              creating || pending
                ? "cursor-not-allowed bg-muted text-muted-foreground/50"
                : "bg-primary text-primary-foreground shadow-sm hover:brightness-110 active:scale-[0.97]",
            )}
          >
            {creating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Creating {displayName}…
              </>
            ) : collectOnly ? (
              <>
                Continue with {displayName}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </>
            ) : (
              <>
                Create {displayName}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </StaggeredEntrance>
      )}
    </div>
  );
}
