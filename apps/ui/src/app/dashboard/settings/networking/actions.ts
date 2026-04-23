"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setUiOrigins } from "@/lib/projects/registry";
import { uiOriginSchema } from "@/lib/projects/schema";
import { detectTailscale } from "@/lib/tailscale/detect";

const saveSchema = z.object({
  projectId: z.string().uuid(),
  origins: z.array(uiOriginSchema),
});

export async function saveOrigins(input: z.infer<typeof saveSchema>) {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  await setUiOrigins(parsed.data.projectId, parsed.data.origins);
  revalidatePath("/dashboard/settings/networking");
  return { ok: true };
}

export async function refreshTailscaleStatus() {
  const s = await detectTailscale();
  return {
    installed: s.installed,
    loggedIn: s.loggedIn,
    selfIp: s.selfIp,
    magicDnsName: s.magicDnsName,
    selfHostname: s.selfHostname,
    error: s.error,
  };
}
