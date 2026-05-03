"use client";

import { createContext, useContext } from "react";

type WorkspaceModules = Record<string, boolean>;

const ModulesContext = createContext<WorkspaceModules>({});

export function ModulesProvider({
  modules,
  children,
}: {
  modules?: WorkspaceModules;
  children: React.ReactNode;
}) {
  return (
    <ModulesContext.Provider value={modules ?? {}}>
      {children}
    </ModulesContext.Provider>
  );
}

export function useModules(): WorkspaceModules {
  return useContext(ModulesContext);
}
