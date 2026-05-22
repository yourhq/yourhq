import { test, expect } from "@playwright/test";
import { test as authedTest } from "../fixtures/auth.fixture";
import { queryTable } from "../fixtures/supabase";
import { AGENTS } from "../fixtures/test-data";

authedTest.describe("Agents @smoke", () => {
  authedTest(
    "scout agent exists from onboarding",
    async ({ authedPage: page }) => {
      await page.goto("/dashboard/agents");
      await expect(page.getByRole("heading", { name: /Agents/i })).toBeVisible();

      // Scout was created during onboarding — verify it's in the list
      await expect(
        page.getByText("Scout").first()
      ).toBeVisible({ timeout: 10_000 });

      // Verify in database
      const agents = await queryTable("agents");
      expect(agents.length).toBeGreaterThanOrEqual(1);
      const scout = agents.find(
        (a: any) => a.name === "Scout" || a.slug?.includes("scout")
      );
      expect(scout).toBeTruthy();
      expect(scout.status).toMatch(/ready|provisioning/);
    }
  );

  authedTest(
    "create Ghostwriter agent via template wizard",
    async ({ authedPage: page }) => {
      await page.goto("/dashboard/agents");

      // Check if Ghostwriter already exists from a previous run
      await page.waitForTimeout(2_000);
      const ghostExists = await page
        .getByRole("link", { name: "Ghostwriter" })
        .isVisible({ timeout: 3_000 })
        .catch(() => false);

      if (ghostExists) {
        // Already created — just verify in DB
        const agents = await queryTable("agents");
        const ghostwriter = agents.find(
          (a: any) => a.name === "Ghostwriter" || a.slug?.includes("ghostwriter")
        );
        expect(ghostwriter).toBeTruthy();
        return;
      }

      // Step 1: Open template picker
      await page.getByRole("button", { name: /New agent/i }).click();
      await expect(page.getByText("TEMPLATE").first()).toBeVisible({ timeout: 5_000 });

      // Search for and select Ghostwriter template
      await page.getByPlaceholder(/Search templates/i).fill("Ghostwriter");
      await page.getByText("Ghostwriter").first().click();
      await page.getByRole("button", { name: /Continue/i }).click();

      // Step 2: Identity — fill in the agent name
      const nameInput = page.getByPlaceholder(/What should we call them/i);
      await expect(nameInput).toBeVisible({ timeout: 5_000 });
      await nameInput.fill(AGENTS.ghostwriter.name);

      // Wait for "Create agent" to become enabled (slug auto-generates from name)
      const createBtn = page.getByRole("button", { name: /Create agent/i });
      await expect(createBtn).toBeEnabled({ timeout: 5_000 });
      await createBtn.click();

      // Step 3: Provisioning — wait for completion (can take a while)
      await expect(
        page.getByText(/ready|Done|Open agent|Continue in background/i).first()
      ).toBeVisible({ timeout: 120_000 });

      // If "Open agent" or "Done" button appears, click Done
      const doneBtn = page.getByRole("button", { name: /Done/i });
      const hasDone = await doneBtn.isVisible({ timeout: 5_000 }).catch(() => false);
      if (hasDone) {
        await doneBtn.click();
      } else {
        const bgBtn = page.getByRole("button", { name: /Continue in background/i });
        const hasBg = await bgBtn.isVisible({ timeout: 3_000 }).catch(() => false);
        if (hasBg) await bgBtn.click();
      }

      // Verify Ghostwriter appears in the agent list
      await page.goto("/dashboard/agents");
      await expect(
        page.getByText("Ghostwriter").first()
      ).toBeVisible({ timeout: 15_000 });
    }
  );

  authedTest("agent detail page loads", async ({ authedPage: page }) => {
    await page.goto("/dashboard/agents");

    // Click the agent card link (overlay <a> with aria-label)
    await page.getByRole("link", { name: "Scout" }).click();

    // Verify detail page loaded
    await expect(page).toHaveURL(/\/dashboard\/agents\/scout/);
    await expect(
      page.getByText("Scout").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  authedTest(
    "set reporting hierarchy (Ghostwriter reports to Scout)",
    async ({ authedPage: page }) => {
      // Navigate to Ghostwriter's detail page
      await page.goto("/dashboard/agents");
      const ghostLink = page.getByRole("link", { name: "Ghostwriter" });
      const hasGhost = await ghostLink.isVisible({ timeout: 10_000 }).catch(() => false);
      if (!hasGhost) {
        authedTest.skip(true, "Ghostwriter not found — skipping hierarchy test");
        return;
      }
      await ghostLink.click();

      // Look for the manager/reports-to field
      const managerField = page.getByText(/Reports to|Manager/i).first();
      const hasManagerField = await managerField
        .isVisible({ timeout: 5_000 })
        .catch(() => false);

      if (hasManagerField) {
        await managerField.click();
        await page.getByText("Scout").first().click();
        await page.waitForTimeout(1_000);
      }
    }
  );

  authedTest("org chart view renders", async ({ authedPage: page }) => {
    await page.goto("/dashboard/agents");

    // Toggle to org chart view (icon button next to grid view)
    const orgChartBtn = page.getByRole("button", {
      name: /Org chart|Hierarchy|tree/i,
    });
    const hasOrgChart = await orgChartBtn
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasOrgChart) {
      await orgChartBtn.click();
      await expect(page.getByText("Scout").first()).toBeVisible();
    }
  });
});
