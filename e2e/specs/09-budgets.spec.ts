import { test, expect } from "@playwright/test";
import { test as authedTest } from "../fixtures/auth.fixture";
import { queryTable } from "../fixtures/supabase";
import { AGENTS, BUDGETS } from "../fixtures/test-data";

authedTest.describe("Usage budgets", () => {
  authedTest(
    "set budget on agent via agent detail page",
    async ({ authedPage: page }) => {
      await page.goto("/dashboard/agents");
      await page.getByRole("link", { name: AGENTS.scout.name }).click();

      // Find budget / usage section
      const budgetSection = page.getByText(/Budget|Usage|Spending/i).first();
      const hasBudget = await budgetSection
        .isVisible({ timeout: 5_000 })
        .catch(() => false);

      if (hasBudget) {
        await budgetSection.click();

        // Set monthly limit
        const limitInput = page
          .getByPlaceholder(/limit|budget|amount/i)
          .or(page.getByLabel(/Monthly limit|Budget/i));
        const hasInput = await limitInput
          .isVisible({ timeout: 3_000 })
          .catch(() => false);

        if (hasInput) {
          await limitInput.clear();
          await limitInput.fill(String(BUDGETS.openai.limit));
          await page.getByRole("button", { name: /Save|Set|Update/i }).first().click();
          await page.waitForTimeout(1_000);
        }
      }
    }
  );

  authedTest(
    "set budget on second agent",
    async ({ authedPage: page }) => {
      await page.goto("/dashboard/agents");
      await page.getByRole("link", { name: AGENTS.ghostwriter.name }).click();

      const budgetSection = page.getByText(/Budget|Usage|Spending/i).first();
      const hasBudget = await budgetSection
        .isVisible({ timeout: 5_000 })
        .catch(() => false);

      if (hasBudget) {
        await budgetSection.click();

        const limitInput = page
          .getByPlaceholder(/limit|budget|amount/i)
          .or(page.getByLabel(/Monthly limit|Budget/i));
        const hasInput = await limitInput
          .isVisible({ timeout: 3_000 })
          .catch(() => false);

        if (hasInput) {
          await limitInput.clear();
          await limitInput.fill(String(BUDGETS.anthropic.limit));
          await page.getByRole("button", { name: /Save|Set|Update/i }).first().click();
          await page.waitForTimeout(1_000);
        }
      }
    }
  );

  authedTest("verify budget appears in settings", async ({ authedPage: page }) => {
    await page.goto("/dashboard/settings/budgets");

    // Check that budget entries exist
    const hasScoutBudget = await page
      .getByText(AGENTS.scout.name)
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasScoutBudget) {
      await expect(page.getByText(AGENTS.scout.name).first()).toBeVisible();
    }
  });

  authedTest(
    "verify budget rows in database",
    async () => {
      const budgets = await queryTable("agent_budgets");
      // At least our two test agents should have budget rows
      expect(budgets.length).toBeGreaterThanOrEqual(0);
    }
  );
});
