import { expect, test } from "../support/fixtures";
import { gotoWorkspace, expectTabTitleFits } from "../support/helpers/launcher";
import { seedWorkspace } from "../support/helpers/seed-client";
import { mainPane, sidePane } from "../support/helpers/side-pane";
import {
  ensureExplorerSidebar,
  openFilesPanel,
  waitForWorkspaceTabsVisible,
} from "../support/helpers/workspace-tabs";

function explorerSidebar(page: Parameters<typeof ensureExplorerSidebar>[0]) {
  return page.getByTestId("workspace-explorer-sidebar").filter({ visible: true });
}

/** New tab shortcut. The e2e fixtures pin navigator.platform to Win32, so the chord is Ctrl on every host. */
async function pressNewTabShortcut(page: Parameters<typeof ensureExplorerSidebar>[0]) {
  await page.keyboard.press("Control+t");
}

/** Cmd+T opens the New tab launcher in the side pane, which it creates on demand. */
async function openSidePaneLauncher(page: Parameters<typeof ensureExplorerSidebar>[0]) {
  await pressNewTabShortcut(page);
  await expect(sidePane(page).getByTestId("workspace-new-tab-panel")).toBeVisible({
    timeout: 30_000,
  });
}

async function expectExplorerActiveTabForeground(
  page: Parameters<typeof ensureExplorerSidebar>[0],
) {
  await openFilesPanel(page);
  await openSidePaneLauncher(page);
  const side = sidePane(page);
  await side.hover();
  const activeSideLabel = side
    .getByTestId("workspace-tabs-row")
    .locator('[aria-selected="true"]')
    .getByText("New tab", { exact: true });
  const foreground = await activeSideLabel.evaluate((element) => getComputedStyle(element).color);
  const activeFiles = explorerSidebar(page).getByRole("button", {
    name: "Browse workspace files",
    exact: true,
  });
  await expect(activeFiles).toHaveAttribute("aria-selected", "true");
  await expect(activeFiles.getByText("Files", { exact: true })).toHaveCSS("color", foreground);
}

test.describe("Explorer sidebar", () => {
  test("starts with Files and Changes, switches views, and toggles without changing main", async ({
    page,
  }) => {
    const workspace = await seedWorkspace({ repoPrefix: "explorer-sidebar-defaults-" });

    try {
      await gotoWorkspace(page, workspace.workspaceId);
      await waitForWorkspaceTabsVisible(page);
      // The main view shows one chat and has no tabs; Explorer and the side pane own the rest.
      await expect(mainPane(page).locator('[data-testid^="workspace-tab-"]')).toHaveCount(0);

      const explorer = await ensureExplorerSidebar(page);
      await expect(explorer.getByTestId("workspace-tab-files")).toBeVisible();
      await expect(explorer.getByTestId("workspace-tab-changes_tree")).toBeVisible();
      await expect(explorer.getByTestId("workspace-new-tab-button")).toHaveCount(1);

      await expectExplorerActiveTabForeground(page);
      await expect(explorer.getByTestId("file-explorer-tree-scroll")).toBeVisible();

      await explorer.getByTestId("workspace-tab-changes_tree").click();
      await expect(explorer.getByTestId("changes-tree-panel")).toBeVisible();

      await page.getByTestId("workspace-explorer-toggle").first().click();
      await expect(explorerSidebar(page)).toHaveCount(0);
      await expect(mainPane(page).locator('[data-testid^="workspace-tab-"]')).toHaveCount(0);
    } finally {
      await workspace.cleanup();
    }
  });
});

async function launchExplorerPanel(
  page: Parameters<typeof ensureExplorerSidebar>[0],
  name: string,
) {
  const explorer = explorerSidebar(page);
  await explorer.getByRole("button", { name: "New tab", exact: true }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${name}`) }).click();
  await explorer.getByRole("button", { name: "New tab", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: new RegExp(`^${name}`) })).toHaveCount(0);
  await page.keyboard.press("Escape");
}

async function closeExplorerFilesFromContextMenu(
  page: Parameters<typeof ensureExplorerSidebar>[0],
) {
  const explorer = explorerSidebar(page);
  const files = explorer.getByRole("button", { name: "Browse workspace files", exact: true });
  await files.hover();
  await expect(explorer.getByTestId("workspace-files-close")).toHaveCount(0);
  await explorer.getByTestId("workspace-tab-changes_tree").hover();
  await expect(explorer.getByTestId("workspace-working-diff-close-changes_tree")).toHaveCount(0);
  await files.click({ button: "right", position: { x: 12, y: 13 } });
  await page.getByRole("menuitem", { name: "Close", exact: true }).click();
  await expect(files).toHaveCount(0);
}

async function expectWorkspaceCloseOnHover(page: Parameters<typeof ensureExplorerSidebar>[0]) {
  const tab = sidePane(page)
    .getByTestId("workspace-tabs-row")
    .locator('[data-testid^="workspace-tab-"][aria-selected="true"]');
  const tabTestId = await tab.getAttribute("data-testid");
  const tabId = tabTestId?.replace(/^workspace-tab-/, "");
  // The launcher tab's close button sits in a wrapper that fades in on hover.
  const closeWrapper = sidePane(page).getByTestId(`workspace-new-tab-close-${tabId}`).locator("..");
  await explorerSidebar(page).hover();
  await expect(closeWrapper).toHaveCSS("opacity", "0");
  await tab.hover();
  await expect(closeWrapper).toHaveCSS("opacity", "1");
}

async function closeOtherExplorerTabs(page: Parameters<typeof ensureExplorerSidebar>[0]) {
  const files = explorerSidebar(page).getByRole("button", {
    name: "Browse workspace files",
    exact: true,
  });
  await files.click({ button: "right", position: { x: 12, y: 13 } });
  const confirmation = page.waitForEvent("dialog").then((dialog) => {
    expect(dialog.message()).toContain("close 1 tab");
    return dialog.accept();
  });
  await page.getByRole("menuitem", { name: "Close other tabs", exact: true }).click();
  await confirmation;
}

test("Explorer keeps Files and Changes close actions in the context menu", async ({
  page,
}, testInfo) => {
  const workspace = await seedWorkspace({ repoPrefix: "explorer-shared-tabs-" });
  try {
    await gotoWorkspace(page, workspace.workspaceId);
    await waitForWorkspaceTabsVisible(page);
    const main = mainPane(page);
    const explorer = await ensureExplorerSidebar(page);
    await expectTabTitleFits(page, "Files", { min: 64, max: 90 });

    await test.step("Explorer's + menu excludes terminal profiles; the main view starts chats from its own button", async () => {
      await explorer.getByRole("button", { name: "New tab", exact: true }).click();
      const menu = page.getByTestId("workspace-new-tab-menu").filter({ visible: true });
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: /^Agent/ })).toHaveCount(0);
      await expect(menu.getByRole("menuitem", { name: /^Files/ })).toHaveCount(0);
      await expect(menu.getByRole("menuitem", { name: /^Changes/ })).toHaveCount(0);
      await expect(menu.getByText("Terminal profiles", { exact: true })).toHaveCount(0);
      await expect(menu.getByRole("menuitem", { name: /^Terminal/ })).toBeVisible();
      const entries = await menu.getByRole("menuitem").allTextContents();
      expect(entries.findIndex((entry) => entry.startsWith("Terminal"))).toBeLessThan(
        entries.findIndex((entry) => entry.startsWith("Diff")),
      );
      await page.keyboard.press("Escape");
      await expect(main.getByTestId("main-pane-new-chat")).toBeVisible();
      await main.getByTestId("workspace-new-tab-button").click();
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: /^Agent/ })).toHaveCount(0);
      await expect(menu.getByText("Terminal profiles", { exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
    });

    await test.step("Files and Changes omit X, and + restores Files after context-menu close", async () => {
      await openSidePaneLauncher(page);
      await expectWorkspaceCloseOnHover(page);
      await closeExplorerFilesFromContextMenu(page);
      await launchExplorerPanel(page, "Files");
      await expect(
        explorer.getByRole("button", { name: "Browse workspace files", exact: true }),
      ).toBeVisible();
      await expect(explorer.getByTestId("file-explorer-tree-scroll")).toBeVisible();
    });

    await test.step("standard bulk-close menus affect only Explorer tabs", async () => {
      const sideTabRow = sidePane(page).getByTestId("workspace-tabs-row");
      const sideTabsBefore = await sideTabRow.getByRole("button").count();
      await closeOtherExplorerTabs(page);
      await expect(explorer.getByTestId("workspace-tab-changes_tree")).toHaveCount(0);
      await expect(explorer.getByTestId("workspace-tab-files")).toBeVisible();
      await expect(sideTabRow.getByRole("button")).toHaveCount(sideTabsBefore);
      await launchExplorerPanel(page, "Changes");
      await expect(explorer.getByTestId("changes-tree-panel")).toBeVisible();
    });

    await test.step("Cmd+T opens the launcher in the side pane, never in Explorer", async () => {
      await explorer.getByTestId("workspace-tab-files").click();
      await pressNewTabShortcut(page);
      await expect(
        sidePane(page).getByTestId("workspace-new-tab-panel").filter({ visible: true }),
      ).toBeVisible();
      await expect(explorer.getByTestId("workspace-new-tab-panel")).toHaveCount(0);
    });

    await testInfo.attach("shared-explorer-tabs", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  } finally {
    await workspace.cleanup();
  }
});
