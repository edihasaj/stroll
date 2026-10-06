import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Command } from "commander";

const daemonTarget = { kind: "endpoint" as const, host: "example.test:12345" };
const fullAgentId = "11111111-1111-4111-8111-111111111111";

const sendAgentMessage = vi.fn(
  async (): Promise<{ dispatch: string | null }> => ({ dispatch: "steered" }),
);
const createAgentQueuePrompt = vi.fn(async () => ({ error: null as string | null }));
const fetchAgent = vi.fn(async () => ({ agent: { id: fullAgentId } }));
const waitForFinish = vi.fn(async () => ({ status: "idle", final: { id: fullAgentId } }));
const close = vi.fn(async () => undefined);

vi.mock("../../utils/client.js", () => ({
  connectToDaemon: vi.fn(async () => ({
    sendAgentMessage,
    createAgentQueuePrompt,
    fetchAgent,
    waitForFinish,
    close,
  })),
  getDaemonHost: vi.fn(() => "ws://127.0.0.1:6767"),
}));

import { runSendCommand } from "./send.js";

const command = {} as Command;

describe("runSendCommand", () => {
  beforeEach(() => {
    sendAgentMessage.mockClear();
    sendAgentMessage.mockImplementation(async () => ({ dispatch: "steered" }));
    createAgentQueuePrompt.mockClear();
    fetchAgent.mockClear();
    waitForFinish.mockClear();
  });

  it("steers a running agent by default instead of interrupting it", async () => {
    await runSendCommand("1111", "what are you doing?", { daemonTarget, wait: false }, command);

    expect(sendAgentMessage).toHaveBeenCalledWith("1111", "what are you doing?", {
      images: undefined,
      activeTurnBehavior: "steer",
    });
    expect(createAgentQueuePrompt).not.toHaveBeenCalled();
  });

  it("interrupts only when asked", async () => {
    await runSendCommand(
      "1111",
      "stop and do this",
      { daemonTarget, wait: false, interrupt: true },
      command,
    );

    expect(sendAgentMessage).toHaveBeenCalledWith("1111", "stop and do this", {
      images: undefined,
      activeTurnBehavior: "interrupt",
    });
  });

  it("queues under the resolved agent id without touching the running turn", async () => {
    const result = await runSendCommand(
      "1111",
      "after this turn",
      { daemonTarget, queue: true },
      command,
    );

    expect(fetchAgent).toHaveBeenCalledWith({ agentId: "1111" });
    expect(createAgentQueuePrompt).toHaveBeenCalledWith({
      agentId: fullAgentId,
      text: "after this turn",
    });
    expect(sendAgentMessage).not.toHaveBeenCalled();
    expect(waitForFinish).not.toHaveBeenCalled();
    expect(result.data.status).toBe("queued");
  });

  it("reports a steer the daemon had to queue instead of waiting on the current turn", async () => {
    sendAgentMessage.mockImplementation(async () => ({ dispatch: "queued_fallback" }));

    const result = await runSendCommand("1111", "hello", { daemonTarget }, command);

    expect(result.data.status).toBe("queued");
    expect(waitForFinish).not.toHaveBeenCalled();
  });

  it("rejects --queue together with --interrupt", async () => {
    await expect(
      runSendCommand("1111", "hello", { daemonTarget, queue: true, interrupt: true }, command),
    ).rejects.toMatchObject({ code: "CONFLICTING_SEND_MODE" });
    expect(sendAgentMessage).not.toHaveBeenCalled();
    expect(createAgentQueuePrompt).not.toHaveBeenCalled();
  });
});
