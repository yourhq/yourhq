"use server";

import { redirect } from "next/navigation";
import { workerFetch } from "@/lib/worker-client";

export async function createCheckoutAction(formData: FormData): Promise<void> {
  const email = formData.get("email") as string;
  const ownerName = (formData.get("ownerName") as string) || "";
  const label = (formData.get("label") as string) || "My Workspace";
  const emoji = (formData.get("emoji") as string) || "🏠";
  const contextPreset = (formData.get("contextPreset") as string) || "other";

  if (!email) throw new Error("Email is required");
  if (!ownerName) throw new Error("Name is required");

  let res: Response;
  try {
    res = await workerFetch("/checkout", {
      method: "POST",
      body: JSON.stringify({
        email,
        ownerName,
        workspaceLabel: label,
        workspaceEmoji: emoji,
        contextPreset,
      }),
    });
  } catch {
    throw new Error("Unable to reach the checkout service. Please try again in a moment.");
  }

  if (!res.ok) {
    throw new Error("Something went wrong starting checkout. Please try again.");
  }

  const data = (await res.json()) as { url?: string };
  if (!data.url) {
    throw new Error("Checkout session could not be created. Please try again.");
  }
  redirect(data.url);
}
