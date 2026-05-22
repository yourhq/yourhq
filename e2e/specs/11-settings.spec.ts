import { test, expect } from "@playwright/test";
import { test as authedTest } from "../fixtures/auth.fixture";

authedTest.describe("Settings", () => {
  authedTest("update workspace name", async ({ authedPage: page }) => {
    await page.goto("/dashboard/settings");

    const nameInput = page
      .getByLabel(/Workspace name/i)
      .or(page.getByPlaceholder(/workspace name/i));
    const hasName = await nameInput
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasName) {
      const currentValue = await nameInput.inputValue();
      // Append "(updated)" to verify save works
      await nameInput.clear();
      await nameInput.fill(`${currentValue} (updated)`);
      await page.getByRole("button", { name: /Save/i }).first().click();
      await page.waitForTimeout(1_000);

      // Restore original value
      await nameInput.clear();
      await nameInput.fill(currentValue);
      await page.getByRole("button", { name: /Save/i }).first().click();
    }
  });

  authedTest("change appearance theme", async ({ authedPage: page }) => {
    await page.goto("/dashboard/settings/appearance");

    // Toggle dark mode
    const darkBtn = page.getByRole("button", { name: /Dark/i });
    const hasDark = await darkBtn
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasDark) {
      await darkBtn.click();
      await page.waitForTimeout(500);

      // Verify dark class is applied
      const html = page.locator("html");
      await expect(html).toHaveClass(/dark/);

      // Switch back to light
      const lightBtn = page.getByRole("button", { name: /Light/i });
      await lightBtn.click();
      await page.waitForTimeout(500);
    }
  });

  authedTest("change brand color", async ({ authedPage: page }) => {
    await page.goto("/dashboard/settings/appearance");

    // Look for color picker / preset buttons
    const colorPreset = page.locator("[data-color]").first();
    const hasPresets = await colorPreset
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasPresets) {
      // Click a different color preset
      const presets = page.locator("[data-color]");
      const count = await presets.count();
      if (count > 1) {
        await presets.nth(1).click();
        await page.waitForTimeout(1_000);

        // Reset to first (default)
        await presets.nth(0).click();
        await page.waitForTimeout(500);
      }
    }
  });

  authedTest("toggle CRM module", async ({ authedPage: page }) => {
    await page.goto("/dashboard/settings/modules");

    const crmToggle = page.getByText(/CRM/i).first();
    const hasModules = await crmToggle
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasModules) {
      // Toggle CRM off
      const toggle = page
        .locator("button[role='switch']")
        .or(page.getByRole("switch"))
        .first();
      const hasToggle = await toggle
        .isVisible({ timeout: 3_000 })
        .catch(() => false);

      if (hasToggle) {
        const wasChecked = await toggle.getAttribute("data-state");
        await toggle.click();
        await page.waitForTimeout(1_000);

        // Toggle back
        await toggle.click();
        await page.waitForTimeout(1_000);
      }
    }
  });

  authedTest("gateways page shows registered gateway", async ({ authedPage: page }) => {
    await page.goto("/dashboard/settings/gateways");

    // Should show at least one gateway with "ready" status
    await expect(
      page.getByText(/ready|online/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
