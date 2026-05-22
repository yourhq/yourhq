import { test, expect } from "@playwright/test";
import { test as authedTest } from "../fixtures/auth.fixture";
import { queryTable, countRows } from "../fixtures/supabase";

authedTest.describe("Secrets management", () => {
  authedTest("add a secret for gateway", async ({ authedPage: page }) => {
    await page.goto("/dashboard/settings/secrets");

    // Click "+ Add secret"
    await page.getByRole("button", { name: /Add secret/i }).click();

    // "What's this for?" label field
    const labelInput = page.getByPlaceholder(/Notion API Key/i).or(
      page.getByLabel(/What's this for/i)
    );
    await expect(labelInput.first()).toBeVisible({ timeout: 5_000 });
    await labelInput.first().fill("E2E Test Secret");

    // Variable name should auto-generate — wait then fill value
    await page.waitForTimeout(500);

    // Value field
    const valueInput = page.getByPlaceholder(/sk-/i).or(
      page.getByLabel(/Value/i)
    );
    await valueInput.first().fill("test-secret-value-12345");

    // Click "Add secret"
    await page.getByRole("button", { name: "Add secret", exact: true }).click();

    // Verify secret appears in list
    await expect(
      page.getByText(/E2E.TEST.SECRET|E2E_TEST_SECRET|E2E Test Secret/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // Verify in DB
    const secrets = await queryTable("secrets");
    expect(secrets.length).toBeGreaterThanOrEqual(1);
  });

  authedTest(
    "verify secret value is never shown in UI",
    async ({ authedPage: page }) => {
      await page.goto("/dashboard/settings/secrets");

      // The raw value should not appear anywhere on the page
      const pageContent = await page.textContent("body");
      expect(pageContent).not.toContain("test-secret-value-12345");
    }
  );

  authedTest("secrets page loads", async ({ authedPage: page }) => {
    await page.goto("/dashboard/settings/secrets");

    await expect(
      page.getByRole("heading", { name: /Secrets/i }).first()
    ).toBeVisible({ timeout: 5_000 });
  });
});
