export interface FirstTaskSuggestion {
  title: string;
  placeholder?: string;
}

export const FIRST_TASK_SUGGESTIONS: Record<string, FirstTaskSuggestion> = {
  reach: {
    title: "Research 3 potential partners in [your space] and prepare outreach briefs",
    placeholder: "your space",
  },
  deals: {
    title: "Research [company] and find the right decision-maker to reach",
    placeholder: "company",
  },
  hire: {
    title: "Find 3 strong candidates for [role] and summarize their profiles",
    placeholder: "role",
  },
  publish: {
    title: "Draft 3 content ideas about [topic] for [platform]",
    placeholder: "topic",
  },
  run: {
    title: "Review my current priorities and suggest what to tackle this week",
  },
  explore: {
    title: "Introduce yourself and tell me what you can help with",
  },
};
