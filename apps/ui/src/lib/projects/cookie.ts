// The UI uses a cookie to track which project is "active" for a browser
// session. Server components read it to pick the right Supabase creds;
// middleware reads it to pick the right auth client; the switcher sets it.
//
// We keep the name stable ("hq_active_project") so middleware, server
// components, and the switcher all stay in sync.

export const ACTIVE_PROJECT_COOKIE = "hq_active_project";

export const ACTIVE_PROJECT_COOKIE_OPTIONS = {
  httpOnly: false, // client components read it via document.cookie (switcher)
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365, // one year
};
