const SUPABASE_MGMT_URL = "https://api.supabase.com";

function mgmtHeaders(): Record<string, string> {
  const token = process.env.SUPABASE_MANAGEMENT_API_TOKEN;
  if (!token) throw new Error("SUPABASE_MANAGEMENT_API_TOKEN required");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export { SUPABASE_MGMT_URL, mgmtHeaders };

export async function deleteSupabaseProject(projectRef: string): Promise<void> {
  const res = await fetch(`${SUPABASE_MGMT_URL}/v1/projects/${projectRef}`, {
    method: "DELETE",
    headers: mgmtHeaders(),
  });

  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(
      `Supabase project deletion failed (${res.status}): ${body}`,
    );
  }
}
