import { expect, test, type Page } from "../support/fixtures";
import {
  expectFileTabOpen,
  openFileExplorer,
  openFileFromExplorer,
} from "../support/helpers/file-explorer";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";

// The e2e fixtures pin navigator.platform to Win32, so the shortcut is Ctrl, not Cmd.
const FULL_VIEW_SHORTCUT = "Control+Shift+B";

function visiblePanes(page: Page) {
  return page.locator('[data-testid^="workspace-pane-"]').filter({ visible: true });
}

function mainPane(page: Page) {
  return page.getByTestId("workspace-pane-main").filter({ visible: true });
}

test("Full view shortcut covers the main pane with the side pane and restores it", async ({
  page,
}) => {
  const workspace = await seedMockAgentWorkspace({
    repoPrefix: "full-view-shortcut-",
    title: "Full view shortcut",
  });

  try {
    await page.setViewportSize({ width: 1400, height: 900 });
    await openAgentRoute(page, {
      workspaceId: workspace.workspaceId,
      agentId: workspace.agentId,
    });

    await test.step("open a file beside the chat", async () => {
      await openFileExplorer(page);
      await openFileFromExplorer(page, "README.md");
      await expectFileTabOpen(page, "README.md");
      await expect(visiblePanes(page)).toHaveCount(2);
      await expect(mainPane(page)).toBeVisible();
      await expect(page.getByTestId("workspace-maximize-pane").first()).toBeVisible();
    });

    await test.step("the shortcut gives the side pane the whole canvas", async () => {
      await page.keyboard.press(FULL_VIEW_SHORTCUT);

      await expect(mainPane(page)).toHaveCount(0);
      await expect(visiblePanes(page)).toHaveCount(1);
      await expect(visiblePanes(page).getByTestId("workspace-tab-file_README.md")).toBeVisible();
      await expect(page.getByTestId("workspace-restore-pane").first()).toBeVisible();
    });

    await test.step("pressing it again brings the chat back beside the side pane", async () => {
      await page.keyboard.press(FULL_VIEW_SHORTCUT);

      await expect(visiblePanes(page)).toHaveCount(2);
      await expect(mainPane(page)).toBeVisible();
      await expect(visiblePanes(page).getByTestId("workspace-tab-file_README.md")).toBeVisible();
      await expect(page.getByTestId("workspace-maximize-pane").first()).toBeVisible();
    });
  } finally {
    await workspace.cleanup();
  }
});
