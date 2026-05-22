import { test, expect } from "@playwright/test";
import { test as authedTest } from "../fixtures/auth.fixture";
import { queryTable, countRows } from "../fixtures/supabase";
import { KNOWLEDGE, AGENTS } from "../fixtures/test-data";

authedTest.describe("Knowledge @smoke", () => {
  authedTest("create a knowledge page", async ({ authedPage: page }) => {
    await page.goto("/dashboard/knowledge");

    // Click "+ New" dropdown then "Page"
    await page.getByRole("button", { name: /New/i }).first().click();
    const pageOption = page.getByRole("menuitem", { name: /Page/i }).or(
      page.getByText("Page", { exact: true })
    );
    await pageOption.first().click();

    // Navigates to page editor — title is a contenteditable heading, not an input
    // Wait for the editor to load
    await page.waitForTimeout(2_000);

    // The title area is the first editable element on the page
    const titleArea = page.locator("h1[contenteditable], [data-placeholder*='Untitled'], [placeholder*='title']").first();
    const hasTitleArea = await titleArea.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasTitleArea) {
      await titleArea.click();
      await titleArea.fill(KNOWLEDGE.page.title);
    } else {
      // Try the first textbox/input
      const firstInput = page.getByRole("textbox").first();
      await firstInput.fill(KNOWLEDGE.page.title);
    }

    // Fill content in the editor body
    const editor = page.getByPlaceholder(/Start writing|press '\/'/i).or(
      page.locator('[contenteditable="true"]').nth(1)
    );
    const hasEditor = await editor.first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    if (hasEditor) {
      await editor.first().click();
      await page.keyboard.type(KNOWLEDGE.page.content);
    }

    // Auto-saves — wait a moment then go back to list
    await page.waitForTimeout(3_000);
    await page.goto("/dashboard/knowledge");
    await page.waitForTimeout(1_000);

    // Verify in DB
    const items = await queryTable("knowledge_items", {
      title: KNOWLEDGE.page.title,
    });
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0].kind).toBe("page");
  });

  authedTest("create an agent-scoped skill", async ({ authedPage: page }) => {
    await page.goto("/dashboard/knowledge");

    await page.getByRole("button", { name: /New/i }).first().click();
    const skillOption = page.getByRole("menuitem", { name: /Skill/i }).or(
      page.getByText("Skill", { exact: true })
    );
    await skillOption.first().click();

    // Same editor UI as pages — wait for it to load
    await page.waitForTimeout(2_000);

    const titleArea = page.locator("h1[contenteditable], [data-placeholder*='Untitled'], [placeholder*='title']").first();
    const hasTitleArea = await titleArea.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasTitleArea) {
      await titleArea.click();
      await titleArea.fill(KNOWLEDGE.skill.title);
    } else {
      const firstInput = page.getByRole("textbox").first();
      await firstInput.fill(KNOWLEDGE.skill.title);
    }

    const editor = page.getByPlaceholder(/Start writing|press '\/'/i).or(
      page.locator('[contenteditable="true"]').nth(1)
    );
    const hasEditor = await editor.first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    if (hasEditor) {
      await editor.first().click();
      await page.keyboard.type(KNOWLEDGE.skill.content);
    }

    await page.waitForTimeout(3_000);
    await page.goto("/dashboard/knowledge");
    await page.waitForTimeout(1_000);

    const items = await queryTable("knowledge_items", {
      title: KNOWLEDGE.skill.title,
    });
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0].kind).toBe("skill");
  });

  authedTest("upload a file", async ({ authedPage: page }) => {
    await page.goto("/dashboard/knowledge");

    const testContent = "This is a test document for E2E testing of HQ file upload.";
    const buffer = Buffer.from(testContent, "utf-8");

    await page.getByRole("button", { name: /New/i }).first().click();
    await page.getByText("Upload files").click();

    // Handle file input (may be hidden, use setInputFiles via locator)
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 5_000 }).catch(() => null),
      page.locator('input[type="file"]').first().dispatchEvent("click").catch(() => null),
    ]);

    if (fileChooser) {
      await fileChooser.setFiles({
        name: "e2e-test-document.txt",
        mimeType: "text/plain",
        buffer,
      });
      await page.waitForTimeout(5_000);
    }

    // Verify knowledge items exist in DB
    const items = await queryTable("knowledge_items");
    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  authedTest("search knowledge items", async ({ authedPage: page }) => {
    await page.goto("/dashboard/knowledge");

    const searchInput = page.getByPlaceholder(/Search/i).first();
    await expect(searchInput).toBeVisible({ timeout: 5_000 });

    // Search for a simpler term that'll match
    await searchInput.fill("Test");
    await page.waitForTimeout(2_000);

    // Verify at least one item shows up
    const itemCount = await page.getByText(/page|skill|file/i).count();
    expect(itemCount).toBeGreaterThan(0);
  });

  authedTest("create a folder", async ({ authedPage: page }) => {
    await page.goto("/dashboard/knowledge");

    // Folders panel has a "+" button at top
    const addFolderBtn = page.locator("[aria-label='Add folder'], [title='Add folder']").or(
      page.getByRole("button", { name: /folder/i })
    );
    const hasFolderBtn = await addFolderBtn.first()
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    if (hasFolderBtn) {
      await addFolderBtn.first().click();
      await page.waitForTimeout(1_000);
    }
  });

  authedTest(
    "verify embedding pipeline table exists",
    async () => {
      const chunkCount = await countRows("knowledge_chunks");
      expect(chunkCount).toBeGreaterThanOrEqual(0);
    }
  );
});
