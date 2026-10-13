import { expect, test, type Page } from "../support/fixtures";
import { expectAgentTabActive } from "../support/helpers/launcher";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import { getServerId } from "../support/helpers/server-id";

// The e2e fixtures pin navigator.platform to Win32, so the chat history shortcuts are Ctrl+Alt.
const PREVIOUS_CHAT_SHORTCUT = "Control+Alt+ArrowLeft";
const NEXT_CHAT_SHORTCUT = "Control+Alt+ArrowRight";

function chatRow(page: Page, agentId: string) {
  return page.getByTestId(`sidebar-chat-row-${getServerId()}:${agentId}`);
}

async function expectChatSelected(page: Page, agentId: string) {
  await expectAgentTabActive(page, agentId);
  await expect(chatRow(page, agentId)).toHaveAttribute("aria-selected", "true");
}

test("desktop chats move between Projects and Recents, switch, walk history, and archive", async ({
  page,
}) => {
  const workspace = await seedMockAgentWorkspace({
    repoPrefix: "sidebar-workspace-chats-",
    title: "Alpha chat",
  });

  try {
    const second = await workspace.client.createAgent({
      provider: "mock",
      cwd: workspace.cwd,
      workspaceId: workspace.workspaceId,
      title: "Beta chat",
      modeId: "load-test",
      model: "e2e-fast-stream",
    });
    await page.setViewportSize({ width: 1400, height: 900 });
    await openAgentRoute(page, {
      workspaceId: workspace.workspaceId,
      agentId: workspace.agentId,
    });

    await test.step("both chats are listed and the open one is highlighted", async () => {
      await expect(chatRow(page, workspace.agentId)).toBeVisible({ timeout: 30_000 });
      await expect(chatRow(page, second.id)).toBeVisible({ timeout: 30_000 });
      await expect(chatRow(page, workspace.agentId)).toContainText("Alpha chat");
      await expect(chatRow(page, second.id)).toContainText("Beta chat");
      await expectChatSelected(page, workspace.agentId);
    });

    await test.step("Home toggles the sidebar without changing the chat or URL", async () => {
      const route = page.url();
      await page.getByTestId("sidebar-rail-chats").click();
      await expect(page.getByTestId("sidebar-panel")).toHaveCount(0);
      expect(page.url()).toBe(route);
      await expectAgentTabActive(page, workspace.agentId);
      await page.getByTestId("sidebar-rail-chats").click();
      await expect(page.getByTestId("sidebar-panel")).toBeVisible();
      expect(page.url()).toBe(route);
    });

    await test.step("a folder is manually added, persists after reload, and can leave the sidebar", async () => {
      await expect(
        page
          .getByTestId("sidebar-recents-list")
          .getByTestId(`sidebar-chat-row-${getServerId()}:${workspace.agentId}`),
      ).toBeVisible();
      await page.getByTestId("sidebar-panel-projects-header").hover();
      await page.getByTestId("sidebar-organize").first().click();
      await expect(page.getByTestId("sidebar-sort-updated")).toBeVisible();
      await page.locator('[data-testid^="sidebar-manage-project-"]').first().click();
      await page.keyboard.press("Escape");
      await expect(
        page
          .getByTestId("sidebar-project-list")
          .getByTestId(`sidebar-chat-row-${getServerId()}:${workspace.agentId}`),
      ).toBeVisible();
      await page.reload();
      await expect(
        page
          .getByTestId("sidebar-project-list")
          .getByTestId(`sidebar-chat-row-${getServerId()}:${workspace.agentId}`),
      ).toBeVisible();

      const projectFolderId = await page
        .locator('[data-testid^="sidebar-project-folder-"]')
        .getAttribute("data-testid");
      expect(projectFolderId).not.toBeNull();
      const projectViewKey = projectFolderId!.replace("sidebar-project-folder-", "");
      await page.evaluate(
        (projectFilters) => {
          localStorage.setItem(
            "sidebar-view",
            JSON.stringify({
              state: {
                groupMode: "project",
                hostFilters: [],
                projectFilters,
                labelFilter: { labels: [] },
              },
              version: 6,
            }),
          );
        },
        [projectViewKey],
      );
      await page.reload();
      await page.getByTestId("sidebar-display-preferences-menu").click();
      await expect(page.getByTestId("sidebar-display-project-filter")).toBeVisible();
      await expect(page.getByTestId("sidebar-display-grouping")).toHaveCount(0);
      await expect(page.getByTestId("sidebar-display-title-source")).toHaveCount(0);
      await expect(page.getByTestId("sidebar-display-show")).toHaveCount(0);
      await page.getByTestId("sidebar-display-project-filter").click();
      await expect(page.getByTestId("sidebar-project-filter-all")).toBeVisible();
      await page.getByTestId("sidebar-project-filter-all").click();
      await page.keyboard.press("Escape");

      await page.locator('[aria-label^="Project actions for "]').click();
      await page.getByRole("menuitem", { name: "Remove from sidebar", exact: true }).click();
      await expect(
        page
          .getByTestId("sidebar-recents-list")
          .getByTestId(`sidebar-chat-row-${getServerId()}:${workspace.agentId}`),
      ).toBeVisible();
      await expectChatSelected(page, workspace.agentId);
    });

    await test.step("pressing a chat opens it", async () => {
      await chatRow(page, second.id).click();

      await expectChatSelected(page, second.id);
      await expect(chatRow(page, workspace.agentId)).toHaveAttribute("aria-selected", "false");
    });

    await test.step("Previous chat and Next chat walk the history", async () => {
      await page.keyboard.press(PREVIOUS_CHAT_SHORTCUT);
      await expectChatSelected(page, workspace.agentId);

      await page.keyboard.press(NEXT_CHAT_SHORTCUT);
      await expectChatSelected(page, second.id);
    });

    await test.step("archiving from the row menu removes the chat after the confirm", async () => {
      const row = chatRow(page, workspace.agentId);
      await row.hover();
      await page.getByTestId(`sidebar-chat-kebab-${getServerId()}:${workspace.agentId}`).click();
      // window.confirm blocks the click that opens it, so the dialog is answered from a listener.
      const confirmMessages: string[] = [];
      page.once("dialog", (dialog) => {
        confirmMessages.push(dialog.message());
        void dialog.accept();
      });
      await page
        .getByTestId(`sidebar-chat-menu-${getServerId()}:${workspace.agentId}-archive`)
        .click();
      expect(confirmMessages).toHaveLength(1);
      expect(confirmMessages[0]).toContain("Archive this chat?");

      await expect(row).toHaveCount(0, { timeout: 15_000 });
      await expect(chatRow(page, second.id)).toBeVisible();
    });
  } finally {
    await workspace.cleanup();
  }
});
