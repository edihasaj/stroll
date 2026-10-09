import { expect, type Page } from "@playwright/test";
import { buildHostAgentDetailRoute } from "@/utils/host-routes";
import { test } from "../support/fixtures";
import { seedWorkspace, type SeedDaemonClient } from "../support/helpers/seed-client";
import { getServerId } from "../support/helpers/server-id";
import { observeTimelineSubscriptions } from "../support/helpers/timeline-delivery";
import { expectMainChat, waitForWorkspaceTabsVisible } from "../support/helpers/workspace-tabs";
import { selectWorkspaceInSidebar } from "../support/helpers/sidebar";
import { installDaemonWebSocketGate } from "../support/helpers/daemon-websocket-gate";
import {
  expectAgentIdle,
  expectInlineWorkingIndicator,
  expectTurnCopyButton,
} from "../support/helpers/agent-stream";
import {
  expectReconnectingToastGone,
  expectReconnectingToastVisible,
} from "../support/helpers/workspace-ui";

interface ViewedTimelineScenario {
  client: SeedDaemonClient;
  workspaceId: string;
  repoPath: string;
  firstAgentId: string;
  secondAgentId: string;
  cleanup(): Promise<void>;
}

async function seedViewedTimelineScenario(
  options: { firstAgentModel?: string } = {},
): Promise<ViewedTimelineScenario> {
  const workspace = await seedWorkspace({ repoPrefix: "viewed-timelines-" });
  const createAgent = (title: string, model = "ten-second-stream") =>
    workspace.client.createAgent({
      provider: "mock",
      cwd: workspace.repoPath,
      workspaceId: workspace.workspaceId,
      title,
      modeId: "load-test",
      model,
    });
  const [firstAgent, secondAgent] = await Promise.all([
    createAgent("First viewed chat", options.firstAgentModel),
    createAgent("Second viewed chat"),
  ]);
  return {
    client: workspace.client,
    workspaceId: workspace.workspaceId,
    repoPath: workspace.repoPath,
    firstAgentId: firstAgent.id,
    secondAgentId: secondAgent.id,
    cleanup: workspace.cleanup,
  };
}

interface RestoredLayoutChat {
  workspaceId: string;
  agentId: string;
  title: string;
}

interface RestoredLayoutScenario {
  chats: RestoredLayoutChat[];
  cleanup(): Promise<void>;
}

/**
 * Two workspaces with two chats each. Opening all four leaves the persisted layout and the
 * viewed-chat history holding every chat, which is the state a relaunch restores into.
 */
async function seedRestoredLayoutScenario(): Promise<RestoredLayoutScenario> {
  const workspaces = await Promise.all([
    seedWorkspace({ repoPrefix: "restored-layout-first-" }),
    seedWorkspace({ repoPrefix: "restored-layout-second-" }),
  ]);
  try {
    const chats = await Promise.all(
      workspaces.flatMap((workspace, workspaceIndex) =>
        [1, 2].map(async (chatIndex): Promise<RestoredLayoutChat> => {
          const title = `Restored chat ${workspaceIndex + 1}-${chatIndex}`;
          const agent = await workspace.client.createAgent({
            provider: "mock",
            cwd: workspace.repoPath,
            workspaceId: workspace.workspaceId,
            title,
            modeId: "load-test",
            model: "ten-second-stream",
          });
          return { workspaceId: workspace.workspaceId, agentId: agent.id, title };
        }),
      ),
    );
    return {
      chats,
      cleanup: async () => {
        for (const workspace of workspaces) await workspace.cleanup();
      },
    };
  } catch (error) {
    for (const workspace of workspaces) await workspace.cleanup().catch(() => undefined);
    throw error;
  }
}

async function openAgent(page: Page, scenario: { workspaceId: string }, agentId: string) {
  const route = buildHostAgentDetailRoute(getServerId(), agentId, scenario.workspaceId);
  await page.goto(route);
  await page.waitForURL(
    (url) => url.pathname.includes("/workspace/") && !url.searchParams.has("open"),
  );
  await waitForWorkspaceTabsVisible(page);
}

/** The sidebar's row for a chat, found by title: chats are not tabs, the sidebar lists them. */
function chatRowByTitle(page: Page, title: string) {
  return page
    .locator('[data-testid^="sidebar-chat-row-"]')
    .filter({ visible: true })
    .filter({ hasText: title });
}

async function selectAgent(page: Page, title: string) {
  const row = chatRowByTitle(page, title);
  // The sidebar lists five chats per workspace before "Show more".
  const showMore = page
    .locator('[data-testid^="sidebar-workspace-chats-show-more-"]')
    .filter({ visible: true })
    .first();
  if ((await row.count()) === 0 && (await showMore.count()) > 0) {
    await showMore.click();
  }
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
}

async function expectForkFailureWithoutOverlappingStatus(page: Page) {
  const expectContinuousToast = await observeToastReplacement(page);
  await page.getByRole("button", { name: "Fork chat from here" }).last().click();
  await page.getByRole("menuitem", { name: "Fork in a new tab", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Transport not connected" }),
  ).toBeVisible();
  await expectReconnectingToastGone(page, { timeout: 100 });
  await expectReconnectingToastVisible(page);
  await expectContinuousToast();
}

async function observeToastReplacement(page: Page) {
  const observation = await page
    .getByRole("alert")
    .filter({ hasText: "Reconnecting to host" })
    .evaluateHandle((toast) => {
      const frames: Array<{ connected: boolean; opacity: number; transform: string }> = [];
      let frame = 0;
      const sample = () => {
        const style = getComputedStyle(toast);
        frames.push({
          connected: toast.isConnected,
          opacity: Number(style.opacity),
          transform: style.transform,
        });
        frame = requestAnimationFrame(sample);
      };
      sample();
      return {
        stop() {
          cancelAnimationFrame(frame);
          return frames;
        },
      };
    });
  return async () => {
    const frames = await observation.evaluate((recorder) => recorder.stop());
    await observation.dispose();
    expect(frames.length).toBeGreaterThan(1);
    expect(frames.every((frame) => frame.connected)).toBe(true);
    expect(Math.min(...frames.map((frame) => frame.opacity))).toBe(1);
    expect(new Set(frames.map((frame) => frame.transform)).size).toBe(1);
  };
}

async function commitMessage(scenario: ViewedTimelineScenario, agentId: string, prompt: string) {
  await scenario.client.sendAgentMessage(agentId, prompt);
  const finish = await scenario.client.waitForFinish(agentId, 30_000);
  expect(finish.status).toBe("idle");
}

async function startVisibleTurn(
  page: Page,
  scenario: ViewedTimelineScenario,
  prompt: string,
): Promise<void> {
  await scenario.client.sendAgentMessage(scenario.firstAgentId, prompt);
  await expect(page.getByText(prompt, { exact: true })).toBeVisible();
  await expectInlineWorkingIndicator(page);
}

async function expectAgentConsistentlyIdle(page: Page, title: string): Promise<void> {
  await expect(chatRowByTitle(page, title).getByTestId("sidebar-chat-status-running")).toHaveCount(
    0,
  );
  await expectAgentIdle(page);
  await expect(page.getByTestId("turn-working-indicator")).toHaveCount(0);
  await expectTurnCopyButton(page);
}

async function withViewedTimelineScenario(
  run: (scenario: ViewedTimelineScenario) => Promise<void>,
) {
  const scenario = await seedViewedTimelineScenario();
  try {
    await run(scenario);
  } finally {
    await scenario.cleanup();
  }
}

async function openSevenChats(page: Page, scenario: ViewedTimelineScenario) {
  const subscriptions = observeTimelineSubscriptions(page);
  const additional = [];
  for (let index = 0; index < 5; index += 1) {
    additional.push(
      await scenario.client.createAgent({
        provider: "mock",
        cwd: scenario.repoPath,
        workspaceId: scenario.workspaceId,
        title: `Additional chat ${index + 1}`,
        modeId: "load-test",
        model: "ten-second-stream",
      }),
    );
  }
  await openAgent(page, scenario, scenario.firstAgentId);
  await selectAgent(page, "Second viewed chat");
  for (let index = 0; index < additional.length; index += 1) {
    await selectAgent(page, `Additional chat ${index + 1}`);
  }
  // Each chat replaced the one before it in the main view, so only the last stays subscribed.
  await subscriptions.waitForSubscribedAgents([additional.at(-1)!.id]);
}

async function expectCurrentChatWithoutCatchUp(page: Page, message: string) {
  await expect(page.getByText(message, { exact: true })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Updating messages" })).toHaveCount(0);
}

test.describe("Viewed agent timelines", () => {
  test("a reloaded layout subscribes only the chat it restores into", async ({ page }) => {
    test.setTimeout(120_000);
    const subscriptions = observeTimelineSubscriptions(page);
    const scenario = await seedRestoredLayoutScenario();
    try {
      // One document load, then sidebar clicks — the way a user reaches these chats.
      // A `page.goto` per chat would restart the app and empty the session's set each time.
      const [first, second, third, fourth] = scenario.chats;
      await openAgent(page, first!, first!.agentId);
      await selectAgent(page, second!.title);
      await selectWorkspaceInSidebar(page, third!.workspaceId);
      await selectAgent(page, third!.title);
      await selectAgent(page, fourth!.title);
      // Opening a chat replaces the one in its workspace's main view and releases it, so each
      // workspace holds exactly the chat it last showed.
      await subscriptions.waitForSubscribedAgents([second!.agentId, fourth!.agentId]);

      // Relaunch. The saved layout still holds a chat for each workspace; only the one on screen
      // may be subscribed, because subscribing resumes the agent on the daemon.
      const restored = scenario.chats.at(-1)!;
      const sibling = scenario.chats.at(-2)!;
      subscriptions.reset();
      await page.reload();
      await waitForWorkspaceTabsVisible(page);
      await expectMainChat(page, restored.agentId);
      await expect(chatRowByTitle(page, sibling.title)).toBeVisible();
      await subscriptions.waitForSubscribedAgents([restored.agentId]);

      // Opening the sibling is what adds it. It replaces the restored chat in the main view, which
      // releases that chat.
      await selectAgent(page, sibling.title);
      await expectMainChat(page, sibling.agentId);
      await subscriptions.waitForSubscribedAgents([sibling.agentId]);
    } finally {
      await scenario.cleanup();
    }
  });

  test("a chat reopened after switching through many chats shows what it missed", async ({
    page,
  }) => {
    await withViewedTimelineScenario(async (scenario) => {
      await openSevenChats(page, scenario);
      await commitMessage(scenario, scenario.firstAgentId, "Current after seven open chats.");
      await selectAgent(page, "First viewed chat");
      await expectCurrentChatWithoutCatchUp(page, "Current after seven open chats.");
    });
  });

  test("a turn that finishes while hidden reopens with consistently idle chrome", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const subscriptions = observeTimelineSubscriptions(page);
    const scenario = await seedViewedTimelineScenario({ firstAgentModel: "one-minute-stream" });
    try {
      await openAgent(page, scenario, scenario.firstAgentId);
      await startVisibleTurn(page, scenario, "Finish after this chat becomes hidden.");
      await selectAgent(page, "Second viewed chat");
      await subscriptions.waitForSubscribedAgents([scenario.secondAgentId]);
      const finish = await scenario.client.waitForFinish(scenario.firstAgentId, 90_000);
      expect(finish.status).toBe("idle");

      await selectAgent(page, "First viewed chat");
      await expectAgentConsistentlyIdle(page, "First viewed chat");
    } finally {
      await scenario.cleanup();
    }
  });

  test("a chat reopened after switching away keeps its draft and shows what it missed", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const subscriptions = observeTimelineSubscriptions(page);
    const scenario = await seedViewedTimelineScenario();
    try {
      await openAgent(page, scenario, scenario.firstAgentId);
      const composer = page.getByRole("textbox", { name: "Message agent..." });
      await composer.fill("Unsent draft survives hidden streaming");
      await selectAgent(page, "Second viewed chat");
      await subscriptions.waitForSubscribedAgents([scenario.secondAgentId]);
      await commitMessage(
        scenario,
        scenario.firstAgentId,
        "Committed while the first chat is away.",
      );
      await expect(
        page.getByText("Committed while the first chat is away.", { exact: true }),
      ).toHaveCount(0);
      await selectAgent(page, "First viewed chat");
      await expect(
        page.getByText("Committed while the first chat is away.", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText("(end of synthetic stream)", { exact: true })).toBeVisible();
      await expect(composer).toHaveValue("Unsent draft survives hidden streaming");
      await composer.fill("Draft edited after returning");
      await expect(composer).toHaveValue("Draft edited after returning");
    } finally {
      await scenario.cleanup();
    }
  });

  test("a visible chat reports updating until reconnect catch-up completes", async ({
    page,
  }, testInfo) => {
    const gate = await installDaemonWebSocketGate(page);
    const scenario = await seedViewedTimelineScenario();
    try {
      await commitMessage(scenario, scenario.firstAgentId, "Visible before the connection drops.");
      await openAgent(page, scenario, scenario.firstAgentId);
      const previousMessage = page.getByText("Visible before the connection drops.", {
        exact: true,
      });
      await expect(previousMessage).toBeVisible();
      await expectMainChat(page, scenario.firstAgentId);
      await gate.drop();
      await gate.waitForBlockedConnection();
      await expectReconnectingToastVisible(page);
      await expect(page.getByTestId("agent-reconnecting-toast")).toHaveCSS("opacity", "1");
      await page.screenshot({ path: testInfo.outputPath("reconnecting-chat.png") });
      await expectForkFailureWithoutOverlappingStatus(page);
      await commitMessage(scenario, scenario.firstAgentId, "Committed while the chat reconnects.");
      await expect(
        page.getByText("Committed while the chat reconnects.", { exact: true }),
      ).toHaveCount(0);
      // Hold the visible response to observe the connected-but-updating state.
      gate.holdTimelineResponses(scenario.firstAgentId);
      const expectContinuousToast = await observeToastReplacement(page);
      gate.restore();
      await gate.waitForHeldTimelineResponse();
      await expectReconnectingToastGone(page);
      await expect(page.getByRole("alert").filter({ hasText: "Updating messages" })).toBeVisible();
      await expect(
        page.getByTestId("app-toast-message").filter({ hasText: "Updating messages" }),
      ).toBeVisible();
      await expect(previousMessage).toBeVisible();
      await expect(page.getByTestId("agent-updating-toast")).toHaveCSS("opacity", "1");
      await expectContinuousToast();
      await page.screenshot({ path: testInfo.outputPath("updating-chat.png") });
      gate.releaseHeldTimelineResponses();
      await expect(page.getByRole("alert").filter({ hasText: "Updating messages" })).toHaveCount(0);
      const recoveredMessage = page.getByText("Committed while the chat reconnects.", {
        exact: true,
      });
      await expect(recoveredMessage).toHaveCount(1);
      await expect(recoveredMessage).toBeVisible();
    } finally {
      gate.restore();
      await scenario.cleanup();
    }
  });

  test("preserves reconnecting toast through retained chat switches", async ({ page }) => {
    const gate = await installDaemonWebSocketGate(page);
    const scenario = await seedViewedTimelineScenario();
    try {
      await openAgent(page, scenario, scenario.firstAgentId);
      await selectAgent(page, "Second viewed chat");
      await expect(page.getByRole("textbox", { name: "Message agent..." })).toBeVisible();
      await selectAgent(page, "First viewed chat");
      await gate.drop();
      await gate.waitForBlockedConnection();
      await expectReconnectingToastVisible(page);

      await selectAgent(page, "Second viewed chat");
      await expectReconnectingToastVisible(page, { timeout: 500 });
    } finally {
      gate.restore();
      await scenario.cleanup();
    }
  });
});
