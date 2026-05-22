"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, LogOut, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWizardState, clearWizardSession, type WizardData, type WizardStep } from "./use-wizard-state";
import { HqLogo } from "@/components/shared/hq-logo";
import { WizardProgress } from "./wizard-progress";
import { StepWelcome } from "./step-welcome";
import { StepIntent } from "./step-intent";
import { StepInfrastructure, type InfraStatus, type SchemaInstallState } from "./step-infrastructure";
import { StepProvider } from "./step-provider";
import { StepAgent } from "./step-agent";
import { StepAccount } from "./step-account";
import { StepLaunch } from "./step-launch";
import { StepPayment } from "./step-payment";
import { StepProvisioning } from "./step-provisioning";
import { StepCelebration } from "./step-celebration";
import { FIRST_TASK_SUGGESTIONS } from "@/lib/onboarding/first-task-suggestions";
import { completeItem } from "@/lib/onboarding/progress";
import {
  saveWelcomeStep,
  saveIntentStep,
  connectProvider,
  createFirstAgent,
  pollAgentProvisionStatus,
  createAccountAndFinalize,
  validateAndConnectDb,
  setupGateway,
  advanceInfrastructure,
  prepareSchemaInstallAction,
  runOneClickMigrationAction,
  confirmSchemaInstalledAction,
  saveWorkspaceToRegistry,
  signOutFromOnboarding,
  markOnboardingComplete,
} from "./actions";
import { createHostedCheckout, getHostedEmail, verifyAutoLogin, sendFreshLoginLink } from "./hosted-actions";
import { trackEvent, identifyUser } from "@/lib/analytics";

interface AgentCapability {
  label: string;
  detail: string;
}

export interface AgentTemplate {
  key: string;
  branch: string;
  name: string;
  emoji: string;
  role: string;
  description: string;
  capabilities: AgentCapability[];
}

const AGENT_ROSTER: AgentTemplate[] = [
  {
    key: "scout", branch: "template/crm-researcher", name: "Scout", emoji: "🕵️", role: "Sales & Outreach",
    description: "Your dedicated sales partner — researches targets, crafts outreach, and keeps your pipeline moving.",
    capabilities: [
      { label: "Prospect research", detail: "Deep-dives into companies, finds decision-makers, and builds target profiles" },
      { label: "Outreach drafting", detail: "Writes personalized emails and messages tailored to each prospect" },
      { label: "Pipeline tracking", detail: "Keeps your deals organized and flags follow-ups before they slip" },
      { label: "Meeting prep", detail: "Summarizes notes, tracks next steps, and preps you before every call" },
    ],
  },
  {
    key: "ghost", branch: "template/ghostwriter", name: "Ghost", emoji: "👩‍💻", role: "Content Writer",
    description: "Your writing partner — drafts in your voice, researches topics, and keeps your content calendar full.",
    capabilities: [
      { label: "Content drafting", detail: "Writes newsletters, blog posts, and social threads in your voice" },
      { label: "Topic research", detail: "Finds angles, pulls sources, and builds outlines before you write" },
      { label: "Editing & refinement", detail: "Tightens drafts, adjusts tone, and incorporates your feedback" },
      { label: "Calendar planning", detail: "Plans your publishing schedule and tracks what's due next" },
    ],
  },
  {
    key: "chief", branch: "template/chief-of-staff", name: "Chief", emoji: "🦸", role: "Operations",
    description: "Your operations lead — coordinates work, tracks clients, and keeps everything on schedule.",
    capabilities: [
      { label: "Task management", detail: "Breaks down projects, assigns priorities, and tracks progress" },
      { label: "Client tracking", detail: "Keeps accounts organized with status, notes, and next actions" },
      { label: "Blocker alerts", detail: "Surfaces overdue items and bottlenecks before they become problems" },
      { label: "Status updates", detail: "Prepares summaries and reports so you always know where things stand" },
    ],
  },
  {
    key: "researcher", branch: "template/assistant", name: "Researcher", emoji: "🧑‍🔬", role: "Research & Analysis",
    description: "Your research analyst — digs deep into topics, synthesizes findings, and keeps your knowledge organized.",
    capabilities: [
      { label: "Deep research", detail: "Investigates markets, companies, and trends with structured analysis" },
      { label: "Brief creation", detail: "Synthesizes findings into clear, actionable summaries" },
      { label: "Monitoring", detail: "Tracks topics over time and surfaces new developments" },
      { label: "Knowledge organization", detail: "Files research into your knowledge base so nothing gets lost" },
    ],
  },
  {
    key: "assistant", branch: "template/assistant", name: "Assistant", emoji: "🧑‍💼", role: "General Assistant",
    description: "Your right hand — manages tasks, tracks what matters, and handles the day-to-day so you can focus.",
    capabilities: [
      { label: "Task management", detail: "Organizes your to-dos, sets priorities, and tracks deadlines" },
      { label: "Research & writing", detail: "Looks into topics and drafts docs, messages, and quick write-ups" },
      { label: "Project tracking", detail: "Monitors progress across workstreams and flags what needs attention" },
      { label: "Workspace upkeep", detail: "Keeps everything organized, up to date, and easy to find" },
    ],
  },
  {
    key: "cofounder", branch: "template/cofounder", name: "Co-Founder", emoji: "🚀", role: "Strategy & Execution",
    description: "Your strategic operator — helps drive execution, shape direction, and keep the business moving.",
    capabilities: [
      { label: "Strategic planning", detail: "Breaks down big goals into actionable next steps" },
      { label: "Decision support", detail: "Frames trade-offs and surfaces the data you need to decide" },
      { label: "Execution tracking", detail: "Keeps initiatives on track and flags when things stall" },
      { label: "Market awareness", detail: "Monitors competitors, trends, and opportunities" },
    ],
  },
  {
    key: "cmo", branch: "template/cmo", name: "CMO", emoji: "📡", role: "Marketing Strategy",
    description: "Your marketing strategist — designs messaging, plans campaigns, and builds your funnel.",
    capabilities: [
      { label: "Campaign strategy", detail: "Plans multi-channel campaigns aligned to your goals" },
      { label: "Messaging & positioning", detail: "Crafts clear value props that resonate with your audience" },
      { label: "Funnel design", detail: "Maps the journey from awareness to conversion" },
      { label: "Performance analysis", detail: "Tracks what's working and recommends where to double down" },
    ],
  },
  {
    key: "analytics", branch: "template/analytics", name: "Analytics", emoji: "📊", role: "Data & Insights",
    description: "Your performance analyst — turns activity and outcomes into clear metrics and action items.",
    capabilities: [
      { label: "Metric tracking", detail: "Monitors KPIs and highlights meaningful changes" },
      { label: "Trend analysis", detail: "Spots patterns in your data and explains what's driving them" },
      { label: "Reporting", detail: "Builds clear dashboards and summaries for stakeholders" },
      { label: "Recommendations", detail: "Translates insights into specific next steps" },
    ],
  },
  {
    key: "designer", branch: "template/designer", name: "Designer", emoji: "🎨", role: "Visual Design",
    description: "Your visual creator — turns ideas into clear, engaging graphics and polished content.",
    capabilities: [
      { label: "Graphic creation", detail: "Designs social graphics, presentations, and brand assets" },
      { label: "Content formatting", detail: "Polishes docs and decks for a professional look" },
      { label: "Brand consistency", detail: "Keeps your visual identity cohesive across everything" },
      { label: "Creative concepts", detail: "Explores visual directions and translates ideas into layouts" },
    ],
  },
  {
    key: "market-researcher", branch: "template/market-researcher", name: "Market Intel", emoji: "🔮", role: "Market Intelligence",
    description: "Your external intelligence agent — scans markets, spots patterns, and surfaces meaningful signals.",
    capabilities: [
      { label: "Competitive analysis", detail: "Tracks competitors, their moves, and positioning shifts" },
      { label: "Market scanning", detail: "Monitors industry trends and emerging opportunities" },
      { label: "Signal detection", detail: "Surfaces news, funding rounds, and key market events" },
      { label: "Intelligence briefs", detail: "Delivers structured summaries you can act on quickly" },
    ],
  },
];

const INTENT_TO_AGENT_KEY: Record<string, string> = {
  reach: "scout",
  publish: "ghost",
  run: "chief",
  hire: "scout",
  research: "researcher",
  organized: "assistant",
  explore: "assistant",
};

const STEP_LAYOUT: Record<string, "narrow" | "wide"> = {
  welcome: "narrow",
  intent: "narrow",
  infrastructure: "wide",
  provider: "wide",
  agent: "wide",
  account: "narrow",
  payment: "wide",
  provisioning: "narrow",
  launch: "narrow",
};

const OSS_PROGRESS_STEPS = [
  { key: "welcome", label: "You" },
  { key: "intent", label: "Focus" },
  { key: "infrastructure", label: "Setup" },
  { key: "provider", label: "AI" },
  { key: "agent", label: "Agent" },
  { key: "account", label: "Account" },
];

const HOSTED_PROGRESS_STEPS = [
  { key: "welcome", label: "You" },
  { key: "intent", label: "Focus" },
  { key: "provider", label: "AI" },
  { key: "agent", label: "Agent" },
  { key: "launch", label: "Launch" },
];

export interface OnboardingWizardProps {
  isHosted: boolean;
  initialStep?: WizardStep;
  initialData?: WizardData;
}

export function OnboardingWizard({ isHosted, initialStep, initialData }: OnboardingWizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    step,
    data,
    patch,
    advance,
    goTo,
    goBack,
    direction,
    pending,
    startTransition,
    error,
    setError,
    isFirst,
  } = useWizardState({ isHosted, initialStep, initialData });

  const layout = STEP_LAYOUT[step] ?? "narrow";
  const progressSteps = isHosted ? HOSTED_PROGRESS_STEPS : OSS_PROGRESS_STEPS;
  const progressStep = step;

  // Infrastructure state (OSS only)
  const [infraStatus, setInfraStatus] = useState<InfraStatus>({
    db: "idle",
    gateway: "idle",
  });
  const [schemaInstall, setSchemaInstall] = useState<SchemaInstallState>({
    phase: "idle",
  });
  const dbCredsRef = useRef<{ url: string; anonKey: string; serviceRoleKey: string } | null>(null);

  // Provider state
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== "provider") {
      setValidating(false);
      setValidated(false);
      setValidationError(null);
    }
  }, [step]);

  // Agent provisioning state
  const [provisionStatus, setProvisionStatus] = useState<"idle" | "provisioning" | "ready" | "error">("idle");
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Account step error
  const [accountError, setAccountError] = useState<string | null>(null);

  // Celebration screen
  const [showCelebration, setShowCelebration] = useState(false);

  // Hosted payment + provisioning state
  const [hostedEmail, setHostedEmail] = useState<string>("");
  const [hostedWorkspaceId, setHostedWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    if (!isHosted) return;
    getHostedEmail().then((email) => {
      if (email) setHostedEmail(email);
    });
  }, [isHosted]);

  // Handle Stripe return: ?stripe_success=1 means payment went through
  const [resumeAtProvisioning, setResumeAtProvisioning] = useState(false);
  useEffect(() => {
    if (!isHosted) return;
    if (searchParams.get("stripe_success") === "1") {
      setResumeAtProvisioning(true);
      goTo("launch");
      const url = new URL(window.location.href);
      url.searchParams.delete("stripe_success");
      window.history.replaceState({}, "", url.toString());
    }
    if (searchParams.get("stripe_canceled") === "1") {
      goTo("launch");
      const url = new URL(window.location.href);
      url.searchParams.delete("stripe_canceled");
      window.history.replaceState({}, "", url.toString());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dev-only: ?step=provider jumps to that step, ?dbConnected=1 fakes DB connected
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const url = new URL(window.location.href);
    let changed = false;
    const devStep = url.searchParams.get("step") as WizardStep | null;
    if (devStep && ["welcome", "intent", "infrastructure", "provider", "agent", "account", "payment", "provisioning", "launch"].includes(devStep)) {
      goTo(devStep);
      url.searchParams.delete("step");
      changed = true;
    }
    if (url.searchParams.get("dbConnected") === "1") {
      setInfraStatus((s) => ({ ...s, db: "connected" }));
      url.searchParams.delete("dbConnected");
      changed = true;
    }
    if (changed) window.history.replaceState({}, "", url.toString());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ─── Welcome ───
  const handleWelcome = useCallback(
    (vals: { ownerName: string; preferredName: string; workspaceName: string; workspaceSlug: string }) => {
      startTransition(async () => {
        const r = await saveWelcomeStep(vals);
        if (!r.ok) return setError(r.error ?? "Something went wrong");
        patch(vals);
        advance();
      });
    },
    [startTransition, patch, advance, setError],
  );

  // ─── Intent ───
  const handleIntent = useCallback(
    (intentKey: string) => {
      startTransition(async () => {
        const r = await saveIntentStep(intentKey);
        if (!r.ok) return setError(r.error ?? "Something went wrong");
        trackEvent("onboarding_intent_selected", { intent_key: intentKey, is_hosted: isHosted });
        patch({ intentKey, contextPresetKey: intentKey });
        advance();
      });
    },
    [startTransition, patch, advance, setError, isHosted],
  );

  // ─── Infrastructure (OSS) ───
  const handleValidateDb = useCallback(
    (url: string, anonKey: string, serviceRoleKey: string) => {
      setInfraStatus((s) => ({ ...s, db: "validating", dbError: null }));
      setSchemaInstall({ phase: "idle" });
      startTransition(async () => {
        const r = await validateAndConnectDb({ url, anonKey, serviceRoleKey });
        if (!r.ok) {
          setInfraStatus((s) => ({ ...s, db: "error", dbError: r.error }));
          return;
        }
        patch({ supabaseUrl: url, supabaseAnonKey: anonKey, ...(r.workspaceId ? { projectId: r.workspaceId } : {}) });
        if (r.schemaNeeded) {
          dbCredsRef.current = { url, anonKey, serviceRoleKey };
          const prep = await prepareSchemaInstallAction({ url, anonKey, serviceRoleKey });
          setSchemaInstall({
            phase: "needed",
            projectRef: prep.projectRef ?? null,
            sqlEditorUrl: prep.sqlEditorUrl,
            sql: prep.sql,
          });
          setInfraStatus((s) => ({ ...s, db: "schema-needed" }));
        } else {
          trackEvent("onboarding_db_connected", { schema_needed: false });
          setInfraStatus((s) => ({ ...s, db: "connected" }));
        }
      });
    },
    [startTransition, patch],
  );

  const handleRunOneClick = useCallback(
    (region: string, dbPassword: string) => {
      const creds = dbCredsRef.current;
      if (!creds) return;
      const m = creds.url.match(/https?:\/\/([a-z0-9]{20})\.supabase\.co/i);
      const projectRef = schemaInstall.projectRef ?? (m ? m[1] : "");
      if (!projectRef) {
        setSchemaInstall((s) => ({ ...s, phase: "needed", error: "Couldn't determine your Supabase project ref. Use the SQL editor path instead." }));
        return;
      }
      setSchemaInstall((s) => ({ ...s, phase: "running" }));
      startTransition(async () => {
        const r = await runOneClickMigrationAction({ projectRef, region, dbPassword });
        if (r.ok) {
          await saveWorkspaceToRegistry(creds);
          trackEvent("onboarding_db_connected", { schema_needed: true, method: "one_click" });
          setSchemaInstall({ phase: "idle" });
          setInfraStatus((s) => ({ ...s, db: "connected" }));
        } else {
          setSchemaInstall((s) => ({ ...s, phase: "needed", error: r.error, hint: r.hint }));
        }
      });
    },
    [startTransition, schemaInstall.projectRef],
  );

  const handleConfirmSchema = useCallback(() => {
    const creds = dbCredsRef.current;
    if (!creds) return;
    setSchemaInstall((s) => ({ ...s, phase: "confirming" }));
    startTransition(async () => {
      const r = await confirmSchemaInstalledAction(creds);
      if (r.ok) {
        const wsId = await saveWorkspaceToRegistry(creds);
        patch({ projectId: wsId });
        trackEvent("onboarding_db_connected", { schema_needed: true, method: "sql_editor" });
        setSchemaInstall({ phase: "idle" });
        setInfraStatus((s) => ({ ...s, db: "connected" }));
      } else {
        setSchemaInstall((s) => ({ ...s, phase: "needed", error: r.error, hint: r.hint }));
      }
    });
  }, [startTransition]);

  const handleChooseGateway = useCallback(
    (placement: "local" | "remote") => {
      setInfraStatus((s) => ({ ...s, gateway: "starting", gatewayError: null, gatewayManualCmd: undefined, gatewayOneLiner: undefined }));
      startTransition(async () => {
        const r = await setupGateway(placement);
        if (r.ok) {
          setInfraStatus((s) => ({
            ...s,
            gateway: "polling",
            gatewayOneLiner: r.data?.oneLiner,
          }));
          patch({ placement });
          const interval = setInterval(async () => {
            const poll = await import("@/app/onboarding/actions").then((m) => m.pollLocalGateway());
            if (poll.status === "ready") {
              clearInterval(interval);
              setInfraStatus((s) => ({ ...s, gateway: "connected" }));
            }
          }, 3000);
          pollRef.current = interval;
        } else {
          setInfraStatus((s) => ({
            ...s,
            gateway: "error",
            gatewayError: r.error,
            gatewayManualCmd: placement === "local"
              ? "docker compose --profile gateway up -d --pull always --no-build"
              : undefined,
          }));
          patch({ placement });
          const interval = setInterval(async () => {
            const poll = await import("@/app/onboarding/actions").then((m) => m.pollLocalGateway());
            if (poll.status === "ready") {
              clearInterval(interval);
              setInfraStatus((s) => ({ ...s, gateway: "connected", gatewayError: null, gatewayManualCmd: undefined }));
            }
          }, 3000);
          pollRef.current = interval;
        }
      });
    },
    [startTransition, patch],
  );

  const handleInfraContinue = useCallback(() => {
    startTransition(async () => {
      const r = await advanceInfrastructure();
      if (!r.ok) return setError(r.error ?? "Something went wrong");
      advance();
    });
  }, [startTransition, advance, setError]);

  // ─── Provider ───
  const handleProvider = useCallback(
    (provider: string, apiKey: string) => {
      if (isHosted) {
        // Collect-only: store choice and advance
        trackEvent("onboarding_provider_connected", { provider, is_hosted: true });
        patch({ providerId: provider, providerApiKey: apiKey });
        advance();
        return;
      }
      setValidating(true);
      setValidationError(null);
      startTransition(async () => {
        const r = await connectProvider(provider, apiKey);
        setValidating(false);
        if (r.ok) {
          trackEvent("onboarding_provider_connected", { provider, is_hosted: isHosted });
          setValidated(true);
          patch({ providerId: provider });
          setTimeout(() => advance(), 600);
        } else {
          setValidationError(r.error ?? "Could not validate key");
        }
      });
    },
    [isHosted, startTransition, patch, advance],
  );

  // ─── Agent ───
  const getRecommendedKey = (): string => {
    const intentKey = (data.intentKey as string) ?? "organized";
    return INTENT_TO_AGENT_KEY[intentKey] ?? "assistant";
  };

  // Hosted collect-only: just store agent choices and advance to launch
  const handleAgentCollect = useCallback(
    (agentData: { name: string; emoji: string; templateBranch: string }) => {
      patch({
        agentName: agentData.name,
        agentEmoji: agentData.emoji,
        agentTemplateBranch: agentData.templateBranch,
      });
      advance();
    },
    [patch, advance],
  );

  const handleCreateAgent = useCallback(
    async (agentData: { name: string; emoji: string; templateBranch: string }) => {
      const r = await createFirstAgent({ ...agentData, providerId: data.providerId });
      if (!r.ok || !r.data) {
        setError(r.error ?? "Failed to create agent");
        return null;
      }

      const { agentId, provisionCommandId } = r.data;
      trackEvent("onboarding_agent_created", {
        agent_id: agentId,
        agent_name: agentData.name,
        template_branch: agentData.templateBranch,
      });
      patch({ agentId, agentName: agentData.name, agentEmoji: agentData.emoji });
      setProvisionStatus("provisioning");

      if (provisionCommandId) {
        const startedAt = Date.now();
        const interval = setInterval(async () => {
          const status = await pollAgentProvisionStatus(provisionCommandId);
          if (status === "completed") {
            clearInterval(interval);
            setProvisionStatus("ready");
          } else if (status === "error") {
            clearInterval(interval);
            setProvisionStatus("error");
            setProvisionError("Agent provisioning failed");
          } else if (Date.now() - startedAt > 120_000) {
            clearInterval(interval);
            setProvisionStatus("ready");
          }
        }, 3000);
        pollRef.current = interval;
      }

      return { agentId, provisionCommandId };
    },
    [patch, setError, data.providerId],
  );

  const handleSignOut = useCallback(async () => {
    await signOutFromOnboarding();
    if (isHosted) {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      await supabase.auth.signOut();
    }
    router.push(isHosted ? "/auth" : "/login");
    router.refresh();
  }, [isHosted, router]);

  const navigateToTasks = useCallback(() => {
    clearWizardSession();
    markOnboardingComplete().catch(() => {});
    trackEvent("onboarding_completed", {
      intent_key: (data.intentKey as string) ?? null,
      is_hosted: isHosted,
      agent_id: (data.agentId as string) ?? null,
    });

    const progress = localStorage.getItem("hq_onboarding_progress");
    const parsed = progress ? JSON.parse(progress) : {};
    parsed.wizardCompleted = true;
    localStorage.setItem("hq_onboarding_progress", JSON.stringify(parsed));
    window.dispatchEvent(new CustomEvent("hq:onboarding-progress"));

    completeItem("agentCreated");

    const intentKey = (data.intentKey as string) ?? "organized";
    const suggestion = FIRST_TASK_SUGGESTIONS[intentKey];
    const params = new URLSearchParams({ onboarding: "first-task" });
    if (suggestion) params.set("title", suggestion.title);
    if (data.agentId) params.set("agent", data.agentId as string);
    router.push(`/dashboard/tasks?${params.toString()}`);
  }, [data.intentKey, data.agentId, router, isHosted]);

  const handleAgentDone = useCallback(() => {
    // OSS: advance to account step
    advance();
  }, [advance]);

  // Auto-advance once agent provisioning finishes (OSS only — hosted uses launch step)
  const agentDoneFired = useRef(false);
  useEffect(() => {
    if (isHosted) return;
    if (step !== "agent") return;
    if (agentDoneFired.current) return;
    if (provisionStatus === "ready" || provisionStatus === "error") {
      agentDoneFired.current = true;
      const timer = setTimeout(handleAgentDone, 800);
      return () => clearTimeout(timer);
    }
  }, [isHosted, step, provisionStatus, handleAgentDone]);

  // ─── Payment (Hosted) ───
  const handlePaymentCheckout = useCallback(
    async (email: string) => {
      const result = await createHostedCheckout({
        email,
        ownerName: (data.ownerName as string) || "",
        workspaceLabel: (data.workspaceName as string) || "My Workspace",
        workspaceEmoji: "🏠",
        contextPreset: (data.intentKey as string) || "other",
      });
      setHostedWorkspaceId(result.workspaceId);
      patch({ hostedWorkspaceId: result.workspaceId });
      window.location.href = result.url;
    },
    [data.ownerName, data.workspaceName, data.intentKey, patch],
  );

  // ─── Launch complete (Hosted) ───
  const [needsManualLogin, setNeedsManualLogin] = useState(false);

  const handleLaunchComplete = useCallback(
    (opts: { needsManualLogin: boolean; agentId?: string }) => {
      if (opts.agentId) {
        patch({ agentId: opts.agentId });
      }
      if (opts.needsManualLogin) {
        setNeedsManualLogin(true);
      }
      markOnboardingComplete().catch(() => {});
      setShowCelebration(true);
    },
    [patch],
  );

  // Legacy: kept for OSS provisioning if needed in future
  const handleProvisionComplete = useCallback(
    async (tokenHash: string | null, tokenType: string) => {
      if (tokenHash) {
        const result = await verifyAutoLogin(tokenHash, tokenType as "magiclink" | "email");
        if (!result.ok) {
          const hostedEmail = await getHostedEmail().catch(() => null);
          if (hostedEmail) {
            await sendFreshLoginLink(hostedEmail).catch(() => {});
          }
          setNeedsManualLogin(true);
        }
      }
      advance();
    },
    [advance],
  );

  // ─── Account (OSS only) ───
  const handleAccount = useCallback(
    (creds: { email: string; password: string }) => {
      setAccountError(null);
      startTransition(async () => {
        const r = await createAccountAndFinalize(creds);
        if (!r.ok) {
          setAccountError(r.error ?? "Something went wrong");
          return;
        }

        // Sign in client-side so the dashboard layout's getUser() finds a session.
        // The root layout's HqConfigProvider was rendered before the workspace existed,
        // so createClient() returns a placeholder. Build the client directly from
        // wizard state instead.
        let signedIn = false;
        const wsUrl = data.supabaseUrl as string | undefined;
        const wsAnonKey = data.supabaseAnonKey as string | undefined;
        const wsId = data.projectId as string | undefined;
        if (wsUrl && wsAnonKey && wsId) {
          try {
            const { createBrowserClient } = await import("@supabase/ssr");
            const { setHqConfig } = await import("@/lib/workspaces/hq-config-provider");
            setHqConfig({
              workspaceId: wsId,
              url: wsUrl,
              anonKey: wsAnonKey,
              label: data.workspaceName as string ?? "My workspace",
              emoji: "🏠",
            });
            const supabase = createBrowserClient(wsUrl, wsAnonKey, {
              cookieOptions: { name: `hq-${wsId.slice(0, 8)}` },
            });
            const { error: signInError } = await supabase.auth.signInWithPassword({
              email: creds.email,
              password: creds.password,
            });
            signedIn = !signInError;
          } catch {
            // Fall through — user will be asked to sign in manually
          }
        }

        identifyUser(creds.email, { email: creds.email });

        if (!signedIn) {
          setNeedsManualLogin(true);
        }
        setShowCelebration(true);
      });
    },
    [startTransition, data.supabaseUrl, data.supabaseAnonKey, data.projectId, data.workspaceName],
  );

  // ─── Render ───
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background to-background/95">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/40 px-5 lg:h-16 lg:px-8">
        <div className="flex items-center gap-2">
          {!isFirst && step !== "provisioning" && !(isHosted && step === "launch" && resumeAtProvisioning) && (
            <button
              type="button"
              onClick={goBack}
              aria-label="Go back"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
          )}
          <HqLogo size={24} className="text-foreground" />
        </div>
        <div className="flex flex-1 justify-center px-4 md:px-8">
          <WizardProgress steps={progressSteps} currentStep={progressStep} />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          >
            <LogOut className="h-3 w-3" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* Content */}
      <main
        className={cn(
          "flex flex-1 justify-center overflow-y-auto px-5 pb-24 lg:px-8",
          showCelebration
            ? "items-center"
            : layout === "narrow"
              ? "items-center"
              : "items-start",
        )}
      >
        {showCelebration ? (
          <div className="w-full max-w-lg">
            <StepCelebration
              workspaceName={data.workspaceName as string | undefined}
              agentName={data.agentName as string | undefined}
              agentEmoji={data.agentEmoji as string | undefined}
              needsManualLogin={needsManualLogin}
              isHosted={isHosted}
              onContinue={needsManualLogin ? () => window.location.assign(isHosted ? "/auth" : "/login") : navigateToTasks}
            />
          </div>
        ) : (
          <div
            className={cn(
              layout === "narrow"
                ? "w-full max-w-lg"
                : "w-full max-w-3xl",
              layout === "wide" && "pt-8",
            )}
          >
            {error && (
              <div className="mb-5 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[12px] text-destructive animate-in fade-in duration-200">
                <span className="flex-1">{error}</span>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="shrink-0 p-0.5 rounded text-destructive/60 hover:text-destructive transition-colors"
                  aria-label="Dismiss error"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            <div
              key={step}
              className={cn(
                "animate-in fade-in duration-300",
                direction === "forward"
                  ? "slide-in-from-right-4"
                  : "slide-in-from-left-4",
              )}
            >
              {step === "welcome" && (
                <StepWelcome
                  initialName={data.ownerName}
                  subtitle={
                    isHosted
                      ? "Set up your workspace in a few quick steps."
                      : "Set up your workspace in a few steps. Takes about 10 minutes."
                  }
                  onSubmit={handleWelcome}
                  pending={pending}
                />
              )}

              {step === "intent" && (
                <StepIntent
                  ownerName={data.ownerName ?? ""}
                  initialKey={data.intentKey}
                  onSubmit={handleIntent}
                  pending={pending}
                />
              )}

              {step === "infrastructure" && (
                <StepInfrastructure
                  status={infraStatus}
                  schemaInstall={schemaInstall}
                  onValidateDb={handleValidateDb}
                  onRunOneClick={handleRunOneClick}
                  onConfirmSchema={handleConfirmSchema}
                  onChooseGateway={handleChooseGateway}
                  onContinue={handleInfraContinue}
                  pending={pending}
                />
              )}

              {step === "provider" && (
                <StepProvider
                  onSubmit={handleProvider}
                  pending={pending}
                  validating={validating}
                  validated={validated}
                  validationError={validationError}
                  isHosted={isHosted}
                  collectOnly={isHosted}
                />
              )}

              {step === "agent" && (
                <StepAgent
                  roster={AGENT_ROSTER}
                  recommendedKey={getRecommendedKey()}
                  onCreateAgent={isHosted ? undefined : handleCreateAgent}
                  onContinue={isHosted ? handleAgentCollect : undefined}
                  collectOnly={isHosted}
                  provisionStatus={isHosted ? undefined : provisionStatus}
                  provisionError={isHosted ? undefined : provisionError}
                  pending={pending}
                />
              )}

              {step === "account" && (
                <StepAccount
                  ownerName={data.preferredName ?? data.ownerName}
                  agentName={data.agentName as string | undefined}
                  agentEmoji={data.agentEmoji as string | undefined}
                  onSubmit={handleAccount}
                  pending={pending}
                  error={accountError}
                />
              )}

              {step === "launch" && (
                <StepLaunch
                  ownerName={(data.ownerName as string) ?? ""}
                  workspaceName={(data.workspaceName as string) ?? "My Workspace"}
                  intentKey={(data.intentKey as string) ?? "organized"}
                  email={hostedEmail}
                  providerId={(data.providerId as string) ?? ""}
                  providerApiKey={(data.providerApiKey as string) ?? ""}
                  agentName={(data.agentName as string) ?? (AGENT_ROSTER.find(a => a.key === getRecommendedKey()) ?? AGENT_ROSTER[0]).name}
                  agentEmoji={(data.agentEmoji as string) ?? (AGENT_ROSTER.find(a => a.key === getRecommendedKey()) ?? AGENT_ROSTER[0]).emoji}
                  agentTemplateBranch={(data.agentTemplateBranch as string) ?? (AGENT_ROSTER.find(a => a.key === getRecommendedKey()) ?? AGENT_ROSTER[0]).branch}
                  hostedWorkspaceId={hostedWorkspaceId || (data.hostedWorkspaceId as string) || null}
                  resumeAtProvisioning={resumeAtProvisioning}
                  onComplete={handleLaunchComplete}
                  onPatch={patch}
                />
              )}

              {step === "payment" && (
                <StepPayment
                  ownerName={(data.ownerName as string) ?? ""}
                  workspaceLabel={(data.workspaceName as string) ?? "My Workspace"}
                  intentKey={(data.intentKey as string) ?? "other"}
                  email={hostedEmail}
                  onCheckout={handlePaymentCheckout}
                  pending={pending}
                />
              )}

              {step === "provisioning" && (
                <StepProvisioning
                  workspaceId={hostedWorkspaceId || (data.hostedWorkspaceId as string) || ""}
                  onComplete={handleProvisionComplete}
                />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

