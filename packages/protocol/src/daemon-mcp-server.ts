import { z } from "zod";

const McpStdioServerConfigSchema = z.object({
  type: z.literal("stdio"),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  alwaysLoad: z.boolean().optional(),
});

const McpHttpServerConfigSchema = z.object({
  type: z.literal("http"),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  alwaysLoad: z.boolean().optional(),
});

const McpSseServerConfigSchema = z.object({
  type: z.literal("sse"),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  alwaysLoad: z.boolean().optional(),
});

export const McpServerConfigSchema = z.discriminatedUnion("type", [
  McpStdioServerConfigSchema,
  McpHttpServerConfigSchema,
  McpSseServerConfigSchema,
]);

/**
 * An MCP server the user configured on the daemon (Settings → MCP servers). The daemon adds every
 * enabled one to the launch config of each agent it starts or resumes, beside the `paseo` server.
 * The map key is the server name agents see; a server an agent request names explicitly wins.
 */
export const DaemonMcpServerSchema = z.object({
  /** Absent means enabled. */
  enabled: z.boolean().optional(),
  config: McpServerConfigSchema,
});
export type DaemonMcpServer = z.infer<typeof DaemonMcpServerSchema>;

/** `paseo` is the daemon's own tool server; a user server cannot take its name. */
export const RESERVED_DAEMON_MCP_SERVER_NAME = "paseo";
