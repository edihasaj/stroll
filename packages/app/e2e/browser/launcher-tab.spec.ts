import { test, expect } from "../support/fixtures";
import type { Locator, Page } from "@playwright/test";
import {
  gotoWorkspace,
  clickNewChat,
  clickNewTerminal,
  getTabTestIds,
  waitForTabBar,
  measureTileTransition,
  terminalSurfaceLocator,
} from "../support/helpers/launcher";
import { expectMainDraft, getMainChatAgentId } from "../support/helpers/workspace-tabs";
import { mainPane, sidePane } from "../support/helpers/side-pane";
import { expectComposerVisible, composerLocator } from "../support/helpers/composer";
import { expectTerminalSurfaceVisible } from "../support/helpers/terminal-perf";
import { seedWorkspace, type SeededWorkspace } from "../support/helpers/seed-client";
import {
  expectTerminalOutputContains,
  seedTerminalProfiles,
  type TerminalProfile,
} from "../support/helpers/new-workspace-launch";
import { gotoAppShell } from "../support/helpers/app";
import { waitForSidebarHydration } from "../support/helpers/workspace-ui";
import { getServerId } from "../support/helpers/server-id";

// ─── Shared state ──────────────────────────────────────────────────────────

let workspace: SeededWorkspace;
let secondWorkspaceId: string | null = null;

const EMPTY_PROMPT_PROFILE: TerminalProfile = {
  id: "e2e-empty-prompt",
  name: "Empty Prompt",
  command: "/bin/sh",
  args: ["-c", 'echo prompt-args: "$#"; exec cat', "profile-name", "{{{prompt}}}"],
};

async function tabTestIds(tabs: Locator): Promise<(string | null)[]> {
  return tabs.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-testid")),
  );
}

// The e2e fixtures pin navigator.platform to Win32, so every chord here is a Ctrl chord even when the
// suite runs on a Mac host.
const NEW_TAB_SHORTCUT = "Control+t";
const SHORTCUT_PREFIX = /Ctrl.*Shift/;

/** The New tab launchers open in the side pane; the main view never holds one as a tab. */
function launcherTabs(page: Page): Locator {
  return page.locator('[data-testid^="workspace-tab-tab_"]').filter({ visible: true });
}

/** The launcher panel shown by the side pane's active New tab. */
function sideLauncherPanel(page: Page): Locator {
  return sidePane(page).getByTestId("workspace-new-tab-panel").filter({ visible: true }).first();
}

/** The launcher menu's trigger in the main view's header (the side pane has its own). */
function mainLauncherTrigger(page: Page): Locator {
  return page.getByTestId("main-pane-header").getByTestId("workspace-new-tab-button");
}

async function openMainLauncherMenu(page: Page): Promise<Locator> {
  await mainLauncherTrigger(page).click();
  const menu = page.getByTestId("workspace-new-tab-menu").filter({ visible: true });
  await expect(menu).toBeVisible();
  return menu;
}

async function openNewTabWithShortcut(page: Page): Promise<void> {
  const before = await launcherTabs(page).count();
  await page.keyboard.press(NEW_TAB_SHORTCUT);
  await expect.poll(() => launcherTabs(page).count()).toBeGreaterThan(before);
  await expect(sideLauncherPanel(page)).toBeVisible();
}

type MainPaneState = "launcher" | "composer" | "blank";

/** Records, on every frame, what the main view shows: the launcher panel, the composer, or nothing. */
async function sampleMainPaneDuring(
  page: Page,
  action: () => Promise<void>,
  durationMs = 2_000,
): Promise<MainPaneState[]> {
  await page.evaluate((duration) => {
    const scope = globalThis as typeof globalThis & { __paseoMainPaneFrames?: string[] };
    scope.__paseoMainPaneFrames = [];
    const startedAt = performance.now();
    const shows = (selector: string) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector)).some(
        (element) => element.getClientRects().length > 0,
      );
    function sample() {
      let state = "blank";
      if (shows('[data-testid="workspace-new-tab-panel"]')) state = "launcher";
      else if (shows('[aria-label="Message agent..."]')) state = "composer";
      scope.__paseoMainPaneFrames?.push(state);
      if (performance.now() - startedAt < duration) {
        requestAnimationFrame(sample);
      }
    }
    sample();
  }, durationMs);
  await action();
  await page.waitForTimeout(durationMs + 100);
  const frames = await page.evaluate(
    () =>
      (globalThis as typeof globalThis & { __paseoMainPaneFrames?: string[] })
        .__paseoMainPaneFrames ?? [],
  );
  return frames as MainPaneState[];
}

test.beforeAll(async () => {
  workspace = await seedWorkspace({ repoPrefix: "launcher-e2e-" });
  const created = await workspace.client.createWorkspace({
    source: { kind: "directory", path: workspace.repoPath, projectId: workspace.projectId },
    title: "launcher-e2e-cmd-t-switch-target",
  });
  if (!created.workspace) {
    throw new Error(created.error ?? "Failed to create secondary workspace for cmd+t switch test");
  }
  secondWorkspaceId = created.workspace.id;
});

test.afterAll(async () => {
  await workspace?.cleanup();
});

// ═══════════════════════════════════════════════════════════════════════════
// Tab Creation Tests
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Tab creation", () => {
  test("Ctrl+T keeps creating a New tab in the side pane after workspace switches", async ({
    page,
  }) => {
    if (!secondWorkspaceId) {
      throw new Error("Secondary workspace was not created");
    }

    const serverId = getServerId();
    const switchWorkspaceRow = async (workspaceId: string) => {
      const row = page.getByTestId(`sidebar-workspace-row-${serverId}:${workspaceId}`).first();
      await expect(row).toBeVisible({ timeout: 30_000 });
      await row.click();
      // The shortcut must follow the route, so prove the route actually moved first.
      await expect(page).toHaveURL(new RegExp(`workspace/${workspaceId}(\\b|/|$)`), {
        timeout: 15_000,
      });
      await waitForTabBar(page);
    };

    await gotoAppShell(page);
    await waitForSidebarHydration(page);

    const sequence = [workspace.workspaceId, secondWorkspaceId];
    for (let i = 0; i < 8; i++) {
      await switchWorkspaceRow(sequence[i % sequence.length]);
      await openNewTabWithShortcut(page);
    }
  });

  test("retained inactive workspaces cannot own New tab shortcuts", async ({ page }) => {
    await gotoWorkspace(page, workspace.workspaceId);
    const workspaceUrl = page.url();
    const newTabCountBefore = await launcherTabs(page).count();

    await page.keyboard.press("Control+Comma");
    await expect(page.getByRole("navigation", { name: "Settings" })).toBeVisible();

    await page.keyboard.press(NEW_TAB_SHORTCUT);

    await page.goto(workspaceUrl);
    await waitForTabBar(page);
    await expect(mainLauncherTrigger(page)).toBeVisible();
    await expect.poll(() => launcherTabs(page).count()).toBe(newTabCountBefore);
  });

  test("opens the menu, then creates independent New tabs without creating agents", async ({
    page,
  }) => {
    await gotoWorkspace(page, workspace.workspaceId);
    await openNewTabWithShortcut(page);
    const newTabs = sidePane(page)
      .locator('[data-testid^="workspace-tab-tab_"]')
      .filter({ hasText: "New tab" });
    await expect(newTabs.first()).toBeVisible();
    const countBefore = await newTabs.count();

    await test.step("opening the launcher menu leaves the current tabs intact", async () => {
      await openMainLauncherMenu(page);
      await expect(newTabs).toHaveCount(countBefore);
      await page.keyboard.press("Escape");
    });
    await test.step("two shortcuts open two independent launchers", async () => {
      await openNewTabWithShortcut(page);
      await expect(newTabs).toHaveCount(countBefore + 1);
      const firstIds = await tabTestIds(newTabs);
      await openNewTabWithShortcut(page);
      await expect(newTabs).toHaveCount(countBefore + 2);
      const ids = await tabTestIds(newTabs);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual(expect.arrayContaining(firstIds));
      await expect(sideLauncherPanel(page)).toBeVisible();
    });
    await test.step("no chat was created", async () => {
      expect(await getMainChatAgentId(page)).toBeNull();
      await expect(sidePane(page).locator('[data-testid^="workspace-tab-agent_"]')).toHaveCount(0);
    });
  });

  test("New tab exposes shortcuts and supports arrow navigation after refocus", async ({
    page,
  }) => {
    await gotoWorkspace(page, workspace.workspaceId);
    await openNewTabWithShortcut(page);

    const panel = sideLauncherPanel(page);
    const agent = panel.getByRole("button", { name: /^Agent/ });
    const terminal = panel.getByRole("button", { name: /^Terminal/ });
    const diff = panel.getByRole("button", { name: /Diff/ });
    await expect(agent).toContainText(new RegExp(`${SHORTCUT_PREFIX.source}.*A`));
    await expect(terminal).toContainText(new RegExp(`${SHORTCUT_PREFIX.source}.*T`));
    await expect(diff).toContainText(new RegExp(`${SHORTCUT_PREFIX.source}.*G`));
    await expect(agent).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(terminal).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(agent).toBeFocused();

    await page.keyboard.press("Control+Shift+e");
    await expect(page.getByTestId("workspace-explorer-sidebar")).toBeVisible();
    await expect(
      page.getByTestId("file-explorer-tree-scroll").filter({ visible: true }),
    ).toBeVisible();

    await page.locator("body").click({ position: { x: 1, y: 1 } });
    await panel.click({ position: { x: 20, y: 20 } });
    await expect(agent).toBeFocused();
  });

  test("clicking New chat starts a draft in the main view, not a tab", async ({ page }) => {
    await gotoWorkspace(page, workspace.workspaceId);

    await clickNewChat(page);

    await expectComposerVisible(page);
    await expectMainDraft(page);

    const tabsAfter = await getTabTestIds(page);
    expect(tabsAfter.filter((id) => id.includes("draft"))).toEqual([]);
  });

  test("clicking terminal button creates a standalone terminal", async ({ page }) => {
    test.setTimeout(45_000);
    await gotoWorkspace(page, workspace.workspaceId);

    await clickNewTerminal(page);

    await expectTerminalSurfaceVisible(page);

    const tabsAfter = await getTabTestIds(page);
    const terminalTabs = tabsAfter.filter((id) => id.includes("terminal"));
    expect(terminalTabs.length).toBeGreaterThanOrEqual(1);
  });

  test("launching a profile from the New tab menu drops its empty prompt argument", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const profileSeed = await seedTerminalProfiles([EMPTY_PROMPT_PROFILE]);

    try {
      await gotoWorkspace(page, workspace.workspaceId);
      const menu = await openMainLauncherMenu(page);
      await menu.getByRole("menuitem", { name: EMPTY_PROMPT_PROFILE.name }).click();

      await expectTerminalOutputContains(page, "prompt-args: 0");
    } finally {
      await profileSeed.restore();
    }
  });

  test("terminal profiles are grouped with a settings action", async ({ page }) => {
    await gotoWorkspace(page, workspace.workspaceId);
    const menu = await openMainLauncherMenu(page);
    await expect(menu.getByText("Terminal profiles", { exact: true })).toBeVisible();

    const editProfiles = menu.getByTestId("workspace-new-tab-menu-edit-terminal-profiles");
    await expect(editProfiles).toHaveAccessibleName("Edit profiles");

    await editProfiles.click();
    await expect(page).toHaveURL(/\/settings\/hosts\/[^/]+\/terminals$/);
  });

  test("Cursor CLI profile uses the Cursor icon in New tab and host settings", async ({ page }) => {
    const guessed: TerminalProfile = {
      id: "e2e-cursor-guessed",
      name: "Cursor guessed",
      command: "cursor-agent",
      args: ["{{{prompt}}}"],
    };
    const explicit: TerminalProfile = {
      ...guessed,
      id: "e2e-cursor-explicit",
      name: "Cursor explicit",
      icon: "cursor",
    };
    const profileSeed = await seedTerminalProfiles([guessed, explicit]);

    try {
      await gotoWorkspace(page, workspace.workspaceId);
      const menu = await openMainLauncherMenu(page);
      const menuIconPath = (name: string) =>
        menu
          .getByRole("menuitem", { name })
          .evaluate((element) => element.querySelector("svg path")?.getAttribute("d") ?? null);
      const guessedMenuPath = await menuIconPath(guessed.name);
      const explicitMenuPath = await menuIconPath(explicit.name);

      await menu.getByTestId("workspace-new-tab-menu-edit-terminal-profiles").click();
      await expect(page).toHaveURL(/\/settings\/hosts\/[^/]+\/terminals$/);

      const settingsIconPath = (id: string) =>
        page
          .getByTestId(`terminal-profile-row-${id}`)
          .evaluate((element) => element.querySelector("svg path")?.getAttribute("d") ?? null);
      const guessedSettingsPath = await settingsIconPath(guessed.id);
      const explicitSettingsPath = await settingsIconPath(explicit.id);

      expect(explicitMenuPath).not.toBeNull();
      expect(explicitSettingsPath).not.toBeNull();
      expect.soft(guessedMenuPath, "New tab Cursor profile icon").toBe(explicitMenuPath);
      expect.soft(guessedSettingsPath, "Settings Cursor profile icon").toBe(explicitSettingsPath);
    } finally {
      await profileSeed.restore();
    }
  });

  test("the main view header shows New chat and the launcher menu", async ({ page }) => {
    await gotoWorkspace(page, workspace.workspaceId);
    await expect(
      page.getByTestId("main-pane-header").getByTestId("main-pane-new-chat"),
    ).toBeVisible();
    await expect(mainLauncherTrigger(page)).toBeVisible();
    await expect(
      page.getByTestId("main-pane-header").getByTestId("workspace-tabs-row"),
    ).toHaveCount(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// No-Flash Transition Tests
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Tab transitions (no flash)", () => {
  test("an empty workspace opens on the new-chat composer and never shows the launcher in main", async ({
    page,
    withWorkspace,
  }) => {
    const isolatedWorkspace = await withWorkspace({ prefix: "launcher-no-flash-" });
    await isolatedWorkspace.navigateTo();

    await expectMainDraft(page);
    await expectComposerVisible(page);
    await expect(
      mainPane(page).getByTestId("workspace-new-tab-panel").filter({ visible: true }),
    ).toHaveCount(0);
    // The launcher stays one press away in the header menu.
    await expect(mainLauncherTrigger(page)).toBeVisible();
  });

  test("New chat from a draft keeps the composer on screen with no blank frame", async ({
    page,
    withWorkspace,
  }) => {
    const isolatedWorkspace = await withWorkspace({ prefix: "launcher-no-flash-new-chat-" });
    await isolatedWorkspace.navigateTo();
    await expectMainDraft(page);

    const frames = await sampleMainPaneDuring(page, () => clickNewChat(page));

    expect(frames).not.toContain("blank");
    expect(frames).not.toContain("launcher");
    await expectMainDraft(page);
  });

  test("Terminal transition completes within visual budget", async ({ page }) => {
    test.setTimeout(30_000);
    await gotoWorkspace(page, workspace.workspaceId);

    const elapsed = await measureTileTransition(
      page,
      () => clickNewTerminal(page),
      terminalSurfaceLocator(page),
      20_000,
    );

    // Terminal surface should appear within a reasonable budget.
    // Note: terminal creation involves a server round-trip, so we allow more time
    // than a pure in-memory transition, but it should still be well under 5 seconds.
    expect(elapsed).toBeLessThan(5_000);
  });

  test("New agent tab click shows composer without flash", async ({ page }) => {
    await gotoWorkspace(page, workspace.workspaceId);

    const elapsed = await measureTileTransition(
      page,
      () => clickNewChat(page),
      composerLocator(page),
      10_000,
    );

    // Draft creation is fully in-memory — should be fast
    // We use a generous budget here because CI can be slow, but the key assertion
    // is that no blank/flash frame appears (tested above).
    expect(elapsed).toBeLessThan(3_000);
  });
});
