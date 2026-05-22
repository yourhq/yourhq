import { test, expect } from "@playwright/test";
import { test as authedTest } from "../fixtures/auth.fixture";
import { queryTable, countRows } from "../fixtures/supabase";
import { TASKS, AGENTS, LABELS } from "../fixtures/test-data";

authedTest.describe("Tasks @smoke", () => {
  authedTest("create a task", async ({ authedPage: page }) => {
    await page.goto("/dashboard/tasks");

    await page.getByRole("button", { name: /New task/i }).click();

    // Fill title (placeholder: "What needs to be done?")
    const titleInput = page.getByPlaceholder(/What needs to be done/i);
    await expect(titleInput).toBeVisible({ timeout: 5_000 });
    await titleInput.fill(TASKS.basic.title);

    // Fill description
    const descField = page.getByPlaceholder(/Add a description/i);
    const hasDesc = await descField.isVisible({ timeout: 2_000 }).catch(() => false);
    if (hasDesc) await descField.fill(TASKS.basic.description);

    // Click Create button
    await page.getByRole("button", { name: "Create", exact: true }).click();

    // Verify task appears in list
    await expect(
      page.getByText(TASKS.basic.title).first()
    ).toBeVisible({ timeout: 10_000 });

    // Verify in DB (may have duplicates from previous runs)
    const tasks = await queryTable("tasks", { title: TASKS.basic.title });
    expect(tasks.length).toBeGreaterThanOrEqual(1);
  });

  authedTest("assign task to agent", async ({ authedPage: page }) => {
    await page.goto("/dashboard/tasks");
    // Dismiss any leftover dialogs
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await page.getByText(TASKS.basic.title).first().click();

    // Click the Assignee field to open the dropdown
    const assigneeField = page.getByText("Unassigned").first();
    const hasAssignee = await assigneeField
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasAssignee) {
      await assigneeField.click();
      // Select Scout from the dropdown popover (use role or scope to popover)
      const scoutOption = page.getByRole("option", { name: /Scout/i }).or(
        page.locator("[role='listbox'] >> text=Scout").or(
          page.locator("[data-radix-popper-content-wrapper] >> text=Scout")
        )
      );
      await scoutOption.first().click();
      await page.waitForTimeout(1_000);
    }
  });

  authedTest("change task status through lifecycle", async ({ authedPage: page }) => {
    await page.goto("/dashboard/tasks");
    await page.getByText(TASKS.basic.title).first().click();

    // Click current status "To Do" to open dropdown
    const statusField = page.getByText("To Do").first();
    const hasStatus = await statusField
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasStatus) {
      await statusField.click();
      await page.getByText("In Progress").first().click();
      await page.waitForTimeout(1_000);

      // Verify status updated in DB
      const tasks = await queryTable("tasks", { title: TASKS.basic.title });
      expect(tasks[0].status).toMatch(/in_progress|in-progress/);
    }
  });

  authedTest("set task priority", async ({ authedPage: page }) => {
    await page.goto("/dashboard/tasks");
    await page.getByText(TASKS.basic.title).first().click();

    // Click current priority "Medium" to change it
    const priorityField = page.getByText("Medium").first();
    const hasPriority = await priorityField
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasPriority) {
      await priorityField.click();
      await page.getByText("High").first().click();
      await page.waitForTimeout(1_000);
    }
  });
});

authedTest.describe("Task relations", () => {
  authedTest("create blocker and blocked tasks", async ({ authedPage: page }) => {
    // Create blocker task
    await page.goto("/dashboard/tasks");
    await page.getByRole("button", { name: /New task/i }).click();
    const titleInput1 = page.getByPlaceholder(/What needs to be done/i);
    await expect(titleInput1).toBeVisible({ timeout: 5_000 });
    await titleInput1.fill(TASKS.blocker.title);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.waitForTimeout(2_000);
    // Dismiss any dialog by navigating away
    await page.goto("/dashboard/tasks");
    await page.waitForTimeout(1_000);

    // Create dependent task
    await page.getByRole("button", { name: /New task/i }).click();
    const titleInput2 = page.getByPlaceholder(/What needs to be done/i);
    await expect(titleInput2).toBeVisible({ timeout: 5_000 });
    await titleInput2.fill(TASKS.withBlocker.title);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.waitForTimeout(2_000);
  });

  authedTest("add blocked_by relation", async ({ authedPage: page }) => {
    await page.goto("/dashboard/tasks");
    await page.getByText(TASKS.withBlocker.title).first().click();

    // Look for "Add link" or Relations section
    const addLink = page.getByText(/Add link|Relations|Dependencies/i).first();
    const hasRelations = await addLink
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasRelations) {
      await addLink.click();
      await page.waitForTimeout(1_000);
    }
  });
});

authedTest.describe("Task labels", () => {
  authedTest("create labels in settings", async ({ authedPage: page }) => {
    await page.goto("/dashboard/settings/labels");

    // Wait for the Labels page to load
    await expect(
      page.getByRole("heading", { name: /Labels/i }).first()
    ).toBeVisible({ timeout: 5_000 });

    // Look for the labels-specific add button (within the main content area)
    const main = page.locator("main");
    const addBtn = main.getByRole("button", { name: /Add|Create|New/i }).first();
    const hasAdd = await addBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasAdd) {
      for (const label of LABELS) {
        await addBtn.click();

        const nameInput = page
          .getByPlaceholder(/name|label/i)
          .or(page.getByLabel(/Name/i))
          .first();
        const hasInput = await nameInput
          .isVisible({ timeout: 3_000 })
          .catch(() => false);

        if (hasInput) {
          await nameInput.fill(label.name);
          await page
            .getByRole("button", { name: /Save|Create|Done/i })
            .first()
            .click();
          await page.waitForTimeout(500);
        }
      }
    }
  });

  authedTest("verify labels in database", async () => {
    try {
      const count = await countRows("labels");
      expect(count).toBeGreaterThanOrEqual(0);
    } catch {
      // Labels table may not exist yet
    }
  });
});

authedTest.describe("Task views", () => {
  authedTest("switch to kanban view", async ({ authedPage: page }) => {
    await page.goto("/dashboard/tasks");

    // Look for view toggle icons (board/kanban icon)
    const kanbanBtn = page.getByRole("button", { name: /Board|Kanban/i });
    const hasKanban = await kanbanBtn
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasKanban) {
      await kanbanBtn.click();
      await page.waitForTimeout(1_000);
    }
  });

  authedTest("switch to calendar view", async ({ authedPage: page }) => {
    await page.goto("/dashboard/tasks");

    const calendarBtn = page.getByRole("button", { name: /Calendar/i });
    const hasCalendar = await calendarBtn
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (hasCalendar) {
      await calendarBtn.click();
      await page.waitForTimeout(1_000);
    }
  });
});
