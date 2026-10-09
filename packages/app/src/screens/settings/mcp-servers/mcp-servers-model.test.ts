import { describe, expect, it } from "vitest";
import type { DaemonMcpServer } from "@getpaseo/protocol/daemon-mcp-server";
import {
  listMcpServerRows,
  removeMcpServer,
  resolveMcpServersLoadState,
  setMcpServerEnabled,
  upsertMcpServer,
} from "./mcp-servers-model";

const docs: DaemonMcpServer = { config: { type: "http", url: "https://docs.example.com/mcp" } };
const files: DaemonMcpServer = {
  enabled: false,
  config: { type: "stdio", command: "npx", args: ["-y", "files-mcp"] },
};

describe("resolveMcpServersLoadState", () => {
  const loaded = { isConnected: true, supported: true, isLoading: false, hasConfig: true };

  it("is not empty until the host answered", () => {
    expect(resolveMcpServersLoadState({ ...loaded, isConnected: false, servers: {} })).toEqual({
      status: "disconnected",
    });
    expect(resolveMcpServersLoadState({ ...loaded, hasConfig: false, servers: undefined })).toEqual(
      { status: "loading" },
    );
    expect(resolveMcpServersLoadState({ ...loaded, isLoading: true, servers: {} })).toEqual({
      status: "loading",
    });
  });

  it("tells a host that cannot store servers apart from one with none", () => {
    expect(resolveMcpServersLoadState({ ...loaded, supported: false, servers: {} })).toEqual({
      status: "unsupported",
    });
    expect(resolveMcpServersLoadState({ ...loaded, servers: undefined })).toEqual({
      status: "loaded",
      servers: {},
    });
  });
});

describe("listMcpServerRows", () => {
  it("sorts by name and summarizes the command line or URL", () => {
    expect(listMcpServerRows({ files, docs })).toEqual([
      { name: "docs", enabled: true, transport: "http", summary: "https://docs.example.com/mcp" },
      { name: "files", enabled: false, transport: "stdio", summary: "npx -y files-mcp" },
    ]);
  });
});

describe("MCP server edits", () => {
  it("adds a server without touching the others", () => {
    expect(upsertMcpServer({ docs }, { name: "files", value: files })).toEqual({ docs, files });
  });

  it("renames in place and drops the old name", () => {
    const next = upsertMcpServer(
      { docs, files },
      { name: "manuals", previousName: "docs", value: docs },
    );

    expect(Object.keys(next)).toEqual(["manuals", "files"]);
  });

  it("removes a server", () => {
    expect(removeMcpServer({ docs, files }, "docs")).toEqual({ files });
  });

  it("stores disabled as an explicit false and enabled as the default", () => {
    const disabled = setMcpServerEnabled({ docs }, "docs", false);
    expect(disabled.docs).toEqual({ ...docs, enabled: false });
    expect(setMcpServerEnabled(disabled, "docs", true).docs).toEqual(docs);
  });

  it("ignores a toggle for a server that is gone", () => {
    const servers = { docs };
    expect(setMcpServerEnabled(servers, "missing", false)).toBe(servers);
  });
});
