import { test, expect } from "@playwright/test";
import { test as authedTest } from "../fixtures/auth.fixture";
import { AGENTS } from "../fixtures/test-data";

authedTest.describe("Model providers", () => {
  const openaiKey = process.env.E2E_OPENAI_API_KEY;
  const anthropicKey = process.env.E2E_ANTHROPIC_API_KEY;

  authedTest(
    "Anthropic provider is connected from onboarding @smoke",
    async ({ authedPage: page }) => {
      authedTest.skip(!anthropicKey, "E2E_ANTHROPIC_API_KEY required");

      await page.goto("/dashboard/settings/connections");

      // Anthropic was connected during onboarding — verify it shows as healthy
      await expect(
        page.getByText("Anthropic").first()
      ).toBeVisible({ timeout: 10_000 });

      // Check for healthy status
      const healthy = page.getByText(/Healthy|connected|Last probe succeeded/i).first();
      await expect(healthy).toBeVisible({ timeout: 15_000 });
    }
  );

  authedTest("connect OpenAI provider @smoke", async ({ authedPage: page }) => {
    authedTest.skip(!openaiKey, "E2E_OPENAI_API_KEY required");

    await page.goto("/dashboard/settings/connections");

    // Click "Add connection"
    await page.getByRole("button", { name: /Add connection/i }).click();

    // Wait for modal and select OpenAI (API key)
    await expect(
      page.getByRole("heading", { name: /Add a connection/i })
    ).toBeVisible({ timeout: 5_000 });

    // Click the OpenAI button in the provider list
    await page
      .getByRole("button", { name: /OpenAI \(API key\)/i })
      .click();

    // Fill the API key
    const keyInput = page.getByPlaceholder(/API key|sk-/i).first();
    await expect(keyInput).toBeVisible({ timeout: 5_000 });
    await keyInput.fill(openaiKey!);

    // Save / Connect
    await page.getByRole("button", { name: /Save|Connect|Add/i }).first().click();

    // Wait for validation
    await expect(
      page.getByText(/connected|validated|success|Healthy/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  authedTest(
    "navigate to agent detail page from agents list",
    async ({ authedPage: page }) => {
      authedTest.skip(
        !openaiKey && !anthropicKey,
        "At least one API key required"
      );

      await page.goto("/dashboard/agents");

      // Use the link with aria-label to navigate (overlay <a> intercepts text clicks)
      await page.getByRole("link", { name: "Scout" }).click();
      await expect(page).toHaveURL(/\/dashboard\/agents\/scout/);

      // Verify detail page loaded
      await expect(page.getByText("Scout").first()).toBeVisible({ timeout: 10_000 });
    }
  );
});
