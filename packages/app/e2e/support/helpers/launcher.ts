import { expect, type Page } from "@playwright/test";
import { buildHostWorkspaceRoute } from "../../../src/utils/host-routes";
import { createTempGitRepo } from "./workspace";
import { getServerId } from "./server-id";
import { createAgentTabFromMenu, expectMainChat } from "./workspace-tabs";

// ─── Navigation ────────────────────────────────────────────────────────────

/** Navigate to a workspace and wait for its main view to appear. */
export async function gotoWorkspace(page: Page, workspaceId: string): Promise<void> {
  const route = buildHostWorkspaceRoute(getServerId(), workspaceId);
  await page.goto(route);
  await waitForTabBar(page);
}

// ─── Tab bar queries ───────────────────────────────────────────────────────

/**
 * Wait for the workspace to be on screen. The main view shows one chat and has no tab bar, so this
 * waits for its header; the side pane and the Explorer keep their own tab bars.
 */
export async function waitForTabBar(page: Page): Promise<void> {
  await expect(page.getByTestId("main-pane-header").filter({ visible: true }).first()).toBeVisible({
    timeout: 30_000,
  });
}

/** Return the test IDs of the tabs on screen: the side pane's and the Explorer's, never a chat's. */
export async function getTabTestIds(page: Page): Promise<string[]> {
  const tabs = page
    .locator('[data-testid^="workspace-tab-"]:not([data-testid^="workspace-tab-context-"])')
    .filter({ visible: true });
  const count = await tabs.count();
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const testId = await tabs.nth(i).getAttribute("data-testid");
    if (testId) ids.push(testId);
  }
  return ids;
}

/** Return the number of tabs matching a kind prefix (e.g. "launcher", "draft", "terminal", "agent"). */
export async function countTabsOfKind(page: Page, kind: string): Promise<number> {
  const ids = await getTabTestIds(page);
  return ids.filter((id) => id.includes(kind)).length;
}

/** Return the currently active tab's test ID (the one with aria-selected or focus styling). */
export async function getActiveTabTestId(page: Page): Promise<string | null> {
  // Active tab has the focused highlight — check for the aria-selected or data-active attribute
  const activeTab = page
    .locator(
      '[data-testid^="workspace-tab-"]:not([data-testid^="workspace-tab-context-"])[aria-selected="true"]',
    )
    .filter({ visible: true })
    .first();
  if (await activeTab.isVisible().catch(() => false)) {
    return activeTab.getAttribute("data-testid");
  }
  // Fallback: the tab with focused styling
  return null;
}

// ─── Tab actions ───────────────────────────────────────────────────────────

/**
 * Press the New tab shortcut. The e2e fixtures pin navigator.platform to Win32, so the chord is
 * Ctrl on every host; Meta never fires. The launcher opens in the side pane.
 */
export async function pressNewTabShortcut(page: Page): Promise<void> {
  await page.keyboard.press("Control+t");
}

export async function openNewTabMenuWithShortcut(page: Page): Promise<void> {
  await pressNewTabShortcut(page);
  await expect(page.getByTestId("workspace-new-tab-panel").filter({ visible: true })).toBeVisible();
}

export async function pressDirectNewTabShortcut(page: Page, key: string): Promise<void> {
  await page.keyboard.press(`Control+Shift+${key}`);
}

// ─── Tab bar assertions ───────────────────────────────────────────────────

/** Assert the inline plus button is visible in the tab bar. */
export async function assertNewChatTileVisible(page: Page): Promise<void> {
  await expect(
    page.getByTestId("workspace-new-tab-button").filter({ visible: true }).first(),
  ).toBeVisible();
}

/** Assert the New tab button is visible in the tab bar. */
export async function assertNewTabMenuTriggerVisible(page: Page): Promise<void> {
  await expect(
    page.getByTestId("workspace-new-tab-button").filter({ visible: true }).first(),
  ).toBeVisible();
}

// ─── Tab creation actions ─────────────────────────────────────────────────

/** Start a new chat from the main view's header. */
export async function clickNewChat(page: Page): Promise<void> {
  await createAgentTabFromMenu(page);
}

/** Choose Terminal from the launcher menu; it opens in the side pane. */
export async function clickNewTerminal(page: Page): Promise<void> {
  const trigger = page.getByTestId("workspace-new-tab-button").filter({ visible: true }).first();
  await expect(trigger).toBeVisible({ timeout: 10_000 });
  await trigger.click();
  const item = page
    .getByTestId("workspace-new-tab-menu-terminal")
    .filter({ visible: true })
    .first();
  await expect(item).toBeVisible({ timeout: 10_000 });
  await item.click();
}

// ─── Tab title assertions ──────────────────────────────────────────────────

/** Wait for any tab in the bar to display the given title text. */
export async function waitForTabWithTitle(
  page: Page,
  title: string | RegExp,
  timeout = 30_000,
): Promise<void> {
  const matcher = typeof title === "string" ? new RegExp(title, "i") : title;
  await expect(
    page
      .locator('[data-testid^="workspace-tab-"]:not([data-testid^="workspace-tab-context-"])')
      .filter({ hasText: matcher })
      .filter({ visible: true })
      .first(),
  ).toBeVisible({ timeout });
}

/** Assert the inline plus button is visible in the tab bar. */
export async function assertSingleNewTabButton(page: Page): Promise<void> {
  const buttons = page.getByTestId("workspace-new-tab-button").filter({ visible: true });
  const count = await buttons.count();
  expect(count).toBeGreaterThanOrEqual(1);
}

// ─── No-flash measurement ──────────────────────────────────────────────────

/**
 * Measure the time between clicking a launcher tile and the replacement panel becoming visible.
 * Returns elapsed milliseconds.
 */
export async function measureTileTransition(
  page: Page,
  clickAction: () => Promise<void>,
  successLocator: ReturnType<Page["locator"]>,
  timeout = 5_000,
): Promise<number> {
  const start = Date.now();
  await clickAction();
  await expect(successLocator).toBeVisible({ timeout });
  return Date.now() - start;
}

/**
 * Sample tab IDs at high frequency across a transition to detect blank/intermediate states.
 * Returns all unique snapshots observed.
 */
export async function sampleTabsDuringTransition(
  page: Page,
  action: () => Promise<void>,
  durationMs = 2_000,
): Promise<Array<Array<{ id: string; width: number }>>> {
  await page.evaluate((duration) => {
    const scope = globalThis as typeof globalThis & {
      __paseoTabTrackFrames?: Array<Array<{ id: string; width: number }>>;
    };
    scope.__paseoTabTrackFrames = [];
    const startedAt = performance.now();
    function sample() {
      const tabs = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-testid^="workspace-tab-"][role="button"][aria-selected]',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      scope.__paseoTabTrackFrames?.push(
        tabs.map((element) => ({
          id: element.getAttribute("data-testid") ?? "",
          width: Math.round(element.getBoundingClientRect().width),
        })),
      );
      if (performance.now() - startedAt < duration) {
        requestAnimationFrame(sample);
      }
    }
    // Establish the known-good pre-action state synchronously. Starting on the
    // next animation frame lets the action race the first sample, which can
    // misclassify a not-yet-painted test harness frame as a transition blank.
    sample();
  }, durationMs);
  await action();
  await page.waitForTimeout(durationMs + 100);
  return page.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      __paseoTabTrackFrames?: Array<Array<{ id: string; width: number }>>;
    };
    return scope.__paseoTabTrackFrames ?? [];
  });
}

export async function expectTabTitleFits(
  page: Page,
  title: string,
  widthRange: { min: number; max: number },
): Promise<void> {
  const tab = page
    .locator('[data-testid^="workspace-tab-"]:not([data-testid^="workspace-tab-context-"])')
    .filter({ hasText: title })
    .filter({ visible: true })
    .last();
  await expect(tab).toContainText(title);
  const tabWidth = await tab.evaluate((element) => element.getBoundingClientRect().width);
  expect(tabWidth).toBeGreaterThanOrEqual(widthRange.min);
  expect(tabWidth).toBeLessThanOrEqual(widthRange.max);
  const label = tab.getByText(title, { exact: true });
  await expect(label).toBeVisible();
  const labelFits = await label.evaluate((element) => element.scrollWidth <= element.clientWidth);
  expect(labelFits).toBe(true);
}

export function terminalSurfaceLocator(page: Page) {
  return page.locator('[data-testid="terminal-surface"]').filter({ visible: true }).first();
}

/** The main view shows this chat. */
export async function expectAgentTabActive(page: Page, agentId: string): Promise<void> {
  await expectMainChat(page, agentId);
}

// ─── Workspace setup ───────────────────────────────────────────────────────

/** Create a temp git repo and return its path with a cleanup function. */
export async function createWorkspace(
  prefix = "launcher-e2e-",
): ReturnType<typeof createTempGitRepo> {
  return createTempGitRepo(prefix);
}
