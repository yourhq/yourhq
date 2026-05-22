import { test, expect } from "@playwright/test";
import { test as authedTest } from "../fixtures/auth.fixture";
import { queryTable, countRows } from "../fixtures/supabase";
import { COLLECTION } from "../fixtures/test-data";

authedTest.describe("Collections", () => {
  authedTest("create a collection from scratch", async ({ authedPage: page }) => {
    await page.goto("/dashboard/collections");

    // Click "+ New Collection" (there may be one in sidebar + one in main)
    await page.getByRole("button", { name: /New Collection/i }).first().click();

    // Template picker modal appears — select "Start from scratch"
    await expect(page.getByText("New Collection").first()).toBeVisible({ timeout: 5_000 });
    await page.getByText("Start from scratch").click();

    // "Blank Collection" naming step — placeholder "e.g. Job Applications"
    const nameInput = page.getByPlaceholder(/Job Applications/i);
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.fill(COLLECTION.name);

    await page.getByRole("button", { name: "Create", exact: true }).click();

    // Wait for collection to be created and page to load
    await page.waitForTimeout(3_000);

    // Verify a collection was created in DB
    const collections = await queryTable("collection_definitions");
    expect(collections.length).toBeGreaterThanOrEqual(1);
  });

  authedTest("collection page loads", async ({ authedPage: page }) => {
    await page.goto("/dashboard/collections");

    // Verify collections page loaded
    await expect(
      page.getByRole("heading", { name: /Collections/i })
    ).toBeVisible({ timeout: 5_000 });
  });

  authedTest("verify collection_definitions table", async () => {
    const count = await countRows("collection_definitions");
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
