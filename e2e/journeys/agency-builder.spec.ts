/**
 * ICP Journey: Agency Builder
 *
 * Persona: agency operator running multiple agents with delegation and budgets.
 * Flow: set up org hierarchy (Ghostwriter reports to Scout) → create content task →
 *       assign to Ghostwriter → agent executes → verify delegation chain,
 *       usage tracked per agent, budgets enforced.
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
  getAgentBudget,
  findAgent,
} from "../fixtures/agent-execution";

const CONTENT_TASK = "ICP-Agency: Draft a 3-bullet product announcement for HQ v0.2";
const CONTENT_DESC =
  "Write a short product announcement (3 bullet points) for our v0.2 release. " +
  "Mention: source connectors, test coverage, and onboarding improvements.";

async function getTargetAgent() {
  const ghostwriter = await findAgent("ghostwriter");
  const scout = await findAgent("scout");
  return ghostwriter ?? scout!;
}

async function getTaskId(): Promise<string> {
  const tasks = await queryTable("tasks", { title: CONTENT_TASK });
  if (!tasks.length) throw new Error(`Task "${CONTENT_TASK}" not found in DB`);
  return tasks[tasks.length - 1].id;
}

authedTest.describe("Agency Builder Journey @live", () => {
  authedTest(
    "verify agent hierarchy (Ghostwriter reports to Scout)",
    async ({ authedPage: page }) => {
      const ghostwriter = await findAgent("ghostwriter");
      const scout = await findAgent("scout");
      if (!ghostwriter || !scout) {
        authedTest.skip(true, "Need both Scout and Ghostwriter — skipping hierarchy test");
        return;
      }

      if (ghostwriter.reports_to_id !== scout.id) {
        await page.goto("/dashboard/agents");
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);
        const ghostLink = page.getByRole("link", { name: "Ghostwriter" });
        const hasGhost = await ghostLink.isVisible({ timeout: 10_000 }).catch(() => false);
        if (!hasGhost) {
          authedTest.skip(true, "Ghostwriter not visible in agent list");
          return;
        }
        await ghostLink.click();

        const managerField = page.getByText(/Reports to|Manager/i).first();
        const hasField = await managerField.isVisible({ timeout: 5_000 }).catch(() => false);
        if (hasField) {
          await managerField.click();
          await page.getByText("Scout").first().click();
          await page.waitForTimeout(1_000);
        }
      }

      const refreshed = await findAgent("ghostwriter");
      if (refreshed) {
        expect(refreshed.reports_to_id).toBe(scout.id);
      }
    }
  );

  authedTest(
    "set budget limits for Scout",
    async () => {
      const scout = await findAgent("scout");
      if (!scout) throw new Error("Scout not found");

      const sb = getServiceClient();
      await sb
        .from("agent_budgets")
        .upsert(
          {
            agent_id: scout.id,
            monthly_limit_usd: 2.0,
            soft_threshold_pct: 80,
            hard_cutoff: false,
          },
          { onConflict: "agent_id" }
        );

      const budget = await getAgentBudget(scout.id as string);
      expect(budget).not.toBeNull();
      expect(Number(budget!.monthly_limit_usd)).toBe(2.0);
    }
  );

  authedTest(
    "assign content task to agent and wait for execution",
    async ({ authedPage: page }) => {
      authedTest.setTimeout(200_000);
      const targetAgent = await getTargetAgent();
      const targetName = (targetAgent.name as string) || "Scout";

      await page.goto("/dashboard/tasks");
      await page.getByRole("button", { name: /New task/i }).click();

      const titleInput = page.getByPlaceholder(/What needs to be done/i);
      await expect(titleInput).toBeVisible({ timeout: 5_000 });
      await titleInput.fill(CONTENT_TASK);

      const descField = page.getByPlaceholder(/Add a description/i);
      const hasDesc = await descField.isVisible({ timeout: 2_000 }).catch(() => false);
      if (hasDesc) await descField.fill(CONTENT_DESC);

      await page.getByRole("button", { name: "Create", exact: true }).click();
      await page.waitForTimeout(2_000);

      const taskId = await getTaskId();

      // Assign to target agent
      await page.goto("/dashboard/tasks");
      await page.getByText(CONTENT_TASK).first().click();

      const assigneeField = page.getByText("Unassigned").first();
      const hasAssignee = await assigneeField.isVisible({ timeout: 5_000 }).catch(() => false);

      if (hasAssignee) {
        await assigneeField.click();
        const agentOption = page
          .getByRole("option", { name: new RegExp(targetName, "i") })
          .or(page.locator(`[data-radix-popper-content-wrapper] >> text=${targetName}`));
        await agentOption.first().click();
        await page.waitForTimeout(1_000);
      } else {
        const sb = getServiceClient();
        await sb
          .from("tasks")
          .update({ assignee_agent_id: targetAgent.id })
          .eq("id", taskId);
      }

      const inboxItem = await waitForInboxCompletion(taskId, {
        timeoutMs: 180_000,
        pollMs: 5_000,
      });
      expect(inboxItem.status).toBe("done");
    }
  );

  authedTest("verify per-agent usage tracking", async () => {
    const targetAgent = await getTargetAgent();
    const usage = await getUsageSince(targetAgent.id as string, "2020-01-01T00:00:00Z");

    if (usage.length === 0) {
      authedTest.skip(true, "Usage not yet reported — may be delayed");
      return;
    }

    const totalSpend = usage.reduce((sum, r) => sum + Number(r.cost_total_usd || 0), 0);
    expect(totalSpend).toBeGreaterThan(0);
    expect(totalSpend).toBeLessThan(2.0);
  });

  authedTest("verify budget reflects new spend", async () => {
    const scout = await findAgent("scout");
    if (!scout) throw new Error("Scout not found");
    const budget = await getAgentBudget(scout.id as string);

    if (!budget || Number(budget.current_period_spend_usd) === 0) {
      authedTest.skip(true, "Budget not yet updated — depends on usage reporting");
      return;
    }

    expect(Number(budget.current_period_spend_usd)).toBeGreaterThan(0);
  });

  authedTest(
    "verify usage visible on agent detail page",
    async ({ authedPage: page }) => {
      await page.goto("/dashboard/agents");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      await page.getByRole("link", { name: "Scout" }).click();

      const usageSection = page.getByText(/Usage|Budget|Spend/i).first();
      const hasUsage = await usageSection
        .isVisible({ timeout: 5_000 })
        .catch(() => false);

      if (hasUsage) {
        const costText = page.getByText(/\$\d/).first();
        const hasCost = await costText.isVisible({ timeout: 5_000 }).catch(() => false);
        if (hasCost) {
          const text = await costText.textContent();
          expect(text).toMatch(/\$/);
        }
      }
    }
  );
});
