import { createContext, useContext, type ReactNode } from "react";

const HeaderActionsContext = createContext<ReactNode>(null);

export function WorkspaceHeaderActionsProvider({
  children,
  actions,
}: {
  children: ReactNode;
  actions: ReactNode;
}) {
  return <HeaderActionsContext.Provider value={actions}>{children}</HeaderActionsContext.Provider>;
}

export function useWorkspaceHeaderActions(): ReactNode {
  return useContext(HeaderActionsContext);
}
