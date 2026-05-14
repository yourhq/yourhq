import { Hono } from "hono";
import { getMasterSupabase } from "../lib/master-supabase.js";
import { getLoopStatuses } from "../lib/loop-status.js";

const app = new Hono();

app.get("/health", async (c) => {
  const loops = getLoopStatuses();

  let dbOk = false;
  try {
    const db = getMasterSupabase();
    const { error } = await db.from("hosted_users").select("id", { count: "exact", head: true });
    dbOk = !error;
  } catch {
    dbOk = false;
  }

  const healthy = dbOk;

  return c.json(
    {
      status: healthy ? "ok" : "degraded",
      service: "yourhq-worker",
      database: dbOk ? "ok" : "unreachable",
      loops,
      uptime: Math.floor(process.uptime()),
    },
    healthy ? 200 : 503,
  );
});

export default app;
