import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: gatewayId } = await params;

  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("gateways")
    .select("label, meta")
    .eq("id", gatewayId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Gateway not found" }, { status: 404 });
  }

  const meta = (data.meta ?? {}) as {
    reachable_urls?: { novnc?: string };
    reachable_urls_override?: { base: string };
    networking_mode?: string;
    vnc_password?: string;
  };

  let novncUrl: string | null = meta.reachable_urls?.novnc ?? null;
  const overrideBase = meta.reachable_urls_override?.base?.trim();

  if (
    novncUrl &&
    (meta.networking_mode ?? "local") !== "local" &&
    /^https?:\/\/(localhost|127\.0\.0\.1)/.test(novncUrl)
  ) {
    novncUrl = null;
  }

  if (overrideBase && novncUrl) {
    try {
      const u = new URL(novncUrl);
      const o = new URL(overrideBase);
      u.protocol = o.protocol;
      u.hostname = o.hostname;
      if (o.port) u.port = o.port;
      novncUrl = u.toString();
    } catch {
      // Override didn't parse; fall through to the auto URL.
    }
  }

  if (
    novncUrl &&
    !overrideBase &&
    (meta.networking_mode ?? "local") === "local"
  ) {
    const pw = meta.vnc_password
      ? `&password=${encodeURIComponent(meta.vnc_password)}`
      : "";
    novncUrl = `/desktop/vnc.html?autoconnect=1&resize=remote&path=desktop/websockify${pw}`;
  } else if (novncUrl && meta.vnc_password) {
    const sep = novncUrl.includes("?") ? "&" : "?";
    novncUrl = `${novncUrl}${sep}password=${encodeURIComponent(meta.vnc_password)}`;
  }

  return NextResponse.json({
    novncUrl,
    gatewayLabel: data.label as string,
  });
}
