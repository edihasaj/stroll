import {
  RESERVED_DAEMON_MCP_SERVER_NAME,
  type DaemonMcpServer,
} from "@getpaseo/protocol/daemon-mcp-server";
import type { AgentSessionConfig, McpServerConfig } from "./agent-sdk-types.js";

/**
 * Adds the daemon's enabled, user-configured MCP servers to a launch config. A server the agent
 * request already names wins, and the daemon's own `paseo` server is never replaced. Only the
 * launch config gets these: the stored config keeps what the caller asked for, so a server the
 * user later removes or disables is gone from the next launch instead of pinned into the record.
 */
export function withUserMcpServers(
  config: AgentSessionConfig,
  userServers: Record<string, DaemonMcpServer> | undefined,
): AgentSessionConfig {
  const enabled: Record<string, McpServerConfig> = {};
  for (const [name, server] of Object.entries(userServers ?? {})) {
    if (server.enabled === false || name === RESERVED_DAEMON_MCP_SERVER_NAME) continue;
    enabled[name] = server.config;
  }
  if (Object.keys(enabled).length === 0) {
    return config;
  }
  return { ...config, mcpServers: { ...enabled, ...config.mcpServers } };
}
