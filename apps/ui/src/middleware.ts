import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Run middleware on the Node.js runtime, not the Edge runtime. We need
// to read the project registry from disk (fs/path/crypto) which Edge
// doesn't support. The cost vs Edge is negligible for a single-user
// self-hosted deployment.
export const runtime = "nodejs";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (svg, png, jpg, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
