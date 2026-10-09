import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "../support/fixtures";
import { seedWorkspace, type SeedDaemonClient } from "../support/helpers/seed-client";
import { createIdleAgent, expectWorkspaceTabVisible } from "../support/helpers/archive-tab";
import { sidebarChatRow, waitForWorkspaceTabsVisible } from "../support/helpers/workspace-tabs";
import { buildHostAgentDetailRoute } from "@/utils/host-routes";
import { renameModalInput, renameModalSubmit } from "../support/helpers/rename";
import { getServerId } from "../support/helpers/server-id";

async function openAgentInWorkspace(page: Page, agent: { id: string; workspaceId: string }) {
  await page.goto(buildHostAgentDetailRoute(getServerId(), agent.id, agent.workspaceId));
  await page.waitForURL(
    (url) => url.pathname.includes("/workspace/") && !url.searchParams.has("open"),
    { timeout: 60_000 },
  );
  await waitForWorkspaceTabsVisible(page);
  await expectWorkspaceTabVisible(page, agent.id);
}

async function fetchAgentTitle(client: SeedDaemonClient, agentId: string): Promise<string | null> {
  const result = await client.fetchAgents({ scope: "active" });
  return result.entries.find((entry) => entry.agent.id === agentId)?.agent.title ?? null;
}

test.describe("Workspace chat header rename", () => {
  test("renaming from the chat header persists the agent title and updates the header and sidebar", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const workspace = await seedWorkspace({ repoPrefix: "workspace-agent-rename-" });

    try {
      const initialTitle = `agent-rename-${randomUUID().slice(0, 8)}`;
      const agent = await createIdleAgent(workspace.client, {
        cwd: workspace.repoPath,
        workspaceId: workspace.workspaceId,
        title: initialTitle,
      });

      await openAgentInWorkspace(page, agent);

      const title = page.getByTestId("chat-pane-title").filter({ visible: true }).first();
      await expect(title).toContainText(initialTitle, { timeout: 15_000 });

      await title.click();

      const modalPrefix = `chat-pane-rename-modal-${agent.id}`;
      const input = renameModalInput(page, modalPrefix);
      await expect(input).toBeVisible({ timeout: 10_000 });
      await expect(input).toHaveValue(initialTitle);

      const renamed = "My Renamed Agent";
      await input.fill(renamed);
      await renameModalSubmit(page, modalPrefix).click();

      await expect(input).toHaveCount(0, { timeout: 15_000 });
      await expect(title).toContainText(renamed, { timeout: 15_000 });
      await expect(sidebarChatRow(page, agent.id)).toContainText(renamed, { timeout: 15_000 });
      await expect.poll(() => fetchAgentTitle(workspace.client, agent.id)).toBe(renamed);
    } finally {
      await workspace.cleanup();
    }
  });
});
