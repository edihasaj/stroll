import { useCallback } from "react";
import type { AgentProfile } from "@getpaseo/protocol/messages";
import type { AgentRoute } from "@getpaseo/protocol/agent-route";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useHostFeature } from "@/runtime/host-features";

export interface UseAgentRoutesConfigResult {
  /** `null` until the daemon config has arrived. */
  routes: AgentRoute[] | null;
  /** `null` until the daemon config has arrived. Used to resolve an entry's profile name. */
  profiles: AgentProfile[] | null;
  defaultRouteId: string | null;
  /** False on daemons that predate agent routes, or while disconnected. */
  isSupported: boolean;
  isLoading: boolean;
  /** `null` clears the default; routes themselves stay config.json-only (docs/agent-routes.md). */
  setDefaultRoute: (routeId: string | null) => Promise<void>;
}

export function useAgentRoutesConfig(serverId: string | null): UseAgentRoutesConfigResult {
  const { config, isLoading, patchConfig } = useDaemonConfig(serverId);
  const isSupported = useHostFeature(serverId, "agentRoutes");

  const setDefaultRoute = useCallback(
    async (routeId: string | null) => {
      await patchConfig({ defaultAgentRoute: routeId });
    },
    [patchConfig],
  );

  return {
    routes: config ? (config.agentRoutes ?? []) : null,
    profiles: config ? (config.agentProfiles ?? []) : null,
    defaultRouteId: config ? (config.defaultAgentRoute ?? null) : null,
    isSupported,
    isLoading,
    setDefaultRoute,
  };
}
