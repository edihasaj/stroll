import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";
import React from "react";
import type { ToastApi } from "@/components/toast-host";
import type { OpenFileDisposition } from "@/workspace/file-open";
import type { InlinePathTarget } from "./parse";
import type { AssistantFileLinkContext, GetDirectorySuggestions } from "./resolver";

export interface AssistantFileLinkDaemonClient {
  getDirectorySuggestions: GetDirectorySuggestions;
  /**
   * Resolves when `path` (rooted at `cwd`) is a directory, rejects otherwise. Used only to probe
   * an ambiguous target whose kind the string shape couldn't determine — see use-file-link.ts.
   */
  listDirectory?: (cwd: string, path: string) => Promise<unknown>;
}

export interface AssistantFileLinkResolverConfig {
  client?: AssistantFileLinkDaemonClient | null;
  serverId?: string;
  workspaceRoot?: string;
  onOpenWorkspaceFile?: (target: InlinePathTarget, disposition: OpenFileDisposition) => void;
  /** Sibling of `onOpenWorkspaceFile` for targets that resolve to a directory. */
  onOpenWorkspaceFolder?: (path: string) => void;
  toast?: ToastApi | null;
}

export interface AssistantFileLinkResolverProviderProps extends AssistantFileLinkResolverConfig {
  children: ReactNode;
}

export interface AssistantFileLinkResolverContextValue {
  configRef: MutableRefObject<AssistantFileLinkResolverConfig>;
  getDirectorySuggestions: GetDirectorySuggestions;
}

const AssistantFileLinkResolverContext =
  createContext<AssistantFileLinkResolverContextValue | null>(null);

export function AssistantFileLinkResolverProvider({
  client,
  serverId,
  workspaceRoot,
  onOpenWorkspaceFile,
  onOpenWorkspaceFolder,
  toast,
  children,
}: AssistantFileLinkResolverProviderProps) {
  const configRef = useRef<AssistantFileLinkResolverConfig>({
    client,
    serverId,
    workspaceRoot,
    onOpenWorkspaceFile,
    onOpenWorkspaceFolder,
    toast,
  });
  configRef.current = {
    client,
    serverId,
    workspaceRoot,
    onOpenWorkspaceFile,
    onOpenWorkspaceFolder,
    toast,
  };

  const getDirectorySuggestions = useCallback<GetDirectorySuggestions>(async (input) => {
    const activeClient = configRef.current.client;
    if (!activeClient) {
      return { entries: [], error: null };
    }

    const result = await activeClient.getDirectorySuggestions(input);
    return { entries: result.entries, error: result.error };
  }, []);

  const value = useMemo<AssistantFileLinkResolverContextValue>(
    () => ({ configRef, getDirectorySuggestions }),
    [getDirectorySuggestions],
  );

  return (
    <AssistantFileLinkResolverContext.Provider value={value}>
      {children}
    </AssistantFileLinkResolverContext.Provider>
  );
}

export function useAssistantFileLinkResolverContext(): AssistantFileLinkResolverContextValue {
  const context = useContext(AssistantFileLinkResolverContext);
  if (!context) {
    throw new Error("AssistantFileLinkResolverProvider is required for assistant file links.");
  }
  return context;
}

/**
 * Same context, without the throw. User messages aren't wrapped in a resolver provider today, so
 * their path-link rendering (components/message.tsx) uses this to stay plain text there instead
 * of crashing, and to light up automatically once a provider is added around them.
 */
export function useOptionalAssistantFileLinkResolverContext(): AssistantFileLinkResolverContextValue | null {
  return useContext(AssistantFileLinkResolverContext);
}

export type { AssistantFileLinkContext };
