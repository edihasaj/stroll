import { expect, type Locator, type Page } from "@playwright/test";
import { openFileExplorer, openFileFromExplorer } from "./file-explorer";

const APP_SETTINGS_KEY = "@paseo:app-settings";

/**
 * Sets which opens go to the side pane. Call before the page loads; the preferences are read at
 * startup. Files opened from the Explorer go there unless `explorerFiles` is turned off.
 */
export async function preferInSidePane(
  page: Page,
  preferences: Partial<Record<string, boolean>> = {},
): Promise<void> {
  await page.addInitScript(
    ({ settingsKey, openInSidePane }) => {
      localStorage.setItem(settingsKey, JSON.stringify({ openInSidePane }));
    },
    { settingsKey: APP_SETTINGS_KEY, openInSidePane: { explorerFiles: true, ...preferences } },
  );
}

export function mainPane(page: Page): Locator {
  return page.getByTestId("workspace-pane-main").filter({ visible: true });
}

/** The one ordinary pane beside the main pane. The Explorer dock is not a pane. */
export function sidePane(page: Page): Locator {
  return page
    .locator('[data-testid^="workspace-pane-"]:not([data-testid="workspace-pane-main"])')
    .filter({ visible: true });
}

/** Opens a file from the Explorer, which creates the side pane when the preference is on. */
export async function openFileInSidePane(page: Page, fileName: string): Promise<void> {
  await openFileExplorer(page);
  await openFileFromExplorer(page, fileName);
  await expect(sidePane(page)).toHaveCount(1, { timeout: 30_000 });
  await expect(sidePane(page).getByTestId(`workspace-tab-file_${fileName}`)).toBeVisible();
}

/** dnd-kit pointer drag from a tab chip to the middle of a pane. */
export async function dragTabToPane(page: Page, tab: Locator, pane: Locator): Promise<void> {
  const tabBox = await tab.boundingBox();
  const paneBox = await pane.boundingBox();
  if (!tabBox || !paneBox) {
    throw new Error("Cannot drag a tab: the tab or the target pane has no bounding box");
  }
  const startX = tabBox.x + tabBox.width / 2;
  const startY = tabBox.y + tabBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Exceed the 8px PointerSensor activation distance before heading to the target.
  await page.mouse.move(startX + 12, startY + 4);
  await page.mouse.move(paneBox.x + paneBox.width / 2, paneBox.y + paneBox.height / 2, {
    steps: 20,
  });
  await page.mouse.up();
}
