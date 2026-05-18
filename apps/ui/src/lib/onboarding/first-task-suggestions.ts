export interface FirstTaskSuggestion {
  title: string;
  placeholder?: string;
}

export const FIRST_TASK_SUGGESTIONS: Record<string, FirstTaskSuggestion> = {
  reach: {
    title: "Research 3 potential customers in [your space] and prepare outreach briefs",
    placeholder: "your space",
  },
  publish: {
    title: "Draft 3 content ideas about [topic] for [platform]",
    placeholder: "topic",
  },
  run: {
    title: "Review my current client projects and flag anything that needs attention",
  },
  hire: {
    title: "Find 3 strong candidates for [role] and summarize their profiles",
    placeholder: "role",
  },
  research: {
    title: "Research [topic] and summarize the key findings",
    placeholder: "topic",
  },
  organized: {
    title: "Introduce yourself and tell me what you can help with",
  },
  explore: {
    title: "Introduce yourself and tell me what you can help with",
  },
};
