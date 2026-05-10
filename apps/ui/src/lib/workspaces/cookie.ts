export const ACTIVE_WORKSPACE_COOKIE = "hq_active_workspace";

export const ACTIVE_WORKSPACE_COOKIE_OPTIONS = {
  httpOnly: false,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};
