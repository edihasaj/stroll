import { describe, expect, test } from "vitest";
import type { StoredAgentRecord } from "./agent/agent-storage.js";
import {
  buildConfigOverrides,
  buildSessionConfig,
  selectRecordForResume,
  toAgentPersistenceHandle,
} from "./persistence-hooks.js";

function createRecord(overrides?: Partial<StoredAgentRecord>): StoredAgentRecord {
  const now = new Date().toISOString();
  return {
    id: "agent-record",
    provider: "claude",
    cwd: "/tmp/project",
    createdAt: now,
    updatedAt: now,
    title: null,
    lastStatus: "idle",
    lastModeId: "plan",
    config: { modeId: "plan", model: "claude-3.5-sonnet" },
    persistence: {
      provider: "claude",
      sessionId: "session-123",
    },
    ...overrides,
  };
}

describe("persistence hooks", () => {
  test("buildConfigOverrides prefers the last live mode over the creation-time mode", () => {
    const record = createRecord({
      lastModeId: "bypass",
      config: { modeId: "acceptEdits" },
    });

    expect(buildConfigOverrides(record).modeId).toBe("bypass");
  });

  test("buildConfigOverrides falls back to the configured mode when no live mode was recorded", () => {
    const record = createRecord({
      lastModeId: null,
      config: { modeId: "acceptEdits" },
    });

    expect(buildConfigOverrides(record).modeId).toBe("acceptEdits");
  });

  test("buildConfigOverrides preserves the complete private launch config", () => {
    const record = createRecord({
      title: "Voice agent (current)",
      lastModeId: "default",
      config: {
        modeId: "default",
        model: "gpt-5.4-mini",
        thinkingOptionId: "minimal",
        providerOptions: {
          sandbox_mode: "workspace-write",
          sandbox_workspace_write: { writable_roots: ["/tmp/shared"] },
        },
        toolPolicy: {
          preapproved: [{ kind: "mcp", server: "paseo", tool: "report_status" }],
        },
        systemPrompt: "Use speak first.",
        mcpServers: {
          paseo: {
            type: "stdio",
            command: "node",
            args: ["/tmp/bridge.mjs", "--socket", "/tmp/agent.sock"],
          },
        },
      },
    });

    expect(buildConfigOverrides(record)).toMatchObject({
      cwd: "/tmp/project",
      modeId: "default",
      model: "gpt-5.4-mini",
      thinkingOptionId: "minimal",
      providerOptions: {
        sandbox_mode: "workspace-write",
        sandbox_workspace_write: { writable_roots: ["/tmp/shared"] },
      },
      toolPolicy: {
        preapproved: [{ kind: "mcp", server: "paseo", tool: "report_status" }],
      },
      systemPrompt: "Use speak first.",
      mcpServers: {
        paseo: {
          type: "stdio",
          command: "node",
          args: ["/tmp/bridge.mjs", "--socket", "/tmp/agent.sock"],
        },
      },
    });
  });

  test("buildSessionConfig keeps an omitted mode omitted on resume", () => {
    const record = createRecord({
      provider: "codex",
      title: "Renamed title",
      lastModeId: null,
      config: {
        model: "gpt-5.4-mini",
        systemPrompt: "Confirm and speak first.",
        mcpServers: {
          paseo: {
            type: "stdio",
            command: "node",
            args: ["/tmp/bridge.mjs", "--socket", "/tmp/agent.sock"],
          },
        },
      },
    });

    expect(buildSessionConfig(record)).toMatchObject({
      provider: "codex",
      cwd: "/tmp/project",
      modeId: undefined,
      model: "gpt-5.4-mini",
      systemPrompt: "Confirm and speak first.",
      mcpServers: {
        paseo: {
          type: "stdio",
          command: "node",
          args: ["/tmp/bridge.mjs", "--socket", "/tmp/agent.sock"],
        },
      },
    });
  });

  test("buildConfigOverrides drops persisted internal paseo MCP server", () => {
    const record = createRecord({
      config: {
        modeId: "default",
        model: "gpt-5.4-mini",
        mcpServers: {
          paseo: {
            type: "http",
            url: "http://127.0.0.1:6767/mcp/agents?callerAgentId=stale-agent",
          },
          custom: {
            type: "stdio",
            command: "custom-mcp",
          },
        },
      },
    });

    expect(buildConfigOverrides(record).mcpServers).toEqual({
      custom: {
        type: "stdio",
        command: "custom-mcp",
      },
    });
  });

  test("buildConfigOverrides preserves user-provided paseo MCP server", () => {
    const record = createRecord({
      config: {
        modeId: "default",
        model: "gpt-5.4-mini",
        mcpServers: {
          paseo: {
            type: "http",
            url: "https://example.com/custom-paseo",
          },
        },
      },
    });

    expect(buildConfigOverrides(record).mcpServers).toEqual({
      paseo: {
        type: "http",
        url: "https://example.com/custom-paseo",
      },
    });
  });

  test("buildSessionConfig accepts providers from the canonical manifest", () => {
    const record = createRecord({
      provider: "claude",
      persistence: {
        provider: "claude",
        sessionId: "session-123",
      },
      config: {},
    });

    expect(buildSessionConfig(record)).toMatchObject({
      provider: "claude",
      cwd: "/tmp/project",
    });
  });

  test("buildSessionConfig skips records whose provider is missing from the registry", () => {
    const record = createRecord({
      id: "agent-missing-provider",
      provider: "zai",
    });

    expect(
      buildSessionConfig(record, {
        validProviders: ["claude", "codex"],
      }),
    ).toBeNull();
  });

  test("toAgentPersistenceHandle rejects handles for unavailable providers", () => {
    const handle = toAgentPersistenceHandle(["claude", "codex"], {
      provider: "gemini",
      sessionId: "session-123",
    });

    expect(handle).toBeNull();
  });
});

describe("selectRecordForResume", () => {
  const archivedAt = "2026-03-02T00:00:00.000Z";

  test("returns null when no record shares the session", () => {
    expect(selectRecordForResume([])).toBeNull();
  });

  test("prefers a live record over a newer archived one", () => {
    const archived = createRecord({
      id: "archived",
      archivedAt,
      updatedAt: archivedAt,
    });
    const live = createRecord({ id: "live", updatedAt: "2026-03-01T00:00:00.000Z" });

    expect(selectRecordForResume([archived, live])?.id).toBe("live");
    expect(selectRecordForResume([live, archived])?.id).toBe("live");
  });

  test("picks the most recently updated live record", () => {
    const older = createRecord({ id: "older", updatedAt: "2026-03-01T00:00:00.000Z" });
    const newer = createRecord({ id: "newer", updatedAt: "2026-03-03T00:00:00.000Z" });

    expect(selectRecordForResume([newer, older])?.id).toBe("newer");
  });

  test("falls back to the most recently updated archived record", () => {
    const older = createRecord({
      id: "older",
      archivedAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    const newer = createRecord({ id: "newer", archivedAt, updatedAt: archivedAt });

    expect(selectRecordForResume([older, newer])?.id).toBe("newer");
  });
});
