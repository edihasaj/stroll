import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { daemonWsRoutePattern } from "../support/helpers/daemon-port";
import { expectComposerVisible } from "../support/helpers/composer";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";

type WebSocketMessage = string | Buffer;

function parseSessionMessage(message: WebSocketMessage): Record<string, unknown> | null {
  const raw = typeof message === "string" ? message : message.toString("utf8");
  try {
    const envelope = JSON.parse(raw) as { type?: unknown; message?: unknown };
    return envelope.type === "session" && envelope.message && typeof envelope.message === "object"
      ? (envelope.message as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function getToolCallStatus(
  message: WebSocketMessage,
  agentId: string,
): { callId: string; status: string } | null {
  const sessionMessage = parseSessionMessage(message);
  if (sessionMessage?.type !== "agent_stream") {
    return null;
  }
  const payload = sessionMessage.payload as Record<string, unknown> | undefined;
  if (payload?.agentId !== agentId) {
    return null;
  }
  const event = payload.event as Record<string, unknown> | undefined;
  const item = event?.item as Record<string, unknown> | undefined;
  return event?.type === "timeline" &&
    item?.type === "tool_call" &&
    typeof item.callId === "string" &&
    typeof item.status === "string"
    ? { callId: item.callId, status: item.status }
    : null;
}

function replaceToolCallStatus(message: WebSocketMessage, status: string): string {
  const raw = typeof message === "string" ? message : message.toString("utf8");
  const envelope = JSON.parse(raw) as {
    message?: { payload?: { event?: { item?: { status?: string } } } };
  };
  const item = envelope.message?.payload?.event?.item;
  if (!item) {
    throw new Error("Expected a tool-call session message");
  }
  item.status = status;
  return JSON.stringify(envelope);
}

async function gateSecondToolCall(page: Page, agentId: string) {
  let firstCallId: string | null = null;
  let secondCallId: string | null = null;
  let secondRunningMessage: WebSocketMessage | null = null;
  let pauseAfterSecondRunning = false;
  let releaseSecondRequested = false;
  let forwardSecondRunning: (() => void) | null = null;
  let resolveFirstCompleted!: () => void;
  let resolveSecondRunning!: () => void;
  const firstCompleted = new Promise<void>((resolve) => {
    resolveFirstCompleted = resolve;
  });
  const secondRunning = new Promise<void>((resolve) => {
    resolveSecondRunning = resolve;
  });

  await page.routeWebSocket(daemonWsRoutePattern(), (ws) => {
    const server = ws.connectToServer();
    forwardSecondRunning = () => {
      if (secondRunningMessage) {
        ws.send(secondRunningMessage);
        secondRunningMessage = null;
      }
    };
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      if (pauseAfterSecondRunning) {
        return;
      }

      const toolCall = getToolCallStatus(message, agentId);
      if (!toolCall) {
        ws.send(message);
        return;
      }

      if (!firstCallId) {
        firstCallId = toolCall.callId;
      }
      if (toolCall.callId === firstCallId) {
        ws.send(message);
        if (toolCall.status === "completed") {
          resolveFirstCompleted();
        }
        return;
      }

      secondCallId ??= toolCall.callId;
      if (toolCall.callId === secondCallId) {
        const transformedMessage =
          toolCall.status === "completed" ? replaceToolCallStatus(message, "running") : message;
        secondRunningMessage = transformedMessage;
        pauseAfterSecondRunning = true;
        resolveSecondRunning();
        if (releaseSecondRequested) {
          forwardSecondRunning?.();
        }
        return;
      }

      ws.send(message);
    });
  });

  return {
    waitForFirstCompleted: () => firstCompleted,
    waitForSecondRunning: () => secondRunning,
    releaseSecondRunning() {
      releaseSecondRequested = true;
      forwardSecondRunning?.();
    },
  };
}

test("keeps one live activity line while sequential tool calls run", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    localStorage.setItem(
      "@paseo:app-settings",
      JSON.stringify({ toolCallDetailLevel: "overview" }),
    );
  });
  const agent = await seedMockAgentWorkspace({
    repoPrefix: "tool-call-shimmer-",
    title: "Tool-call shimmer",
    model: "ten-second-stream",
  });

  try {
    const gate = await gateSecondToolCall(page, agent.agentId);
    await openAgentRoute(page, {
      workspaceId: agent.workspaceId,
      agentId: agent.agentId,
    });
    await expectComposerVisible(page);
    await agent.client.sendAgentMessage(agent.agentId, "Prove the overview shimmer lifecycle.");

    await gate.waitForFirstCompleted();
    const indicator = page.getByTestId("turn-working-indicator");
    await expect(indicator).toHaveCount(1);
    await expect(indicator).toBeVisible();
    await expect(page.getByTestId("tool-call-group")).toHaveCount(0);
    await expect(page.getByTestId("tool-call-badge")).toHaveCount(0);
    const firstNode = await indicator.elementHandle();
    if (!firstNode) throw new Error("Expected the live activity line");
    await gate.waitForSecondRunning();
    gate.releaseSecondRunning();
    await expect(indicator).toContainText("Searching");
    await expect(indicator).toHaveCount(1);
    await expect(page.getByTestId("tool-call-group")).toHaveCount(0);
    expect(await indicator.evaluate((node, previous) => node === previous, firstNode)).toBe(true);
    await testInfo.attach("live-activity", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  } finally {
    await agent.cleanup();
  }
});
