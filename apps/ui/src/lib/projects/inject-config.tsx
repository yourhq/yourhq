// Re-export the config type from its canonical location.
// The HqConfigScript server component has been removed in favor of
// HqConfigProvider (a client context set from the root layout's
// server-rendered props).
export type { InjectedHqConfig } from "./hq-config-provider";
