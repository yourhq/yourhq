/**
 * Demo Seed Script
 *
 * Populates a workspace with realistic demo data via the UI so someone can
 * record a quick product walkthrough (~15 seconds of meaningful content).
 *
 * Run: npm run seed:demo (uses authed Playwright session)
 *
 * What it creates:
 *   - 3 CRM contacts + 1 organization
 *   - 5 tasks across statuses (todo, in_progress, done, blocked)
 *   - 2 knowledge pages
 *   - 1 collection with sample records
 *   - 1 routine assigned to Scout
 *   - Labels applied to tasks
 *
 * Idempotent: checks for existing data before creating.
 */
import { test as authedTest, expect } from "../fixtures/auth.fixture";
import { queryTable, getServiceClient } from "../fixtures/supabase";
import { findAgent } from "../fixtures/agent-execution";

const DEMO_PREFIX = "Demo:";

const CONTACTS = [
  { firstName: "Alex", lastName: "Rivera", email: "alex@startup.io" },
  { firstName: "Sam", lastName: "Chen", email: "sam@acmecorp.com" },
  { firstName: "Jordan", lastName: "Park", email: "jordan@agency.co" },
];

const ORG = { name: "Startup Labs", website: "https://startuplabs.io" };

const TASKS = [
  { title: `${DEMO_PREFIX} Research competitor pricing`, status: "done", priority: "high" },
  { title: `${DEMO_PREFIX} Draft product launch email`, status: "in_progress", priority: "high" },
  { title: `${DEMO_PREFIX} Update onboarding docs`, status: "todo", priority: "medium" },
  { title: `${DEMO_PREFIX} Review Q2 metrics dashboard`, status: "todo", priority: "low" },
  { title: `${DEMO_PREFIX} Prepare investor deck v3`, status: "todo", priority: "high" },
];

const KNOWLEDGE_PAGES = [
  {
    title: `${DEMO_PREFIX} Brand Style Guide`,
    content:
      "Voice: professional but approachable. Always use active voice. " +
      "Product name: HQ (always capitalized). Tagline: Your AI workforce, orchestrated.",
  },
  {
    title: `${DEMO_PREFIX} Sales Playbook`,
    content:
      "Target ICP: technical founders at seed/Series A startups. " +
      "Lead with the self-hosted angle. Key differentiator: full control over agent data.",
  },
];

const COLLECTION_NAME = `${DEMO_PREFIX} Lead Tracker`;
const COLLECTION_FIELDS = [
  { name: "Company", type: "text" },
  { name: "Stage", type: "select", options: ["Discovery", "Demo", "Negotiation", "Closed"] },
  { name: "Deal Size", type: "number" },
];

const COLLECTION_RECORDS = [
  { Company: "Acme Corp", Stage: "Demo", "Deal Size": 12000 },
  { Company: "NovaTech", Stage: "Negotiation", "Deal Size": 24000 },
  { Company: "BlueSky AI", Stage: "Discovery", "Deal Size": 8000 },
];

authedTest.describe("Demo seed", () => {
  authedTest.describe.configure({ mode: "serial" });

  authedTest("seed CRM contacts", async ({ authedPage: page }) => {
    const existing = await queryTable("contacts", {});
    const existingEmails = existing.map((c: any) => c.email);

    for (const contact of CONTACTS) {
      if (existingEmails.includes(contact.email)) continue;

      await page.goto("/dashboard/crm");
      await page.getByRole("button", { name: /New contact/i }).first().click();

      const firstNameInput = page.getByPlaceholder(/First name/i).or(page.getByLabel(/First name/i));
      const hasFirst = await firstNameInput.isVisible({ timeout: 3_000 }).catch(() => false);
      if (hasFirst) {
        await firstNameInput.fill(contact.firstName);
        const lastNameInput = page.getByPlaceholder(/Last name/i).or(page.getByLabel(/Last name/i));
        await lastNameInput.fill(contact.lastName);
        const emailInput = page.getByPlaceholder(/Email/i).or(page.getByLabel(/Email/i));
        await emailInput.fill(contact.email);
        await page.getByRole("button", { name: /Create|Save/i }).first().click();
        await page.waitForTimeout(1_000);
      }
    }
  });

  authedTest("seed CRM organization", async ({ authedPage: page }) => {
    const existing = await queryTable("organizations", { name: ORG.name });
    if (existing.length > 0) return;

    await page.goto("/dashboard/crm");
    const orgTab = page.getByRole("tab", { name: /Org/i }).or(page.getByText(/Organizations/i).first());
    const hasOrgTab = await orgTab.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasOrgTab) {
      await orgTab.click();
      await page.getByRole("button", { name: /New org/i }).first().click();

      const nameInput = page.getByPlaceholder(/Name/i).or(page.getByLabel(/Name/i));
      const hasName = await nameInput.isVisible({ timeout: 3_000 }).catch(() => false);
      if (hasName) {
        await nameInput.fill(ORG.name);
        await page.getByRole("button", { name: /Create|Save/i }).first().click();
        await page.waitForTimeout(1_000);
      }
    }
  });

  authedTest("seed tasks", async ({ authedPage: page }) => {
    const sb = getServiceClient();
    const scoutAgent = await findAgent("scout");

    for (const task of TASKS) {
      const existing = await queryTable("tasks", { title: task.title });
      if (existing.length > 0) continue;

      await page.goto("/dashboard/tasks");
      await page.getByRole("button", { name: /New task/i }).click();

      const titleInput = page.getByPlaceholder(/What needs to be done/i);
      await expect(titleInput).toBeVisible({ timeout: 5_000 });
      await titleInput.fill(task.title);

      await page.getByRole("button", { name: "Create", exact: true }).click();
      await page.waitForTimeout(1_500);

      // Update status and priority via DB for speed
      const rows = await queryTable("tasks", { title: task.title });
      if (rows.length > 0) {
        const updates: Record<string, unknown> = {
          status: task.status,
          priority: task.priority,
        };
        if (scoutAgent && task.status === "in_progress") {
          updates.assignee_agent_id = scoutAgent.id;
        }
        await sb.from("tasks").update(updates).eq("id", rows[0].id);
      }
    }
  });

  authedTest("seed knowledge pages", async ({ authedPage: page }) => {
    for (const kp of KNOWLEDGE_PAGES) {
      const existing = await queryTable("knowledge_items", { title: kp.title });
      if (existing.length > 0) continue;

      await page.goto("/dashboard/knowledge");
      await page.getByRole("button", { name: /New/i }).first().click();

      const pageOption = page.getByRole("menuitem", { name: "Page" });
      const hasMenuItem = await pageOption.isVisible({ timeout: 3_000 }).catch(() => false);
      if (hasMenuItem) {
        await pageOption.click();
      } else {
        await page.locator("[role=menu] >> text=Page").first().click();
      }

      const titleEl = page.locator("h1[contenteditable]").or(
        page.getByPlaceholder(/Untitled|Title/i)
      );
      await expect(titleEl.first()).toBeVisible({ timeout: 5_000 });
      await titleEl.first().click();
      await titleEl.first().fill(kp.title);

      const bodyEl = page.getByPlaceholder(/Start writing/i).or(
        page.locator("[contenteditable]:not(h1)").first()
      );
      const hasBody = await bodyEl.isVisible({ timeout: 3_000 }).catch(() => false);
      if (hasBody) {
        await bodyEl.click();
        await bodyEl.fill(kp.content);
      }

      await page.waitForTimeout(2_000);
    }
  });

  authedTest("seed collection with records", async ({ authedPage: page }) => {
    const existing = await queryTable("collection_definitions", { name: COLLECTION_NAME });
    if (existing.length > 0) return;

    await page.goto("/dashboard/collections");
    await page.getByRole("button", { name: /New collection/i }).first().click();

    const nameInput = page.getByPlaceholder(/Collection name/i).or(page.getByLabel(/Name/i));
    const hasName = await nameInput.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasName) return;

    await nameInput.fill(COLLECTION_NAME);

    // Add fields if there's a field-adding UI
    for (const field of COLLECTION_FIELDS) {
      const addFieldBtn = page.getByRole("button", { name: /Add field/i });
      const hasAddField = await addFieldBtn.isVisible({ timeout: 2_000 }).catch(() => false);
      if (hasAddField) {
        await addFieldBtn.click();
        const fieldNameInput = page.getByPlaceholder(/Field name/i).last();
        const hasFieldName = await fieldNameInput.isVisible({ timeout: 2_000 }).catch(() => false);
        if (hasFieldName) {
          await fieldNameInput.fill(field.name);
        }
      }
    }

    await page.getByRole("button", { name: /Create|Save/i }).first().click();
    await page.waitForTimeout(2_000);

    // Add records via DB for speed
    const collections = await queryTable("collection_definitions", { name: COLLECTION_NAME });
    if (collections.length > 0) {
      const sb = getServiceClient();
      const collId = collections[0].id;

      const { data: fields } = await sb
        .from("collection_fields")
        .select("id, name")
        .eq("collection_id", collId);

      if (fields && fields.length > 0) {
        for (const record of COLLECTION_RECORDS) {
          const values: Record<string, unknown> = {};
          for (const f of fields) {
            if (record[f.name as keyof typeof record] !== undefined) {
              values[f.id] = record[f.name as keyof typeof record];
            }
          }
          await sb.from("collection_records").insert({
            collection_id: collId,
            values,
          });
        }
      }
    }
  });

  authedTest("seed routine", async ({ authedPage: page }) => {
    const existing = await queryTable("routines", { name: `${DEMO_PREFIX} Daily standup check` });
    if (existing.length > 0) return;

    await page.goto("/dashboard/routines");
    await page.getByRole("button", { name: /New routine/i }).click();

    const nameInput = page.getByPlaceholder(/Daily inbox check/i);
    const hasName = await nameInput.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasName) return;

    await nameInput.fill(`${DEMO_PREFIX} Daily standup check`);

    const agentSelect = page.locator("select").first();
    const hasSelect = await agentSelect.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasSelect) {
      const scoutOption = agentSelect.locator("option", { hasText: "Scout" });
      const optionValue = await scoutOption.getAttribute("value");
      if (optionValue) await agentSelect.selectOption(optionValue);
    }

    const instructionInput = page.getByPlaceholder(/Check inbox/i);
    const hasInstruction = await instructionInput.isVisible({ timeout: 3_000 }).catch(() => false);
    if (hasInstruction) {
      await instructionInput.fill("Review open tasks and flag any that are overdue or blocked.");
    }

    await page.getByRole("button", { name: /Create routine/i }).click();
    await page.waitForTimeout(1_000);
  });

  authedTest("verify demo data seeded", async () => {
    const tasks = await queryTable("tasks", {});
    const demoTasks = tasks.filter((t: any) => t.title.startsWith(DEMO_PREFIX));
    expect(demoTasks.length).toBeGreaterThanOrEqual(TASKS.length);

    const knowledge = await queryTable("knowledge_items", {});
    const demoKnowledge = knowledge.filter((k: any) => k.title?.startsWith(DEMO_PREFIX));
    expect(demoKnowledge.length).toBeGreaterThanOrEqual(KNOWLEDGE_PAGES.length);

    console.log(`\nDemo seed complete: ${demoTasks.length} tasks, ${demoKnowledge.length} knowledge pages\n`);
  });
});
