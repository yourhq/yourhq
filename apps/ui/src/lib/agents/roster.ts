export interface AgentCapability {
  label: string;
  detail: string;
}

export interface AgentTemplate {
  key: string;
  branch: string;
  name: string;
  emoji: string;
  role: string;
  description: string;
  capabilities: AgentCapability[];
}

export const AGENT_ROSTER: AgentTemplate[] = [
  {
    key: "scout", branch: "template/crm-researcher", name: "Scout", emoji: "\u{1F575}️", role: "Sales & Outreach",
    description: "Your dedicated sales partner — researches targets, crafts outreach, and keeps your pipeline moving.",
    capabilities: [
      { label: "Prospect research", detail: "Deep-dives into companies, finds decision-makers, and builds target profiles" },
      { label: "Outreach drafting", detail: "Writes personalized emails and messages tailored to each prospect" },
      { label: "Pipeline tracking", detail: "Keeps your deals organized and flags follow-ups before they slip" },
      { label: "Meeting prep", detail: "Summarizes notes, tracks next steps, and preps you before every call" },
    ],
  },
  {
    key: "ghost", branch: "template/ghostwriter", name: "Ghost", emoji: "\u{1F469}‍\u{1F4BB}", role: "Content Writer",
    description: "Your writing partner — drafts in your voice, researches topics, and keeps your content calendar full.",
    capabilities: [
      { label: "Content drafting", detail: "Writes newsletters, blog posts, and social threads in your voice" },
      { label: "Topic research", detail: "Finds angles, pulls sources, and builds outlines before you write" },
      { label: "Editing & refinement", detail: "Tightens drafts, adjusts tone, and incorporates your feedback" },
      { label: "Calendar planning", detail: "Plans your publishing schedule and tracks what's due next" },
    ],
  },
  {
    key: "chief", branch: "template/chief-of-staff", name: "Chief", emoji: "\u{1F9B8}", role: "Operations",
    description: "Your operations lead — coordinates work, tracks clients, and keeps everything on schedule.",
    capabilities: [
      { label: "Task management", detail: "Breaks down projects, assigns priorities, and tracks progress" },
      { label: "Client tracking", detail: "Keeps accounts organized with status, notes, and next actions" },
      { label: "Blocker alerts", detail: "Surfaces overdue items and bottlenecks before they become problems" },
      { label: "Status updates", detail: "Prepares summaries and reports so you always know where things stand" },
    ],
  },
  {
    key: "researcher", branch: "template/assistant", name: "Researcher", emoji: "\u{1F9D1}‍\u{1F52C}", role: "Research & Analysis",
    description: "Your research analyst — digs deep into topics, synthesizes findings, and keeps your knowledge organized.",
    capabilities: [
      { label: "Deep research", detail: "Investigates markets, companies, and trends with structured analysis" },
      { label: "Brief creation", detail: "Synthesizes findings into clear, actionable summaries" },
      { label: "Monitoring", detail: "Tracks topics over time and surfaces new developments" },
      { label: "Knowledge organization", detail: "Files research into your knowledge base so nothing gets lost" },
    ],
  },
  {
    key: "assistant", branch: "template/assistant", name: "Assistant", emoji: "\u{1F9D1}‍\u{1F4BC}", role: "General Assistant",
    description: "Your right hand — manages tasks, tracks what matters, and handles the day-to-day so you can focus.",
    capabilities: [
      { label: "Task management", detail: "Organizes your to-dos, sets priorities, and tracks deadlines" },
      { label: "Research & writing", detail: "Looks into topics and drafts docs, messages, and quick write-ups" },
      { label: "Project tracking", detail: "Monitors progress across workstreams and flags what needs attention" },
      { label: "Workspace upkeep", detail: "Keeps everything organized, up to date, and easy to find" },
    ],
  },
  {
    key: "cofounder", branch: "template/cofounder", name: "Co-Founder", emoji: "\u{1F680}", role: "Strategy & Execution",
    description: "Your strategic operator — helps drive execution, shape direction, and keep the business moving.",
    capabilities: [
      { label: "Strategic planning", detail: "Breaks down big goals into actionable next steps" },
      { label: "Decision support", detail: "Frames trade-offs and surfaces the data you need to decide" },
      { label: "Execution tracking", detail: "Keeps initiatives on track and flags when things stall" },
      { label: "Market awareness", detail: "Monitors competitors, trends, and opportunities" },
    ],
  },
  {
    key: "cmo", branch: "template/cmo", name: "CMO", emoji: "\u{1F4E1}", role: "Marketing Strategy",
    description: "Your marketing strategist — designs messaging, plans campaigns, and builds your funnel.",
    capabilities: [
      { label: "Campaign strategy", detail: "Plans multi-channel campaigns aligned to your goals" },
      { label: "Messaging & positioning", detail: "Crafts clear value props that resonate with your audience" },
      { label: "Funnel design", detail: "Maps the journey from awareness to conversion" },
      { label: "Performance analysis", detail: "Tracks what's working and recommends where to double down" },
    ],
  },
  {
    key: "analytics", branch: "template/analytics", name: "Analytics", emoji: "\u{1F4CA}", role: "Data & Insights",
    description: "Your performance analyst — turns activity and outcomes into clear metrics and action items.",
    capabilities: [
      { label: "Metric tracking", detail: "Monitors KPIs and highlights meaningful changes" },
      { label: "Trend analysis", detail: "Spots patterns in your data and explains what's driving them" },
      { label: "Reporting", detail: "Builds clear dashboards and summaries for stakeholders" },
      { label: "Recommendations", detail: "Translates insights into specific next steps" },
    ],
  },
  {
    key: "designer", branch: "template/designer", name: "Designer", emoji: "\u{1F3A8}", role: "Visual Design",
    description: "Your visual creator — turns ideas into clear, engaging graphics and polished content.",
    capabilities: [
      { label: "Graphic creation", detail: "Designs social graphics, presentations, and brand assets" },
      { label: "Content formatting", detail: "Polishes docs and decks for a professional look" },
      { label: "Brand consistency", detail: "Keeps your visual identity cohesive across everything" },
      { label: "Creative concepts", detail: "Explores visual directions and translates ideas into layouts" },
    ],
  },
  {
    key: "market-researcher", branch: "template/market-researcher", name: "Market Intel", emoji: "\u{1F52E}", role: "Market Intelligence",
    description: "Your external intelligence agent — scans markets, spots patterns, and surfaces meaningful signals.",
    capabilities: [
      { label: "Competitive analysis", detail: "Tracks competitors, their moves, and positioning shifts" },
      { label: "Market scanning", detail: "Monitors industry trends and emerging opportunities" },
      { label: "Signal detection", detail: "Surfaces news, funding rounds, and key market events" },
      { label: "Intelligence briefs", detail: "Delivers structured summaries you can act on quickly" },
    ],
  },
];

export const INTENT_TO_AGENT_KEY: Record<string, string> = {
  reach: "scout",
  publish: "ghost",
  run: "chief",
  hire: "scout",
  research: "researcher",
  organized: "assistant",
  explore: "assistant",
};
