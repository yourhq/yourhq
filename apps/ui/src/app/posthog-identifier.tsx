"use client";

import { useEffect } from "react";
import { identifyUser, setWorkspaceGroup } from "@/lib/analytics";

export function PostHogIdentifier({
  userId,
  email,
  workspaceId,
}: {
  userId: string;
  email: string;
  workspaceId: string;
}) {
  useEffect(() => {
    identifyUser(userId, { email });
    setWorkspaceGroup(workspaceId);
  }, [userId, email, workspaceId]);

  return null;
}
