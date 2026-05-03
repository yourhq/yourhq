"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";

export interface InjectedHqConfig {
  projectId: string;
  url: string;
  anonKey: string;
  label: string;
  emoji: string;
}

let _config: InjectedHqConfig | null = null;

export function getHqConfig(): InjectedHqConfig | null {
  return _config;
}

export function setHqConfig(config: InjectedHqConfig | null): void {
  _config = config;
}

const HqConfigContext = createContext<InjectedHqConfig | null>(null);

export function useHqConfig(): InjectedHqConfig | null {
  return useContext(HqConfigContext);
}

export function HqConfigProvider({
  config,
  children,
}: {
  config: InjectedHqConfig | null;
  children: ReactNode;
}) {
  useEffect(() => {
    setHqConfig(config);
  }, [config]);

  /* eslint-disable react-hooks/globals */
  if (_config === null && config !== null) {
    _config = config;
  }
  /* eslint-enable react-hooks/globals */

  return (
    <HqConfigContext.Provider value={config}>
      {children}
    </HqConfigContext.Provider>
  );
}
