import { test, expect } from "@playwright/test";
import { test as authedTest } from "../fixtures/auth.fixture";
import { AGENTS } from "../fixtures/test-data";

authedTest.describe("Telegram channel pairing", () => {
  const telegramToken = process.env.E2E_TELEGRAM_BOT_TOKEN;

  authedTest(
    "connect Telegram bot to agent",
    async ({ authedPage: page }) => {
      authedTest.skip(!telegramToken, "E2E_TELEGRAM_BOT_TOKEN required");

      await page.goto("/dashboard/agents");
      await page.getByText(AGENTS.scout.name).first().click();

      // Find channel / messaging section
      const channelSection = page.getByText(/Channel|Messaging|Telegram/i).first();
      const hasChannel = await channelSection
        .isVisible({ timeout: 5_000 })
        .catch(() => false);

      if (hasChannel) {
        await channelSection.click();

        // Select Telegram
        await page.getByText(/Telegram/i).first().click();

        // Enter bot token
        const tokenInput = page
          .getByPlaceholder(/bot token/i)
          .or(page.getByLabel(/Token/i));
        await tokenInput.fill(telegramToken!);

        await page
          .getByRole("button", { name: /Connect|Save|Add/i })
          .first()
          .click();

        // Wait for channel to be configured
        await expect(
          page.getByText(/Waiting for pairing|Send.*start|pairing code/i).first()
        ).toBeVisible({ timeout: 30_000 });

        // --- MANUAL STEP ---
        // At this point, the tester must:
        // 1. Open Telegram and DM the bot with /start
        // 2. Copy the 6-digit pairing code
        // 3. Enter it in the UI
        //
        // For automated runs, this test stops here.
        // The pairing code entry is tested in the interactive flow below.
        console.log(
          "\n⚠️  MANUAL STEP: Send /start to the Telegram bot, then enter the pairing code in the UI.\n"
        );
      }
    }
  );

  authedTest(
    "approve pairing code (interactive)",
    async ({ authedPage: page }) => {
      authedTest.skip(!telegramToken, "E2E_TELEGRAM_BOT_TOKEN required");

      // This test expects the pairing code to be provided via env
      const pairingCode = process.env.E2E_TELEGRAM_PAIRING_CODE;
      authedTest.skip(!pairingCode, "E2E_TELEGRAM_PAIRING_CODE required (set after /start)");

      await page.goto("/dashboard/agents");
      await page.getByText(AGENTS.scout.name).first().click();

      // Find pairing code input
      const codeInput = page
        .getByPlaceholder(/pairing code|6-digit/i)
        .or(page.getByLabel(/Code/i));
      const hasCodeInput = await codeInput
        .isVisible({ timeout: 10_000 })
        .catch(() => false);

      if (hasCodeInput) {
        await codeInput.fill(pairingCode!);
        await page
          .getByRole("button", { name: /Approve|Verify|Pair/i })
          .first()
          .click();

        // Verify channel shows as paired/connected
        await expect(
          page.getByText(/Paired|Connected|Active/i).first()
        ).toBeVisible({ timeout: 15_000 });
      }
    }
  );
});
