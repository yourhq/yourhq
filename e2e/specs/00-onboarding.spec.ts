import { test, expect } from "@playwright/test";
import { loginViaUI, saveAuthState } from "../fixtures/auth.fixture";
import { queryTable } from "../fixtures/supabase";
import { WORKSPACE } from "../fixtures/test-data";

test.describe("Onboarding wizard @smoke", () => {
  test.setTimeout(600_000); // 10 min — gateway boot + migrations can be slow

  test("completes fresh OSS onboarding end-to-end", async ({ page }) => {
    const supabaseUrl = process.env.E2E_SUPABASE_URL;
    const supabaseAnon = process.env.E2E_SUPABASE_ANON_KEY;
    const supabaseSecret = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
    const email = process.env.E2E_USER_EMAIL || "e2e-test@yourhq.ai";
    const password = process.env.E2E_USER_PASSWORD || "TestPass123!";

    test.skip(
      !supabaseUrl || !supabaseAnon || !supabaseSecret,
      "Supabase credentials required"
    );

    // --- Check if onboarding already completed (re-run scenario) ---
    await page.goto("/onboarding");
    const isLoginPage = await page
      .getByRole("heading", { name: /Sign in/i })
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (isLoginPage) {
      await test.step("Onboarding already complete — log in instead", async () => {
        await loginViaUI(page);
        await saveAuthState(page);
      });

      await test.step("Verify workspace in database", async () => {
        const workspaces = await queryTable("workspace");
        expect(workspaces.length).toBeGreaterThanOrEqual(1);
      });

      await test.step("Verify gateway registered", async () => {
        const gateways = await queryTable("gateways");
        expect(gateways.length).toBeGreaterThanOrEqual(1);
        expect(gateways[0].status).toBe("ready");
      });

      return;
    }

    // --- Step 1: Welcome ---
    await test.step("Navigate to onboarding", async () => {
      await expect(
        page.getByRole("heading", { name: /What's your name/i })
      ).toBeVisible();
    });

    await test.step("Fill name and continue", async () => {
      await page.getByPlaceholder("Your full name").fill(WORKSPACE.ownerName);
      // Wait for Continue button to become enabled (workspace auto-generates from name)
      const continueBtn = page.getByRole("button", { name: /Continue/i });
      await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
      await continueBtn.click();
    });

    // --- Step 2: Intent ---
    await test.step("Select intent", async () => {
      await expect(
        page.getByRole("heading", { name: /What best describes/i })
      ).toBeVisible();
      // Pick "Sales & outreach" — matches ICP A (Solopreneur)
      await page.getByText("Sales & outreach").click();
      // Auto-advances after 350ms delay
      await page.waitForTimeout(500);
    });

    // --- Step 3: Infrastructure (Supabase + Gateway) ---
    await test.step("Connect Supabase", async () => {
      // Wait for infrastructure step
      await expect(page.locator("#sb-url")).toBeVisible({ timeout: 10_000 });

      await page.locator("#sb-url").fill(supabaseUrl!);
      await page.locator("#sb-publishable").fill(supabaseAnon!);
      await page.locator("#sb-secret").fill(supabaseSecret!);

      await page.getByRole("button", { name: /Connect database/i }).click();

      // After connecting, either:
      // A) Schema exists → jumps to "Connect your gateway" (shows Gateway heading)
      // B) Schema missing → shows "needs HQ's tables" migration UI
      await expect(
        page
          .getByText(/needs HQ's tables|Connect your gateway|Gateway/i)
          .first()
      ).toBeVisible({ timeout: 30_000 });
    });

    await test.step("Install schema if needed", async () => {
      const needsMigration = await page
        .getByText(/needs HQ's tables/i)
        .isVisible({ timeout: 3_000 })
        .catch(() => false);

      if (needsMigration) {
        const dbPassword = process.env.E2E_SUPABASE_DB_PASSWORD;
        test.skip(!dbPassword, "E2E_SUPABASE_DB_PASSWORD required for one-click migration");

        const dbPasswordInput = page.getByPlaceholder("Your Supabase database password");
        await dbPasswordInput.scrollIntoViewIfNeeded();
        await dbPasswordInput.fill(dbPassword!);

        const installBtn = page.getByRole("button", { name: "Install schema", exact: true });
        await expect(installBtn).toBeEnabled({ timeout: 5_000 });
        await installBtn.click();

        // Wait for schema installation then gateway step
        await expect(
          page.getByText(/Connect your gateway|Gateway/i).first()
        ).toBeVisible({ timeout: 180_000 });
      }
    });

    await test.step("Start and wait for gateway", async () => {
      // "This machine" may already be selected; click it to be sure
      await page.getByText("This machine").click();

      // Scroll down — the "Start gateway" button is below the fold
      const startBtn = page.getByRole("button", { name: "Start gateway" });
      await startBtn.scrollIntoViewIfNeeded();
      await startBtn.click();

      // Wait for the Continue button to appear (gateway connected)
      const continueBtn = page.getByRole("button", { name: "Continue" });
      await expect(continueBtn).toBeVisible({ timeout: 300_000 });
      await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
      await continueBtn.click();
    });

    // --- Step 4: Provider (connect Anthropic — required, no skip option) ---
    await test.step("Connect AI provider", async () => {
      await expect(
        page.getByRole("heading", { name: /Connect your AI provider/i })
      ).toBeVisible({ timeout: 15_000 });

      const anthropicKey = process.env.E2E_ANTHROPIC_API_KEY;
      const openaiKey = process.env.E2E_OPENAI_API_KEY;
      const apiKey = anthropicKey || openaiKey;
      test.skip(!apiKey, "E2E_ANTHROPIC_API_KEY or E2E_OPENAI_API_KEY required");

      if (anthropicKey) {
        await page.getByText("Anthropic").click();
      } else {
        await page.getByText("OpenAI (API key)").click();
      }

      // Fill the API key input
      const keyInput = page.getByPlaceholder(/Paste your.*API key/i);
      await expect(keyInput).toBeVisible({ timeout: 5_000 });
      await keyInput.fill(apiKey!);

      // Click Continue to validate and submit
      const continueBtn = page.getByRole("button", { name: "Continue" });
      await continueBtn.click();

      // Wait for wizard to advance past provider step (validation + auto-advance)
      await page.waitForTimeout(5_000);
    });

    // --- Step 5: Agent (create one to test the full flow) ---
    await test.step("Create first agent", async () => {
      // Scout should be pre-selected (based on "Sales & outreach" intent)
      // Click "Create Scout" (or "Create <AgentName>") button
      const createAgentBtn = page.getByRole("button", { name: /Create\s+\w+/i });
      await expect(createAgentBtn).toBeVisible({ timeout: 15_000 });
      await createAgentBtn.scrollIntoViewIfNeeded();
      await createAgentBtn.click();

      // Wait for agent provisioning and wizard to advance to Account step
      await expect(
        page.getByPlaceholder("you@example.com").or(
          page.getByRole("heading", { name: /Create your account|Finish/i })
        )
      ).toBeVisible({ timeout: 60_000 });
    });

    // --- Step 6: Account ---
    await test.step("Create account", async () => {
      const emailInput = page.getByPlaceholder("you@example.com");
      const hasAccountStep = await emailInput
        .isVisible({ timeout: 5_000 })
        .catch(() => false);

      if (hasAccountStep) {
        await emailInput.fill(email);
        await page
          .getByPlaceholder(/At least 6 characters/i)
          .fill(password);
        await page
          .getByRole("button", { name: /Finish setup/i })
          .click();
      }

      // Wait for redirect to dashboard
      await page.waitForURL("**/dashboard**", { timeout: 60_000 });
    });

    // --- Verify ---
    await test.step("Verify dashboard loaded", async () => {
      await expect(page).toHaveURL(/dashboard/);
      // Save auth state for subsequent tests
      await saveAuthState(page);
    });

    await test.step("Verify workspace in database", async () => {
      const workspaces = await queryTable("workspace");
      expect(workspaces.length).toBeGreaterThanOrEqual(1);
    });

    await test.step("Verify gateway registered", async () => {
      const gateways = await queryTable("gateways");
      expect(gateways.length).toBeGreaterThanOrEqual(1);
      expect(gateways[0].status).toBe("ready");
    });
  });
});
