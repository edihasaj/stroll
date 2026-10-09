import { describe, expect, test } from "vitest";
import type { DaemonMcpServer } from "@getpaseo/protocol/daemon-mcp-server";
import type { AgentSessionConfig } from "./agent-sdk-types.js";
import { withUserMcpServers } from "./user-mcp-servers.js";

const baseConfig: AgentSessionConfig = { provider: "claude", cwd: "/repo" };

const docs: DaemonMcpServer = { config: { type: "http", url: "https://docs.example.com/mcp" } };
const files: DaemonMcpServer = {
  config: { type: "stdio", command: "npx", args: ["files-mcp"], env: { ROOT: "/repo" } },
};

describe("withUserMcpServers", () => {
  test("adds every enabled user server to the launch config", () => {
    const config = withUserMcpServers(baseConfig, { docs, files });

    expect(config.mcpServers).toEqual({ docs: docs.config, files: files.config });
  });

  test("skips disabled servers", () => {
    const config = withUserMcpServers(baseConfig, {
      docs: { ...docs, enabled: false },
      files: { ...files, enabled: true },
    });

    expect(Object.keys(config.mcpServers ?? {})).toEqual(["files"]);
  });

  test("keeps a server the agent request names ahead of a user server with the same name", () => {
    const requested = { type: "http", url: "https://requested.example.com/mcp" } as const;
    const config = withUserMcpServers({ ...baseConfig, mcpServers: { docs: requested } }, { docs });

    expect(config.mcpServers).toEqual({ docs: requested });
  });

  test("never lets a user server take the daemon's own paseo name", () => {
    const config = withUserMcpServers(baseConfig, { paseo: docs, files });

    expect(Object.keys(config.mcpServers ?? {})).toEqual(["files"]);
  });

  test("returns the config untouched when there is nothing to add", () => {
    expect(withUserMcpServers(baseConfig, undefined)).toBe(baseConfig);
    expect(withUserMcpServers(baseConfig, { docs: { ...docs, enabled: false } })).toBe(baseConfig);
  });
});
