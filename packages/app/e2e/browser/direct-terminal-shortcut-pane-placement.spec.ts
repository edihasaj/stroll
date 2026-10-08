import { expect, test } from "../support/fixtures";
import {
  clickNewChat,
  gotoWorkspace,
  pressDirectNewTabShortcut,
} from "../support/helpers/launcher";
import { seedWorkspace } from "../support/helpers/seed-client";
import {
  mainPane,
  openFileInSidePane,
  preferInSidePane,
  sidePane,
} from "../support/helpers/side-pane";
import { waitForWorkspaceTabsVisible } from "../support/helpers/workspace-tabs";

test.describe("Direct terminal shortcut pane placement", () => {
  test("opens a terminal in the focused pane", async ({ page }) => {
    await preferInSidePane(page);
    const workspace = await seedWorkspace({ repoPrefix: "direct-terminal-shortcut-pane-" });

    try {
      await gotoWorkspace(page, workspace.workspaceId);
      await waitForWorkspaceTabsVisible(page);
      await clickNewChat(page);
      await openFileInSidePane(page, "README.md");

      await sidePane(page).getByTestId("workspace-tab-file_README.md").click();
      await pressDirectNewTabShortcut(page, "t");

      await expect(sidePane(page).locator('[data-testid^="workspace-tab-terminal_"]')).toHaveCount(
        1,
        { timeout: 30_000 },
      );
      await expect(mainPane(page).locator('[data-testid^="workspace-tab-terminal_"]')).toHaveCount(
        0,
      );
    } finally {
      await workspace.cleanup();
    }
  });
});
