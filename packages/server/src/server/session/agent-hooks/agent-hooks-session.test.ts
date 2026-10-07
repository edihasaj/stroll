import { describe, expect, it } from "vitest";
import type { AgentHookSummary } from "@getpaseo/protocol/agent-hooks";
import { createTestLogger } from "../../../test-utils/test-logger.js";
import type { SessionOutboundMessage } from "../../messages.js";
import { AgentHooksSession, type AgentHooksAccess } from "./agent-hooks-session.js";

const KEY = "/repo/.codex/hooks.json:stop:0:0";

function hook(trustStatus: AgentHookSummary["trustStatus"]): AgentHookSummary {
  return {
    key: KEY,
    event: "stop",
    source: "project",
    sourcePath: "/repo/.codex/hooks.json",
    command: "echo done",
    trustStatus,
    enabled: true,
  };
}

/** A harness whose single hook becomes trusted once `trustHooks` is called with its key. */
function codexLikeAccess(): AgentHooksAccess & { trusted: string[] } {
  const trusted: string[] = [];
  return {
    trusted,
    load: async () => ({
      listHooks: async () => [hook(trusted.includes(KEY) ? "trusted" : "untrusted")],
      trustHooks: async (keys) => {
        trusted.push(...keys);
      },
    }),
  };
}

function createSession(access: AgentHooksAccess) {
  const emitted: SessionOutboundMessage[] = [];
  const session = new AgentHooksSession({
    access,
    emit: (msg) => emitted.push(msg),
    logger: createTestLogger(),
  });
  return { session, emitted };
}

describe("AgentHooksSession", () => {
  it("lists the harness's hooks", async () => {
    const { session, emitted } = createSession(codexLikeAccess());
    await session.dispatch({ type: "agent.hooks.list.request", agentId: "a1", requestId: "r1" });
    expect(emitted).toEqual([
      {
        type: "agent.hooks.list.response",
        payload: {
          requestId: "r1",
          agentId: "a1",
          supported: true,
          hooks: [hook("untrusted")],
          error: null,
        },
      },
    ]);
  });

  it("reports an agent without a hooks API as unsupported", async () => {
    const { session, emitted } = createSession({ load: async () => null });
    await session.dispatch({ type: "agent.hooks.list.request", agentId: "a1", requestId: "r1" });
    expect(emitted[0]).toMatchObject({
      type: "agent.hooks.list.response",
      payload: { supported: false, hooks: [], error: null },
    });
  });

  it("trusts the keys and answers with the refreshed list", async () => {
    const access = codexLikeAccess();
    const { session, emitted } = createSession(access);
    await session.dispatch({
      type: "agent.hooks.trust.request",
      agentId: "a1",
      keys: [KEY],
      requestId: "r2",
    });
    expect(access.trusted).toEqual([KEY]);
    expect(emitted[0]).toMatchObject({
      type: "agent.hooks.trust.response",
      payload: { requestId: "r2", hooks: [hook("trusted")], error: null },
    });
  });

  it("refuses to trust hooks for an agent without a hooks API", async () => {
    const { session, emitted } = createSession({ load: async () => null });
    await session.dispatch({
      type: "agent.hooks.trust.request",
      agentId: "a1",
      keys: [KEY],
      requestId: "r3",
    });
    expect(emitted[0]).toMatchObject({
      type: "agent.hooks.trust.response",
      payload: {
        requestId: "r3",
        hooks: [],
        error: "This agent's harness has no hooks to review.",
      },
    });
  });
});
