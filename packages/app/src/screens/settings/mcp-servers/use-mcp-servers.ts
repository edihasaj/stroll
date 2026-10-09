import { useCallback } from "react";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import {
  resolveMcpServersLoadState,
  type McpServers,
  type McpServersLoadState,
} from "./mcp-servers-model";

interface UseMcpServersResult {
  state: McpServersLoadState;
  /** Replaces the host's whole server map. */
  saveServers: (servers: McpServers) => Promise<void>;
}

export function useMcpServers(serverId: string): UseMcpServersResult {
  const isConnected = useHostRuntimeIsConnected(serverId);
  const supported = useHostFeature(serverId, "daemonMcpServers");
  const { config, isLoading, patchConfig } = useDaemonConfig(serverId);

  const saveServers = useCallback(
    async (servers: McpServers) => {
      await patchConfig({ mcpServers: servers });
    },
    [patchConfig],
  );

  return {
    state: resolveMcpServersLoadState({
      isConnected,
      supported,
      isLoading,
      hasConfig: config !== null,
      servers: config?.mcpServers,
    }),
    saveServers,
  };
}
