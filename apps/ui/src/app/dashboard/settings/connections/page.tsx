// Settings → Connections (placeholder).
//
// The full UI lands in Phase 3.4: a flat list of provider auth profiles
// (Codex OAuth, Anthropic API key, Gemini, etc.) with add/remove/refresh
// flows, all driven by openclaw via the agent_commands queue.
//
// For now this page exists so the IA slot is visible from the settings
// index and onboarding can link to it. The body explains the gap and
// shows the manual command to bridge it.

import { Plug, Terminal } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";

export const dynamic = "force-dynamic";

export default function ConnectionsSettingsPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Plug className="h-4 w-4" />}
        title="Connections"
        description="AI model providers your agents use to think."
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-2xl px-5 py-5 space-y-5">
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-start gap-2.5">
              <Plug className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <div className="space-y-1.5">
                <div className="text-[13px] font-medium">
                  Browser-based provider setup is shipping shortly
                </div>
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  This page will let you connect Claude, GPT, Gemini, and
                  other providers right from the browser — including OAuth
                  flows that don&apos;t require pasting an API key. Until
                  then, set up your model provider on the gateway machine
                  using the command below.
                </p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Manual setup (one-time)
            </h2>
            <div className="space-y-3 rounded-md border border-border/60 bg-card p-4">
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <Terminal className="h-3.5 w-3.5" />
                Run on the machine your gateway is installed on:
              </div>
              <pre className="overflow-auto rounded-md border border-border/60 bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground">
{`# Connect Codex (recommended — interactive OAuth, no key to paste)
docker compose exec gateway \\
  openclaw models auth login --provider openai-codex --set-default`}
              </pre>
              <p className="text-[11px] text-muted-foreground">
                Other providers:{" "}
                <code className="rounded bg-muted px-1 font-mono text-[10px]">
                  anthropic
                </code>
                {" · "}
                <code className="rounded bg-muted px-1 font-mono text-[10px]">
                  gemini
                </code>
                {" · "}
                <code className="rounded bg-muted px-1 font-mono text-[10px]">
                  github-copilot
                </code>
                {" · "}
                <code className="rounded bg-muted px-1 font-mono text-[10px]">
                  z-ai
                </code>{" "}
                — same command, different{" "}
                <code className="rounded bg-muted px-1 font-mono text-[10px]">
                  --provider
                </code>{" "}
                value.
              </p>
              <p className="text-[11px] text-muted-foreground/70">
                The command opens a URL in your terminal. Visit it in a
                browser, sign in, paste the redirect URL back into the
                terminal. Done.
              </p>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Check what&apos;s configured
            </h2>
            <div className="space-y-3 rounded-md border border-border/60 bg-card p-4">
              <pre className="overflow-auto rounded-md border border-border/60 bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground">
{`docker compose exec gateway \\
  openclaw models status --json`}
              </pre>
              <p className="text-[11px] text-muted-foreground">
                Shows which providers are connected and which one is the
                default for new agents.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
