export const WORKSPACE = {
  name: "E2E Test Workspace",
  slug: "e2e-test",
  ownerName: "E2E Tester",
  preferredName: "Tester",
};

export const AGENTS = {
  scout: {
    template: "scout",
    name: "Scout",
    description: "Outreach and research agent for E2E testing",
  },
  ghostwriter: {
    template: "ghostwriter",
    name: "Ghostwriter",
    description: "Content writer agent for E2E testing",
  },
};

export const TASKS = {
  basic: {
    title: "E2E: Basic task lifecycle",
    description: "Test task for verifying create, assign, and complete flow",
  },
  withBlocker: {
    title: "E2E: Task with blocker",
    description: "This task is blocked by the research task",
  },
  blocker: {
    title: "E2E: Research task (blocker)",
    description: "Complete this to unblock the dependent task",
  },
};

export const KNOWLEDGE = {
  page: {
    title: "E2E: Test Knowledge Page",
    content: "This is a test knowledge page created by the E2E suite.",
  },
  skill: {
    title: "E2E: Test Skill",
    content: "When asked about testing, explain the E2E test methodology.",
  },
};

export const CRM = {
  contact: {
    firstName: "Jane",
    lastName: "Doe",
    email: "jane.doe@example.com",
  },
  organization: {
    name: "Acme Corp",
    type: "company",
    website: "https://acme.example.com",
  },
};

export const LABELS = [
  { name: "e2e-urgent", color: "#EF4444" },
  { name: "e2e-feature", color: "#3B82F6" },
  { name: "e2e-bug", color: "#F59E0B" },
];

export const BUDGETS = {
  openai: { limit: 1.0, provider: "openai" },
  anthropic: { limit: 2.0, provider: "anthropic" },
};

export const COLLECTION = {
  name: "E2E Test Collection",
  slug: "e2e-test-collection",
  fields: [
    { name: "Status", type: "select", options: ["Open", "Closed", "Pending"] },
    { name: "Priority", type: "number" },
    { name: "Notes", type: "text" },
  ],
};

export const ROUTINE = {
  name: "E2E: Daily check-in",
  instruction: "Check the task board and report any overdue items.",
  cadence: "daily",
};
