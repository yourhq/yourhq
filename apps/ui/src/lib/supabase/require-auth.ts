import "server-only";

import type { User } from "@supabase/supabase-js";
import { createClient } from "./server";

export class UnauthenticatedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthenticatedError";
  }
}

export async function requireAuth(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}
