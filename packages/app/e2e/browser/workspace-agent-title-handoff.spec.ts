import { test, expect } from "../support/fixtures";
import { expectComposerVisible, submitMessage } from "../support/helpers/composer";
import { delayCreatedAgentInitialTailResponse } from "../support/helpers/agent-timeline-gate";
import { delayBrowserAgentCreatedStatus } from "../support/helpers/new-workspace";
import { seedWorkspace, type SeedDaemonClient } from "../support/helpers/seed-client";
import {
  createAgentTabFromMenu,
  expectMainChat,
  expectMainDraft,
  expectNotMainChat,
  sidebarChatRow,
  waitForWorkspaceTabsVisible,
} from "../support/helpers/workspace-tabs";
import { getServerId } from "../support/helpers/server-id";
import { buildHostWorkspaceRoute } from "@/utils/host-routes";

async function waitForCreatedAgentId(
  client: SeedDaemonClient,
  input: { cwd: string; workspaceId: string },
): Promise<string> {
  await expect
    .poll(
      async () => {
        const result = await client.fetchAgents({ scope: "active" });
        return result.entries
          .filter(
            (entry) =>
              entry.agent.cwd === input.cwd && entry.agent.workspaceId === input.workspaceId,
          )
          .map((entry) => entry.agent.id);
      },
      { timeout: 30_000 },
    )
    .toHaveLength(1);
  const result = await client.fetchAgents({ scope: "active" });
  const agent = result.entries.find(
    (entry) => entry.agent.cwd === input.cwd && entry.agent.workspaceId === input.workspaceId,
  );
  if (!agent) {
    throw new Error(`Expected one created agent in ${input.cwd}`);
  }
  return agent.agent.id;
}

async function fetchActiveAgentTitle(
  client: SeedDaemonClient,
  agentId: string,
): Promise<string | null> {
  const result = await client.fetchAgents({ scope: "active" });
  return result.entries.find((entry) => entry.agent.id === agentId)?.agent.title ?? null;
}

test.describe("Workspace agent title handoff", () => {
  test("does not cover the agent pane while the optimistic create becomes authoritative", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    const timelineGate = await delayCreatedAgentInitialTailResponse(page);
    const workspace = await seedWorkspace({ repoPrefix: "workspace-create-handoff-flash-" });

    try {
      await page.goto(buildHostWorkspaceRoute(getServerId(), workspace.workspaceId));
      await waitForWorkspaceTabsVisible(page);
      await createAgentTabFromMenu(page);
      await expectComposerVisible(page);

      const prompt = "Keep the optimistic agent pane visible during handoff";
      await submitMessage(page, prompt);
      const agentId = await timelineGate.waitForCreatedAgent();
      await timelineGate.waitForDelayedResponse();

      await expectMainChat(page, agentId, 15_000);
      await expect(page.getByText(prompt, { exact: true }).first()).toBeVisible();
      await expect(page.getByTestId("agent-history-overlay")).toHaveCount(0);

      const overlayAppeared = page
        .getByTestId("agent-history-overlay")
        .waitFor({ state: "attached", timeout: 2_000 })
        .then(
          () => true,
          () => false,
        );
      timelineGate.release();
      await timelineGate.waitForForwardedResponse();

      expect(await overlayAppeared).toBe(false);
    } finally {
      timelineGate.release();
      await workspace.cleanup();
    }
  });

  test("shows the prompt as the chat title and replaces it when the daemon title updates", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });

    const agentCreatedDelay = await delayBrowserAgentCreatedStatus(page);
    const workspace = await seedWorkspace({ repoPrefix: "workspace-title-handoff-" });

    try {
      await page.goto(buildHostWorkspaceRoute(getServerId(), workspace.workspaceId));
      await waitForWorkspaceTabsVisible(page);
      await createAgentTabFromMenu(page);
      await expectComposerVisible(page);

      const promptTitle = "Investigate optimistic tab title handoff";
      const generatedTitle = "Generated Handoff Title";
      await submitMessage(page, `${promptTitle}\n\nMake the UI state deterministic.`);
      await agentCreatedDelay.waitForCreateRequest();
      await agentCreatedDelay.waitForDelayedCreatedStatus();

      // The main view holds the draft until the daemon confirms the agent; its header is a plain
      // "Untitled" and must not flash a loading placeholder in the meantime.
      await expectMainDraft(page);
      await expect(
        page.getByText(/Loading agent title|Loading\.\.\./).filter({ visible: true }),
      ).toHaveCount(0);

      const agentId = await waitForCreatedAgentId(workspace.client, {
        cwd: workspace.repoPath,
        workspaceId: workspace.workspaceId,
      });

      await expectNotMainChat(page, agentId, 5_000);
      agentCreatedDelay.release();

      await expectMainChat(page, agentId, 15_000);
      const chatTitle = page.getByTestId("chat-pane-title").filter({ visible: true }).first();
      await expect
        .poll(() => fetchActiveAgentTitle(workspace.client, agentId), { timeout: 10_000 })
        .toBe(promptTitle);
      await expect(chatTitle).toContainText(promptTitle, { timeout: 15_000 });
      await expect(sidebarChatRow(page, agentId)).toContainText(promptTitle, { timeout: 15_000 });
      await expect(
        page.getByText(/Loading agent title|Loading\.\.\./).filter({ visible: true }),
      ).toHaveCount(0);

      await workspace.client.updateAgent(agentId, { name: generatedTitle });
      await expect
        .poll(() => fetchActiveAgentTitle(workspace.client, agentId), { timeout: 10_000 })
        .toBe(generatedTitle);
      await expect(chatTitle).toContainText(generatedTitle, { timeout: 15_000 });
      await expect(sidebarChatRow(page, agentId)).toContainText(generatedTitle, {
        timeout: 15_000,
      });
    } finally {
      agentCreatedDelay.release();
      await workspace.cleanup();
    }
  });
});
