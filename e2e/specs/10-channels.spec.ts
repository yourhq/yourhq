import { test, expect } from "@playwright/test";
import { test as authedTest } from "../fixtures/auth.fixture";

authedTest.describe("Telegram channel pairing", () => {
  const telegramToken = process.env.E2E_TELEGRAM_BOT_TOKEN;

  authedTest(
    "connect Telegram bot to Scout",
    async ({ authedPage: page }) => {
      authedTest.skip(!telegramToken, "E2E_TELEGRAM_BOT_TOKEN required");
      authedTest.setTimeout(120_000);

      // Navigate to Scout's detail page
      await page.goto("/dashboard/agents");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      await page.getByRole("link", { name: "Scout" }).click();
      await expect(page).toHaveURL(/\/dashboard\/agents\/scout/);

      // Dismiss "Getting started" overlay if present
      const dismissBtn = page.getByText("Don't show again");
      const hasOverlay = await dismissBtn.isVisible({ timeout: 3_000 }).catch(() => false);
      if (hasOverlay) {
        await dismissBtn.click();
        await page.waitForTimeout(500);
      }

      // Check if already connected (shows "Connected via Telegram" + "Change" button)
      const connected = page.getByText(/Connected via/i).first();
      const isConnected = await connected.isVisible({ timeout: 3_000 }).catch(() => false);
      if (isConnected) return;

      // MESSAGING CHANNEL section shows Telegram / Discord / Slack cards
      // Click the Telegram card (button element) to go to credentials phase
      const telegramCard = page
        .locator("button")
        .filter({ hasText: "Telegram" })
        .first();
      await expect(telegramCard).toBeVisible({ timeout: 10_000 });
      await telegramCard.click();
      await page.waitForTimeout(500);

      // Credentials phase: fill bot token (placeholder "123456789:ABCdefGHI…")
      const tokenInput = page.getByPlaceholder(/123456789/);
      await expect(tokenInput).toBeVisible({ timeout: 5_000 });
      await tokenInput.fill(telegramToken!);

      // Click "Connect" button
      const connectBtn = page.getByRole("button", { name: /^Connect/ });
      await expect(connectBtn).toBeEnabled({ timeout: 3_000 });
      await connectBtn.click();

      // Wait for provisioning → pairing phase (gateway provisions the bot, can take 30-90s)
      // The pairing phase shows "Send /start" instructions and an OTP input
      await expect(
        page.getByText(/Send.*start|pairing|Enter the code|6-digit/i).first()
      ).toBeVisible({ timeout: 90_000 });

      console.log(
        "\n⚠️  Send /start to the Telegram bot now, then set E2E_TELEGRAM_PAIRING_CODE and run the pairing test.\n"
      );
    }
  );

  authedTest(
    "complete pairing with code (interactive)",
    async ({ authedPage: page }) => {
      authedTest.skip(!telegramToken, "E2E_TELEGRAM_BOT_TOKEN required");

      const pairingCode = process.env.E2E_TELEGRAM_PAIRING_CODE;
      authedTest.skip(
        !pairingCode,
        "E2E_TELEGRAM_PAIRING_CODE required — set after sending /start to bot"
      );
      authedTest.setTimeout(90_000);

      // Navigate to Scout detail page
      await page.goto("/dashboard/agents");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      await page.getByRole("link", { name: "Scout" }).click();

      // The OTP input uses InputOTP component (individual digit slots)
      // Look for the OTP container or individual inputs
      const otpInput = page.locator("[data-input-otp]").or(
        page.locator("input[data-input-otp-mss]")
      ).first();

      const hasOtp = await otpInput
        .isVisible({ timeout: 15_000 })
        .catch(() => false);

      if (hasOtp) {
        // Type the 6-digit code (InputOTP handles individual characters)
        await otpInput.focus();
        await page.keyboard.type(pairingCode!, { delay: 100 });
        await page.waitForTimeout(500);

        // Click submit/pair button if visible
        const submitBtn = page
          .getByRole("button", { name: /Pair|Verify|Submit|Approve/i })
          .first();
        const hasSubmit = await submitBtn.isVisible({ timeout: 3_000 }).catch(() => false);
        if (hasSubmit) await submitBtn.click();

        // Wait for "Paired!" or connected state
        await expect(
          page.getByText(/Paired|Connected via/i).first()
        ).toBeVisible({ timeout: 60_000 });
      }
    }
  );
});
