import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "../support/fixtures";
import { gotoWorkspace } from "../support/helpers/launcher";
import { seedWorkspace } from "../support/helpers/seed-client";
import { expectMainDraft, waitForWorkspaceTabsVisible } from "../support/helpers/workspace-tabs";

function visibleNewTabPanel(page: Page): Locator {
  return page.getByTestId("workspace-new-tab-panel").filter({ visible: true });
}

async function expectLauncherSelection(launcher: Locator, name: string): Promise<void> {
  await expect(launcher.getByRole("button", { name, exact: true })).toBeFocused();
}

async function openExplorerWithKeyboard(page: Page): Promise<Locator> {
  // The e2e fixtures pin navigator.platform to Win32, so the chord is Ctrl on every host.
  await page.keyboard.press("Control+E");
  const explorer = page.getByTestId("workspace-explorer-sidebar").filter({ visible: true });
  await expect(explorer).toBeVisible({ timeout: 30_000 });
  return explorer;
}

test.describe("New tab keyboard launcher", () => {
  test("Cmd+E reveals the repository Changes tree", async ({ page }) => {
    const workspace = await seedWorkspace({ repoPrefix: "explorer-keyboard-" });

    try {
      await gotoWorkspace(page, workspace.workspaceId);
      await waitForWorkspaceTabsVisible(page);

      const explorer = await openExplorerWithKeyboard(page);
      await expect(explorer.getByTestId("workspace-tab-changes_tree")).toBeVisible();
      await expect(explorer.getByTestId("changes-tree-panel")).toBeVisible();
    } finally {
      await workspace.cleanup();
    }
  });

  test("an empty workspace opens on the composer and the launcher supports arrow navigation", async ({
    page,
  }) => {
    const workspace = await seedWorkspace({ repoPrefix: "empty-pane-keyboard-" });

    try {
      await gotoWorkspace(page, workspace.workspaceId);
      await waitForWorkspaceTabsVisible(page);
      await expectMainDraft(page);
      await expect(visibleNewTabPanel(page)).toHaveCount(0);

      // The launcher opens in the side pane and takes keyboard focus.
      await page.keyboard.press("Control+t");
      const launcher = visibleNewTabPanel(page);
      await expect(launcher).toBeVisible({ timeout: 30_000 });
      await expectLauncherSelection(launcher, "Agent");

      await page.keyboard.press("ArrowDown");
      await expectLauncherSelection(launcher, "Terminal");
      await page.keyboard.press("ArrowDown");
      await expectLauncherSelection(launcher, "Diff");
      await page.keyboard.press("Enter");

      await expect(
        page.getByTestId("workspace-tab-working_diff").filter({ visible: true }),
      ).toBeVisible({ timeout: 30_000 });
    } finally {
      await workspace.cleanup();
    }
  });
});
