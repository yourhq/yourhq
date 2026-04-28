// Connection — a single provider auth profile stored on a gateway.
//
// The auth store is owned by openclaw on the gateway host (it lives at
// $OPENCLAW_STATE_DIR/agents/<id>/agent/auth-profiles.json). The UI never
// touches that file directly; it issues commands that the runner
// translates into `openclaw models auth …` invocations and parses the
// JSON output back into this shape.

export type AuthShape =
  | "api_key" // Paste a key. One field, no browser.
  | "oauth_paste" // CLI prints a URL → user pastes redirect URL/code back.
  | "device_code" // CLI prints URL + short code → user enters code at URL → CLI polls.
  | "cli_reuse" // Reuses an existing CLI login on the gateway host (Claude CLI, gcloud).
  | "local_url"; // Just a base URL ± optional token. Ollama, LM Studio, vLLM.

export type ConnectionStatus =
  | "ok" // Probed live, working.
  | "expiring" // Token expires within ~24h.
  | "expired" // Token past its expiry.
  | "missing_credential" // Profile exists in name only — no usable secret.
  | "invalid" // Failed validation (bad key, network error during probe).
  | "unknown"; // Not yet probed.

export interface Connection {
  /** Stable id of the form `<provider>:<profileName>`. */
  id: string;
  /** Provider key — matches the catalog entry. */
  provider: string;
  /** Profile name (defaults to "default"). Multiple profiles per provider allowed. */
  profileName: string;
  /** Gateway this profile lives on. */
  gatewayId: string;
  /** Live status from `models status --probe`. */
  status: ConnectionStatus;
  /** Reason code (`expired`, `missing_credential`, etc.) if status != ok. */
  statusReason?: string;
  /** ISO8601 if the credential reports expiry. */
  expiresAt?: string;
  /** ISO8601 of when the runner last ran the probe. */
  lastCheckedAt?: string;
  /** Whether this profile is the gateway's default for new agents. */
  isDefault: boolean;
}

// ─── Provider catalog ────────────────────────────────────────────────
// One entry per `--provider` id openclaw accepts. We bake the table in
// rather than introspecting at runtime because:
//   - openclaw's `--help` output isn't structured enough to derive
//     auth shape reliably, and a reverse-engineered parser is fragile.
//   - The list grows ~once per provider release; trivial to keep up.
//   - It lets the UI render provider icons and helpful copy without a
//     round-trip through the gateway.

export interface ProviderCatalogEntry {
  /** The string passed to `openclaw --provider`. */
  id: string;
  displayName: string;
  /** What the user sees when picking. */
  category: "recommended" | "open_models" | "all";
  authShape: AuthShape;
  /**
   * Optional fallback shape — Codex defaults to oauth_paste but supports
   * device_code via `--device-code`. The dialog offers a toggle if set.
   */
  alternateShape?: AuthShape;
  /** URL to the provider's signup / API key page, shown as helper link. */
  helpUrl?: string;
  /** Env var fallback (informational — we always write to the auth store). */
  envVar?: string;
  /** One-line tagline shown under the display name in the picker. */
  blurb?: string;
}

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  // ── Recommended (the four most users will pick) ───────────────────
  {
    id: "anthropic",
    displayName: "Anthropic",
    category: "recommended",
    authShape: "api_key",
    helpUrl: "https://console.anthropic.com/settings/keys",
    envVar: "ANTHROPIC_API_KEY",
    blurb: "Claude — Sonnet, Opus, Haiku.",
  },
  {
    id: "openai",
    displayName: "OpenAI (API key)",
    category: "recommended",
    authShape: "api_key",
    helpUrl: "https://platform.openai.com/api-keys",
    envVar: "OPENAI_API_KEY",
    blurb: "GPT models via the OpenAI Platform. Pay-as-you-go.",
  },
  {
    id: "openai-codex",
    displayName: "OpenAI Codex (ChatGPT)",
    category: "recommended",
    authShape: "oauth_paste",
    alternateShape: "device_code",
    helpUrl: "https://chat.openai.com",
    blurb: "Use your ChatGPT/Codex subscription instead of an API key.",
  },
  {
    id: "google",
    displayName: "Google Gemini",
    category: "recommended",
    authShape: "api_key",
    helpUrl: "https://aistudio.google.com/app/apikey",
    envVar: "GEMINI_API_KEY",
    blurb: "Gemini models via Google AI Studio.",
  },

  // ── Open weights / local ─────────────────────────────────────────
  {
    id: "ollama",
    displayName: "Ollama",
    category: "open_models",
    authShape: "local_url",
    helpUrl: "https://ollama.com/download",
    blurb: "Run models on your own machine. No API key needed for local hosts.",
  },
  {
    id: "lmstudio",
    displayName: "LM Studio",
    category: "open_models",
    authShape: "local_url",
    helpUrl: "https://lmstudio.ai/",
    blurb: "Local model server with a desktop UI.",
  },
  {
    id: "vllm",
    displayName: "vLLM",
    category: "open_models",
    authShape: "local_url",
    helpUrl: "https://docs.vllm.ai/",
    blurb: "Self-hosted inference server.",
  },
  {
    id: "sglang",
    displayName: "SGLang",
    category: "open_models",
    authShape: "local_url",
    helpUrl: "https://docs.sglang.ai/",
    blurb: "Self-hosted inference server.",
  },

  // ── All other providers (api key, alphabetical) ──────────────────
  {
    id: "github-copilot",
    displayName: "GitHub Copilot",
    category: "all",
    authShape: "device_code",
    helpUrl: "https://docs.github.com/en/copilot",
    blurb: "Sign in with GitHub, uses your Copilot subscription.",
  },
  {
    id: "deepseek",
    displayName: "DeepSeek",
    category: "all",
    authShape: "api_key",
    helpUrl: "https://platform.deepseek.com/",
    envVar: "DEEPSEEK_API_KEY",
  },
  {
    id: "mistral",
    displayName: "Mistral",
    category: "all",
    authShape: "api_key",
    helpUrl: "https://console.mistral.ai/",
    envVar: "MISTRAL_API_KEY",
  },
  {
    id: "groq",
    displayName: "Groq",
    category: "all",
    authShape: "api_key",
    helpUrl: "https://console.groq.com/keys",
    envVar: "GROQ_API_KEY",
  },
  {
    id: "xai",
    displayName: "xAI (Grok)",
    category: "all",
    authShape: "api_key",
    helpUrl: "https://console.x.ai/",
    envVar: "XAI_API_KEY",
  },
  {
    id: "openrouter",
    displayName: "OpenRouter",
    category: "all",
    authShape: "api_key",
    helpUrl: "https://openrouter.ai/keys",
    envVar: "OPENROUTER_API_KEY",
    blurb: "Single API for many models. Useful as a fallback.",
  },
  {
    id: "together",
    displayName: "Together",
    category: "all",
    authShape: "api_key",
    helpUrl: "https://api.together.ai/",
    envVar: "TOGETHER_API_KEY",
  },
  {
    id: "fireworks",
    displayName: "Fireworks",
    category: "all",
    authShape: "api_key",
    helpUrl: "https://fireworks.ai/",
    envVar: "FIREWORKS_API_KEY",
  },
  {
    id: "cerebras",
    displayName: "Cerebras",
    category: "all",
    authShape: "api_key",
    helpUrl: "https://cloud.cerebras.ai/",
    envVar: "CEREBRAS_API_KEY",
  },
  {
    id: "perplexity",
    displayName: "Perplexity",
    category: "all",
    authShape: "api_key",
    helpUrl: "https://www.perplexity.ai/settings/api",
    envVar: "PERPLEXITY_API_KEY",
  },
  {
    id: "huggingface",
    displayName: "Hugging Face",
    category: "all",
    authShape: "api_key",
    helpUrl: "https://huggingface.co/settings/tokens",
    envVar: "HF_TOKEN",
  },
  {
    id: "deepinfra",
    displayName: "DeepInfra",
    category: "all",
    authShape: "api_key",
    helpUrl: "https://deepinfra.com/dash/api_keys",
    envVar: "DEEPINFRA_API_KEY",
  },
  {
    id: "moonshot",
    displayName: "Moonshot (Kimi)",
    category: "all",
    authShape: "api_key",
    helpUrl: "https://platform.moonshot.cn/",
    envVar: "MOONSHOT_API_KEY",
  },
  {
    id: "qwen",
    displayName: "Qwen",
    category: "all",
    authShape: "api_key",
    helpUrl: "https://dashscope.console.aliyun.com/",
    envVar: "DASHSCOPE_API_KEY",
  },
  {
    id: "zai",
    displayName: "Z.AI (GLM)",
    category: "all",
    authShape: "api_key",
    helpUrl: "https://open.bigmodel.cn/",
    envVar: "ZAI_API_KEY",
  },
  {
    id: "minimax",
    displayName: "MiniMax (API key)",
    category: "all",
    authShape: "api_key",
    helpUrl: "https://www.minimaxi.com/",
    envVar: "MINIMAX_API_KEY",
  },
  {
    id: "minimax-portal",
    displayName: "MiniMax (Coding Plan)",
    category: "all",
    authShape: "oauth_paste",
    helpUrl: "https://www.minimaxi.com/",
    blurb: "OAuth via your MiniMax Coding Plan subscription.",
  },
  {
    id: "google-gemini-cli",
    displayName: "Gemini CLI",
    category: "all",
    authShape: "oauth_paste",
    helpUrl: "https://github.com/google-gemini/gemini-cli",
    blurb: "Use a Google account login instead of an API key.",
  },
];

export function getProviderCatalog(id: string): ProviderCatalogEntry | undefined {
  return PROVIDER_CATALOG.find((p) => p.id === id);
}

export const CONNECTION_STATUS_META: Record<
  ConnectionStatus,
  { label: string; color: string; description: string }
> = {
  ok: {
    label: "Healthy",
    color: "var(--status-success)",
    description: "Last probe succeeded.",
  },
  expiring: {
    label: "Expires soon",
    color: "var(--status-warning)",
    description: "Token expires within 24 hours. Re-authenticate to refresh.",
  },
  expired: {
    label: "Expired",
    color: "var(--status-error)",
    description: "Token has expired. Re-authenticate to use this provider.",
  },
  missing_credential: {
    label: "Not configured",
    color: "var(--status-warning)",
    description: "Profile exists but has no usable credential.",
  },
  invalid: {
    label: "Failed",
    color: "var(--status-error)",
    description: "Probe failed. Check the credential or provider availability.",
  },
  unknown: {
    label: "Unknown",
    color: "var(--status-neutral)",
    description: "No probe yet. Click Refresh to check.",
  },
};

// Used by the runner to encode interactive command states. UI watches
// the `payload.connection_state` field on agent_commands rows.
export type ConnectionCommandState =
  | { stage: "starting" }
  | { stage: "url_ready"; url: string; verificationCode?: string }
  | { stage: "polling"; url: string; verificationCode?: string }
  | { stage: "completed"; profileId: string }
  | { stage: "failed"; error: string };
