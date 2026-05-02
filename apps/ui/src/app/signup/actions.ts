"use server";

import { redirect } from "next/navigation";
import { WORKER_URL, workerHeaders } from "@/lib/worker-client";

export async function createCheckoutAction(formData: FormData): Promise<void> {
  const email = formData.get("email") as string;
  const ownerName = (formData.get("ownerName") as string) || "";
  const label = (formData.get("label") as string) || "My Workspace";
  const emoji = (formData.get("emoji") as string) || "🏠";
  const contextPreset = (formData.get("contextPreset") as string) || "other";

  if (!email) throw new Error("Email is required");
  if (!ownerName) throw new Error("Name is required");

  const res = await fetch(`${WORKER_URL}/checkout`, {
    method: "POST",
    headers: workerHeaders(),
    body: JSON.stringify({
      email,
      ownerName,
      workspaceLabel: label,
      workspaceEmoji: emoji,
      contextPreset,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Checkout failed: ${body}`);
  }

  const { url } = (await res.json()) as { url: string };
  redirect(url);
}
