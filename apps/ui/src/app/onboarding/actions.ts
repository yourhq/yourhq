"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { addProject } from "@/lib/projects/registry";
import {
  ACTIVE_PROJECT_COOKIE,
  ACTIVE_PROJECT_COOKIE_OPTIONS,
} from "@/lib/projects/cookie";

const inputSchema = z.object({
  label: z.string().min(1).max(80),
  emoji: z.string().min(1).max(8).default("🏠"),
  url: z.string().url(),
  anonKey: z.string().min(20),
  serviceRoleKey: z.string().min(20),
});

export interface OnboardingResult {
  ok: boolean;
  error?: string;
  hint?: string;
}

/**
 * Validates the provided Supabase credentials end-to-end:
 *   1. URL is reachable.
 *   2. Anon key authenticates (Supabase returns the workspace table info
 *      rather than a 401).
 *   3. Service role key authenticates.
 *   4. The workspace table exists — proves the user ran the migration.
 *
 * Returns a precise error message and a hint when something fails so the
 * onboarding UI can show an actionable next step.
 */
async function validateCredentials(input: {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}): Promise<OnboardingResult> {
  const base = input.url.replace(/\/$/, "");

  // Anon-key reachability check: just hit the PostgREST root with the
  // anon key. Supabase responds with OK regardless of whether tables
  // exist, as long as the key matches.
  try {
    const res = await fetch(`${base}/rest/v1/`, {
      headers: {
        apikey: input.anonKey,
        Authorization: `Bearer ${input.anonKey}`,
      },
    });
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: "Anon key rejected by Supabase.",
        hint: "Double-check the anon key in Supabase → Project Settings → API.",
      };
    }
    if (!res.ok && res.status !== 404) {
      return {
        ok: false,
        error: `Supabase returned ${res.status} for the base URL.`,
        hint: "Verify the project URL is correct and the project is not paused.",
      };
    }
  } catch (e) {
    return {
      ok: false,
      error: `Could not reach ${base}: ${(e as Error).message}`,
      hint: "Check the URL and your network connection.",
    };
  }

  // Service role reachability — same endpoint, different key.
  try {
    const res = await fetch(`${base}/rest/v1/`, {
      headers: {
        apikey: input.serviceRoleKey,
        Authorization: `Bearer ${input.serviceRoleKey}`,
      },
    });
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: "Service role key rejected by Supabase.",
        hint: "Double-check the service_role secret in Supabase → Project Settings → API.",
      };
    }
  } catch (e) {
    return {
      ok: false,
      error: `Service role check failed: ${(e as Error).message}`,
    };
  }

  // Schema check — does the `workspace` table exist? If not, the migration
  // hasn't been run.
  try {
    const res = await fetch(`${base}/rest/v1/workspace?select=id&limit=1`, {
      headers: {
        apikey: input.serviceRoleKey,
        Authorization: `Bearer ${input.serviceRoleKey}`,
      },
    });
    if (res.status === 404) {
      return {
        ok: false,
        error: "The workspace table doesn't exist in this project.",
        hint:
          "Run db/migrations/001_schema.sql in your Supabase SQL editor " +
          "before connecting. See docs/INSTALL.md → Supabase.",
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: `Schema check returned ${res.status}.`,
        hint: "The migration may be incomplete. Re-run db/migrations/001_schema.sql.",
      };
    }
  } catch (e) {
    return {
      ok: false,
      error: `Schema check failed: ${(e as Error).message}`,
    };
  }

  return { ok: true };
}

/**
 * Called from the onboarding form. Validates, saves to the registry,
 * sets the active-project cookie, redirects to the dashboard.
 */
export async function connectProject(formData: FormData): Promise<OnboardingResult> {
  const rawInput = {
    label: String(formData.get("label") ?? "").trim(),
    emoji: String(formData.get("emoji") ?? "🏠").trim(),
    url: String(formData.get("url") ?? "").trim(),
    anonKey: String(formData.get("anonKey") ?? "").trim(),
    serviceRoleKey: String(formData.get("serviceRoleKey") ?? "").trim(),
  };

  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { ok: false, error: `Invalid input — ${msg}` };
  }

  const validation = await validateCredentials({
    url: parsed.data.url,
    anonKey: parsed.data.anonKey,
    serviceRoleKey: parsed.data.serviceRoleKey,
  });
  if (!validation.ok) {
    return validation;
  }

  const project = await addProject({
    label: parsed.data.label,
    emoji: parsed.data.emoji,
    url: parsed.data.url,
    anonKey: parsed.data.anonKey,
    serviceRoleKey: parsed.data.serviceRoleKey,
    makeDefault: true,
  });

  const jar = await cookies();
  jar.set(ACTIVE_PROJECT_COOKIE, project.id, ACTIVE_PROJECT_COOKIE_OPTIONS);

  // Redirect to /login — onboarding set up the Supabase connection, but
  // the user still has to sign into Supabase auth.
  redirect("/login");
}
