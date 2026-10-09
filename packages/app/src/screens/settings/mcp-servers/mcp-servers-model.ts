import type { DaemonMcpServer } from "@getpaseo/protocol/daemon-mcp-server";
import type { McpTransport } from "./mcp-server-form-model";

export type McpServers = Record<string, DaemonMcpServer>;

export interface McpServerRow {
  name: string;
  enabled: boolean;
  transport: McpTransport;
  /** The command line or URL, as shown under the name. */
  summary: string;
}

export type McpServersLoadState =
  | { status: "disconnected" }
  | { status: "unsupported" }
  | { status: "loading" }
  | { status: "loaded"; servers: McpServers };

export function resolveMcpServersLoadState(input: {
  isConnected: boolean;
  supported: boolean;
  isLoading: boolean;
  servers: McpServers | undefined | null;
  hasConfig: boolean;
}): McpServersLoadState {
  if (!input.isConnected) return { status: "disconnected" };
  if (!input.supported) return { status: "unsupported" };
  if (!input.hasConfig || input.isLoading) return { status: "loading" };
  return { status: "loaded", servers: input.servers ?? {} };
}

function summarize(server: DaemonMcpServer): string {
  const { config } = server;
  return config.type === "stdio" ? [config.command, ...(config.args ?? [])].join(" ") : config.url;
}

export function listMcpServerRows(servers: McpServers): McpServerRow[] {
  return Object.entries(servers)
    .map(([name, server]) => ({
      name,
      enabled: server.enabled !== false,
      transport: server.config.type,
      summary: summarize(server),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Add a server, or replace `previousName`'s entry (a rename keeps its place in the map). */
export function upsertMcpServer(
  servers: McpServers,
  input: { name: string; value: DaemonMcpServer; previousName?: string },
): McpServers {
  const next: McpServers = {};
  let placed = false;
  for (const [name, value] of Object.entries(servers)) {
    if (name === input.previousName) {
      next[input.name] = input.value;
      placed = true;
    } else if (name !== input.name) {
      next[name] = value;
    }
  }
  if (!placed) {
    next[input.name] = input.value;
  }
  return next;
}

export function removeMcpServer(servers: McpServers, name: string): McpServers {
  return Object.fromEntries(Object.entries(servers).filter(([key]) => key !== name));
}

export function setMcpServerEnabled(
  servers: McpServers,
  name: string,
  enabled: boolean,
): McpServers {
  const current = servers[name];
  if (!current) return servers;
  const { enabled: _previous, ...rest } = current;
  return { ...servers, [name]: enabled ? rest : { ...rest, enabled: false } };
}
