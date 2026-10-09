import { describe, expect, it } from "vitest";
import {
  MutableDaemonConfigPatchSchema,
  MutableDaemonConfigSchema,
  type MutableDaemonConfig,
} from "./messages.js";

const baseConfig = {
  mcp: { injectIntoAgents: true },
};

describe("daemon MCP servers in the mutable config", () => {
  it("parses a config from a daemon that predates them", () => {
    const parsed: MutableDaemonConfig = MutableDaemonConfigSchema.parse(baseConfig);

    expect(parsed.mcpServers).toBeUndefined();
    expect(parsed.worktrees).toBeUndefined();
  });

  it("parses stdio, http and sse servers with an optional enabled flag", () => {
    const mcpServers = {
      files: {
        enabled: false,
        config: { type: "stdio", command: "npx", args: ["files-mcp"], env: { ROOT: "/repo" } },
      },
      docs: { config: { type: "http", url: "https://docs.example.com/mcp" } },
      events: {
        config: { type: "sse", url: "https://events.example.com/sse", headers: { A: "b" } },
      },
    };

    expect(MutableDaemonConfigSchema.parse({ ...baseConfig, mcpServers }).mcpServers).toEqual(
      mcpServers,
    );
    expect(MutableDaemonConfigPatchSchema.parse({ mcpServers }).mcpServers).toEqual(mcpServers);
  });

  it("rejects a server without a transport type", () => {
    expect(() =>
      MutableDaemonConfigPatchSchema.parse({ mcpServers: { bad: { config: { command: "x" } } } }),
    ).toThrow();
  });

  it("accepts a worktrees root and an empty patch value that clears it", () => {
    expect(MutableDaemonConfigPatchSchema.parse({ worktrees: { root: "/srv/wt" } })).toEqual({
      worktrees: { root: "/srv/wt" },
    });
    expect(MutableDaemonConfigPatchSchema.parse({ worktrees: { root: "" } })).toEqual({
      worktrees: { root: "" },
    });
  });
});
