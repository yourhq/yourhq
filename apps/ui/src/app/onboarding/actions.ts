"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { addProject } from "@/lib/projects/registry";
import {
  ACTIVE_PROJECT_COOKIE,
  ACTIVE_PROJECT_COOKIE_OPTIONS,
} from "@/lib/projects/cookie";
import { validateSupabaseCreds } from "@/lib/projects/validate";

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

  const validation = await validateSupabaseCreds({
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
