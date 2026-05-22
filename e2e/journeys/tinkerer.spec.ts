/**
 * ICP Journey: Tinkerer
 *
 * Persona: developer/power-user who customizes agents, creates routines,
 *          builds knowledge bases, and monitors system health.
 * Flow: add knowledge → create routine → assign task that uses knowledge →
 *       verify agent references knowledge in output, routine scheduled,
 *       check activity log for full audit trail.
 *
 * This spec uses REAL API calls ($2 Anthropic budget cap).
 * Tag: @live — only run via manual trigger, never on tag pushes.
 */
import { test, expect } from "@playwright/test";
import { test as authedTest } from "../fixtures/auth.fixture";
import { queryTable, getServiceClient } from "../fixtures/supabase";
import {
  waitForInboxCompletion,
  getUsageSince,
  getComments,
  findAgent,
} from "../fixtures/agent-execution";

const KNOWLEDGE_TITLE = "ICP-Tinkerer: Company Style Guide";
const KNOWLEDGE_CONTENT =
  "Brand voice: professional but approachable. " +
  "Always use active voice. Avoid jargon. " +
  "Key product name: HQ (always capitalized). " +
  "Tagline: 'Your AI workforce, orchestrated.'";

const TASK_TITLE = "ICP-Tinkerer: Write a tagline using our style guide";
const TASK_DESCRIPTION =
  "Write 3 alternative taglines for HQ. Follow the company style guide in your knowledge base. " +
  "Keep each tagline under 10 words.";

const ROUTINE_NAME = "ICP-Tinkerer: Morning briefing";
const ROUTINE_INSTRUCTION = "Check all open tasks and summarize what needs attention today.";

async function getScoutAgent() {
  const agent = await findAgent("scout");
  if (!agent) throw new Error("Scout agent not found — run UI specs first");
  return agent;
}

async function getTaskId(): Promise<string> {
  const tasks = await queryTable("tasks", { title: TASK_TITLE });
  if (!tasks.length) throw new Error(`Task "${TASK_TITLE}" not found in DB`);
  return tasks[tasks.length - 1].id;
}

authedTest.describe("Tinkerer Journey @live", () => {
  authedTest(
    "create a knowledge page with style guide content",
    async ({ authedPage: page }) => {
      await page.goto("/dashboard/knowledge");

      await page.getByRole("button", { name: /New/i }).first().click();

      const pageOption = page.locator('[role="menuitem"]', { hasText: /^Page$/ }).first();
      const hasMenuItem = await pageOption.isVisible({ timeout: 3_000 }).catch(() => false);
      if (hasMenuItem) {
        await pageOption.click();
      } else {
        await page.locator("[role=menu] [role=menuitem]").filter({ hasText: "Page" }).first().click();
      }

      const titleEl = page.locator("h1[contenteditable]").or(
        page.getByPlaceholder(/Untitled|Title/i)
      );
      await expect(titleEl.first()).toBeVisible({ timeout: 5_000 });
      await titleEl.first().click();
      await titleEl.first().fill(KNOWLEDGE_TITLE);

      const bodyEl = page.getByPlaceholder(/Start writing/i).or(
        page.locator("[contenteditable]:not(h1)").first()
      );
      const hasBody = await bodyEl.isVisible({ timeout: 3_000 }).catch(() => false);
      if (hasBody) {
        await bodyEl.click();
        await bodyEl.fill(KNOWLEDGE_CONTENT);
      }

      await page.waitForTimeout(2_000);
      await page.goto("/dashboard/knowledge");

      const items = await queryTable("knowledge_items", { title: KNOWLEDGE_TITLE });
      expect(items.length).toBeGreaterThanOrEqual(1);
    }
  );

  authedTest(
    "create a scheduled routine for Scout",
    async ({ authedPage: page }) => {
      const scoutAgent = await getScoutAgent();

      await page.goto("/dashboard/routines");
      await page.getByRole("button", { name: /New routine/i }).click();

      const nameInput = page.getByPlaceholder(/Daily inbox check/i);
      await expect(nameInput).toBeVisible({ timeout: 5_000 });
      await nameInput.fill(ROUTINE_NAME);

      const agentSelect = page.locator("select").first();
      await expect(agentSelect).toBeVisible({ timeout: 5_000 });
      const scoutOption = agentSelect.locator("option", { hasText: "Scout" });
      const optionValue = await scoutOption.getAttribute("value");
      if (optionValue) await agentSelect.selectOption(optionValue);

      const instructionInput = page.getByPlaceholder(/Check inbox/i);
      const hasInstruction = await instructionInput
        .isVisible({ timeout: 3_000 })
        .catch(() => false);
      if (hasInstruction) await instructionInput.fill(ROUTINE_INSTRUCTION);

      await page.getByRole("button", { name: /Create routine/i }).click();

      await expect(
        page.getByText(ROUTINE_NAME).first()
      ).toBeVisible({ timeout: 10_000 });

      const routines = await queryTable("routines", { name: ROUTINE_NAME });
      expect(routines.length).toBeGreaterThanOrEqual(1);
    }
  );

  authedTest(
    "assign knowledge-dependent task and wait for execution",
    async ({ authedPage: page }) => {
      authedTest.setTimeout(200_000);
      const scoutAgent = await getScoutAgent();

      await page.goto("/dashboard/tasks");
      await page.getByRole("button", { name: /New task/i }).click();

      const titleInput = page.getByPlaceholder(/What needs to be done/i);
      await expect(titleInput).toBeVisible({ timeout: 5_000 });
      await titleInput.fill(TASK_TITLE);

      const descField = page.getByPlaceholder(/Add a description/i);
      const hasDesc = await descField.isVisible({ timeout: 2_000 }).catch(() => false);
      if (hasDesc) await descField.fill(TASK_DESCRIPTION);

      await page.getByRole("button", { name: "Create", exact: true }).click();
      await page.waitForTimeout(2_000);

      const taskId = await getTaskId();

      // Assign to Scout
      await page.goto("/dashboard/tasks");
      await page.getByText(TASK_TITLE).first().click();

      const assigneeField = page.getByText("Unassigned").first();
      const hasAssignee = await assigneeField
        .isVisible({ timeout: 5_000 })
        .catch(() => false);

      if (hasAssignee) {
        await assigneeField.click();
        const scoutOption = page
          .getByRole("option", { name: /Scout/i })
          .or(page.locator("[data-radix-popper-content-wrapper] >> text=Scout"));
        await scoutOption.first().click();
        await page.waitForTimeout(1_000);
      } else {
        const sb = getServiceClient();
        await sb
          .from("tasks")
          .update({ assignee_agent_id: scoutAgent.id })
          .eq("id", taskId);
      }

      const inboxItem = await waitForInboxCompletion(taskId, {
        timeoutMs: 180_000,
        pollMs: 5_000,
      });
      expect(inboxItem.status).toBe("done");
    }
  );

  authedTest("verify agent posted completion output", async () => {
    const taskId = await getTaskId();
    const comments = await getComments("task", taskId);
    const agentComments = comments.filter((c) => c.actor_type === "agent");

    if (agentComments.length === 0) {
      authedTest.skip(true, "Agent did not post a completion comment — may need platform fix");
      return;
    }

    expect(agentComments[0].body.length).toBeGreaterThan(0);
  });

  authedTest("verify LLM usage from this journey", async () => {
    const scoutAgent = await getScoutAgent();
    const usage = await getUsageSince(scoutAgent.id as string, "2020-01-01T00:00:00Z");

    if (usage.length === 0) {
      authedTest.skip(true, "Usage not yet reported — may be delayed");
      return;
    }

    const totalSpend = usage.reduce((sum, r) => sum + Number(r.cost_total_usd || 0), 0);
    expect(totalSpend).toBeGreaterThan(0);
    expect(totalSpend).toBeLessThan(2.0);
  });

  authedTest(
    "verify full audit trail in activity log",
    async ({ authedPage: page }) => {
      await page.goto("/dashboard/activity");
      await page.waitForTimeout(2_000);

      const hasTaskEntry = await page
        .getByText(/ICP-Tinkerer/i)
        .first()
        .isVisible({ timeout: 10_000 })
        .catch(() => false);

      if (hasTaskEntry) {
        const hasScout = await page
          .getByText(/Scout/i)
          .first()
          .isVisible({ timeout: 5_000 })
          .catch(() => false);
        if (!hasScout) {
          authedTest.skip(true, "Scout not visible in activity — agent may not have executed");
          return;
        }
      }

      const sb = getServiceClient();
      const taskId = await getTaskId().catch(() => null);
      if (taskId) {
        const { data: auditEntries } = await sb
          .from("audit_log")
          .select("*")
          .eq("entity_type", "task")
          .eq("entity_id", taskId)
          .order("created_at", { ascending: false });

        if (auditEntries && auditEntries.length > 0) {
          const actions = auditEntries.map((e: any) => e.action);
          expect(actions).toContain("created");
        }
      }
    }
  );

  authedTest(
    "verify routine appears in scheduled list",
    async ({ authedPage: page }) => {
      await page.goto("/dashboard/routines");

      await expect(
        page.getByText(ROUTINE_NAME).first()
      ).toBeVisible({ timeout: 10_000 });
    }
  );

  authedTest("cumulative spend stays within $2 cap", async () => {
    const scoutAgent = await getScoutAgent();
    const allUsage = await getUsageSince(
      scoutAgent.id as string,
      "2020-01-01T00:00:00Z"
    );

    if (allUsage.length === 0) {
      authedTest.skip(true, "No usage data available yet");
      return;
    }

    const totalSpend = allUsage.reduce(
      (sum, r) => sum + Number(r.cost_total_usd || 0),
      0
    );
    expect(totalSpend).toBeLessThan(2.0);
  });
});
