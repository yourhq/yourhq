import { test as base, type Page } from "@playwright/test";
import path from "path";

const STORAGE_STATE = path.resolve(__dirname, "../.auth/user.json");

export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: STORAGE_STATE,
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export async function loginViaUI(page: Page) {
  const email = process.env.E2E_USER_EMAIL || "e2e-test@yourhq.ai";
  const password = process.env.E2E_USER_PASSWORD || "TestPass123!";

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL("**/dashboard**", { timeout: 30_000 });
}

export async function saveAuthState(page: Page) {
  const dir = path.dirname(STORAGE_STATE);
  const fs = await import("fs");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
}

export { STORAGE_STATE };
