let counter = 0;

export function buildLabel(overrides: Record<string, unknown> = {}) {
  counter++;
  return {
    id: `label-${counter}`,
    created_at: new Date().toISOString(),
    name: `Label ${counter}`,
    color: "#3b82f6",
    description: null as string | null,
    ...overrides,
  };
}
