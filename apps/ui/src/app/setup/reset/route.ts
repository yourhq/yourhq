// DEV ONLY: Reset workspace to un-initialized state and redirect to /setup.
// Visit /setup/reset to trigger. Clears all wizard-seeded data.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 });
  }

  const supabase = await createClient();

  // Clear wizard-seeded rows so re-running doesn't hit unique constraints
  await supabase.from("pipeline_stages").delete().neq("id", "");
  await supabase.from("field_definitions").delete().neq("id", "");
  await supabase.from("streams").delete().neq("id", "");

  await supabase
    .from("workspace")
    .update({ initialized: false })
    .neq("id", "00000000-0000-0000-0000-000000000000");

  redirect("/setup");
}
