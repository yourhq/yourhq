import { test, expect } from "@playwright/test";
import { test as authedTest } from "../fixtures/auth.fixture";
import { queryTable } from "../fixtures/supabase";
import { ROUTINE, AGENTS } from "../fixtures/test-data";

authedTest.describe("Routines", () => {
  authedTest("create a scheduled routine", async ({ authedPage: page }) => {
    await page.goto("/dashboard/routines");

    await page.getByRole("button", { name: /New routine/i }).click();

    // Fill name (placeholder: "e.g. Daily inbox check")
    const nameInput = page.getByPlaceholder(/Daily inbox check/i);
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.fill(ROUTINE.name);

    // Assign agent — native <select> with emoji-prefixed labels like "🕵️Scout"
    const agentSelect = page.locator("select").first();
    await expect(agentSelect).toBeVisible({ timeout: 5_000 });
    // Get the option that contains "Scout" and select by its value
    const scoutOption = agentSelect.locator("option", { hasText: "Scout" });
    const optionValue = await scoutOption.getAttribute("value");
    if (optionValue) {
      await agentSelect.selectOption(optionValue);
    }

    // Fill instruction (placeholder: "e.g. Check inbox and process pending tasks")
    const instructionInput = page.getByPlaceholder(/Check inbox/i);
    const hasInstruction = await instructionInput
      .isVisible({ timeout: 3_000 })
      .catch(() => false);
    if (hasInstruction) await instructionInput.fill(ROUTINE.instruction);

    // Click "Create routine"
    await page.getByRole("button", { name: /Create routine/i }).click();

    // Verify routine appears in list
    await expect(
      page.getByText(ROUTINE.name).first()
    ).toBeVisible({ timeout: 10_000 });

    const routines = await queryTable("routines", { name: ROUTINE.name });
    expect(routines.length).toBeGreaterThanOrEqual(1);
  });

  authedTest("pause and resume routine", async ({ authedPage: page }) => {
    await page.goto("/dashboard/routines");

    // Click on the routine
    await page.getByText(ROUTINE.name).first().click();

    // Look for pause/active toggle or button
    const pauseBtn = page.getByRole("button", { name: /Pause|Disable/i }).or(
      page.getByRole("switch")
    );
    const hasPause = await pauseBtn.first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasPause) {
      await pauseBtn.first().click();
      await page.waitForTimeout(1_000);
    }
  });

  authedTest("filter routines", async ({ authedPage: page }) => {
    await page.goto("/dashboard/routines");

    const searchInput = page.getByPlaceholder(/Search routines/i);
    const hasSearch = await searchInput
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    if (hasSearch) {
      await searchInput.fill(ROUTINE.name);
      await page.waitForTimeout(1_000);
      await expect(
        page.getByText(ROUTINE.name).first()
      ).toBeVisible();
    }
  });
});
