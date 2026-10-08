import { describe, expect, it, vi } from "vitest";
import { runDeleteChat, type DeleteChatDeps } from "./use-delete-chat";

function createDeps(overrides: Partial<DeleteChatDeps> = {}): DeleteChatDeps {
  return {
    confirm: vi.fn().mockResolvedValue(true),
    deleteOnHost: vi.fn().mockResolvedValue(undefined),
    afterDelete: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

describe("runDeleteChat", () => {
  it("deletes on the host and then drops the chat from the app once confirmed", async () => {
    const deps = createDeps();

    await runDeleteChat(deps, { agentId: "agent-1", tabId: "agent_agent-1" });

    expect(deps.deleteOnHost).toHaveBeenCalledWith("agent-1");
    expect(deps.afterDelete).toHaveBeenCalledWith({ agentId: "agent-1", tabId: "agent_agent-1" });
    expect(deps.onError).not.toHaveBeenCalled();
  });

  it("does nothing when the user cancels the confirmation", async () => {
    const deps = createDeps({ confirm: vi.fn().mockResolvedValue(false) });

    await runDeleteChat(deps, { agentId: "agent-1" });

    expect(deps.deleteOnHost).not.toHaveBeenCalled();
    expect(deps.afterDelete).not.toHaveBeenCalled();
  });

  it("keeps the chat in the app and reports the failure when the host rejects the delete", async () => {
    const deps = createDeps({
      deleteOnHost: vi.fn().mockRejectedValue(new Error("Host offline")),
    });

    await runDeleteChat(deps, { agentId: "agent-1" });

    expect(deps.afterDelete).not.toHaveBeenCalled();
    expect(deps.onError).toHaveBeenCalledWith("Host offline");
  });
});
