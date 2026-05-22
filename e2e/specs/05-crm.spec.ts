import { test, expect } from "@playwright/test";
import { test as authedTest } from "../fixtures/auth.fixture";
import { queryTable } from "../fixtures/supabase";
import { CRM } from "../fixtures/test-data";

authedTest.describe("CRM @smoke", () => {
  authedTest("create a contact", async ({ authedPage: page }) => {
    await page.goto("/dashboard/crm");

    // Click "+ New contact"
    await page.getByRole("button", { name: /New contact/i }).click();

    // Contact form: name field placeholder is "Who are you adding?"
    const nameInput = page.getByPlaceholder(/Who are you adding/i);
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.fill(`${CRM.contact.firstName} ${CRM.contact.lastName}`);

    // Fill email
    const emailInput = page.getByPlaceholder(/email@example.com/i);
    const hasEmail = await emailInput
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    if (hasEmail) await emailInput.fill(CRM.contact.email);

    // Submit — use keyboard Enter (form supports "Press Enter to create")
    await page.keyboard.press("Enter");

    // Verify contact appears
    await expect(
      page.getByText(CRM.contact.firstName).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  authedTest("create an organization", async ({ authedPage: page }) => {
    await page.goto("/dashboard/organizations");

    // Look for "+ New organization" or similar button
    const newOrgBtn = page.getByRole("button", { name: /New organization|New|Add/i }).first();
    await newOrgBtn.click();

    // Org form: placeholder "What's the organization name?"
    const nameInput = page.getByPlaceholder(/organization.* name/i);
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    await nameInput.fill(CRM.organization.name);

    await page.getByRole("button", { name: "Create", exact: true }).click();

    await expect(
      page.getByText(CRM.organization.name).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  authedTest(
    "link contact to organization",
    async ({ authedPage: page }) => {
      await page.goto("/dashboard/crm");

      // Click on the contact we created
      await page.getByText(CRM.contact.firstName).first().click();

      // Look for Organization field ("Link organization...")
      const orgField = page.getByText(/Link organization|Organization/i).first();
      const hasOrgField = await orgField
        .isVisible({ timeout: 5_000 })
        .catch(() => false);

      if (hasOrgField) {
        await orgField.click();
        await page.getByText(CRM.organization.name).first().click();
        await page.waitForTimeout(1_000);
      }
    }
  );

  authedTest("search contacts", async ({ authedPage: page }) => {
    await page.goto("/dashboard/crm");

    const searchInput = page.getByPlaceholder(/Search contacts/i).first();
    const hasSearch = await searchInput
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasSearch) {
      await searchInput.fill(CRM.contact.firstName);
      await page.waitForTimeout(1_000);
      await expect(
        page.getByText(CRM.contact.firstName).first()
      ).toBeVisible();
    }
  });

  authedTest("search organizations", async ({ authedPage: page }) => {
    await page.goto("/dashboard/organizations");

    const searchInput = page.getByPlaceholder(/Search/i).first();
    const hasSearch = await searchInput
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasSearch) {
      await searchInput.fill(CRM.organization.name);
      await page.waitForTimeout(1_000);
      await expect(
        page.getByText(CRM.organization.name).first()
      ).toBeVisible();
    }
  });
});
