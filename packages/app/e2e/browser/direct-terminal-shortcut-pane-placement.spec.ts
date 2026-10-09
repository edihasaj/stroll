import { expect, test } from "../support/fixtures";
import { clickNewChat, gotoWorkspace } from "../support/helpers/launcher";
import { seedWorkspace } from "../support/helpers/seed-client";
import { mainPane, sidePane } from "../support/helpers/side-pane";
import { waitForWorkspaceTabsVisible } from "../support/helpers/workspace-tabs";

// The e2e fixtures pin navigator.platform to Win32, so the chord is Ctrl on every host.
const NEW_TERMINAL_SHORTCUT = "Control+Shift+t";

test.describe("Direct terminal shortcut pane placement", () => {
  test("opens a terminal in the side pane, never in the main view", async ({ page }) => {
    const workspace = await seedWorkspace({ repoPrefix: "direct-terminal-shortcut-pane-" });

    try {
      await gotoWorkspace(page, workspace.workspaceId);
      await waitForWorkspaceTabsVisible(page);
      await clickNewChat(page);
      await expect(sidePane(page)).toHaveCount(0);

      await page.keyboard.press(NEW_TERMINAL_SHORTCUT);

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
